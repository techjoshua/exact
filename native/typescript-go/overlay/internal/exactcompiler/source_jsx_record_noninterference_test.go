package exactcompiler

import (
	"context"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

type jsxRecordCase struct {
	name, factory, child, host, props, extra   string
	eligible, childWork, late, noMode, interop bool
}

// The producer is a real selected factory return and installed Get. Assertions
// distinguish original profile/C entry from absent or pending child execution.
func TestJSXRecordConstructionOriginalGet(t *testing.T) {
	rows := []jsxRecordCase{
		{name: "p", eligible: true},
		{name: "div", host: "div", eligible: true},
		{name: "string", factory: `return {value:"text"}`, eligible: true},
		{name: "boolean", factory: `return {value:true}`, eligible: true},
		{name: "branded-string", factory: `return {value:("text" as string & {readonly __brand:true})}`, eligible: true},
		{name: "attrs", props: `title="label"`},
		{name: "ref", props: `ref={(node:unknown)=>void node}`},
		{name: "input", host: "input"},
		{name: "component", host: "Part", extra: `function Part(){return <span/>}`},
		{name: "object-child", factory: `return {value:{nested:1}}`},
		{name: "unknown-child", factory: `return {value:undefined as unknown}`},
		{name: "accessor-record", factory: `return {get value(){return value}}`},
		{name: "spread-record", factory: `return {...{},value}`},
		{name: "computed-record", factory: `return {["value"]:value}`},
		{name: "proto-record", factory: `return {__proto__:null,value}`},
		{name: "analysis-mode", noMode: true},
		{name: "interop-mode", interop: true},
		{name: "late-profile", late: true},
		{name: "mutating-call", child: `mutate(select(1).value)`, extra: `function mutate(value:number){document.title;state.count++;return value}`, eligible: true, childWork: true},
		{name: "getter-child", child: `(select(1).value,holder.read)`, extra: `const holder={get read(){document.title;state.count++;return 1}};`, eligible: true, childWork: true},
		{name: "assignment-child", child: `(state.count=select(1).value,document.title.length)`, eligible: true, childWork: true},
		{name: "private-again", eligible: true},
	}
	var retained *projectState
	for _, row := range rows {
		t.Run(row.name, func(t *testing.T) { runJSXRecordCase(t, row, &retained) })
	}
}

func runJSXRecordCase(t *testing.T, row jsxRecordCase, retained **projectState) {
	t.Helper()
	const id = "/virtual/jsx-record-source.tsx"
	const ambientID = "/virtual/jsx-record-types.d.ts"
	const ambient = `declare namespace JSX {interface Element {} interface IntrinsicElements {p:{title?:string;ref?:unknown;children?:unknown};div:{children?:unknown};span:{children?:unknown};input:{children?:unknown}}}`
	factory, child, host := row.factory, row.child, row.host
	if factory == "" {
		factory = `return {value}`
	}
	if child == "" {
		child = `select(1).value`
	}
	if host == "" {
		host = "p"
	}
	source := `/// <reference path="./jsx-record-types.d.ts" />
export{};const state={count:0};function select(value:number){` + factory + `}` + row.extra + `export function Panel(){return()=> <` + host + ` ` + row.props + `>{` + child + `}</` + host + `>;}`
	source += "\n// actual source replacement: " + row.name
	request := Request{Kind: "compile", ID: id, Source: source, Target: TargetClient, Diagnostics: "semantic"}
	if row.noMode {
		request.Kind = "analyze"
	}
	if row.interop {
		request.JSXInterop = &JSXInterop{AdapterModule: "@exactjs/react-compat", AdapterExport: "adaptReactComponent"}
	}
	if *retained == nil {
		project, diagnostics, err := newProjectStateWithSources(request, id, map[string]string{id: source, ambientID: ambient})
		if err != nil || len(diagnostics) != 0 {
			t.Fatal(err, diagnostics)
		}
		*retained = project
	}
	project := *retained
	generation, err := project.advance(context.Background(), id, source)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	if diagnostics := generation.checker.GetDiagnostics(context.Background(), generation.sourceFile); len(diagnostics) != 0 {
		t.Fatal("semantic source setup", diagnostics)
	}
	components := collectComponents(generation.sourceFile)
	profile := describeSourceJSXConstruction(generation, request)
	generation.sourceJSXConstruction = profile
	if row.late {
		generation.sourceJSXConstruction = nil
	}
	cache, _ := prepareProjectCallableContexts(project, generation.sourceFile, generation.checker, components, nil, nil, nil, assetAnalysis{}, nil)
	collection := beginProjectCallableCollection(cache, cache.owner)
	defer collection.close()
	var jsx *ast.Node
	walkNode(generation.sourceFile.AsNode(), func(node *ast.Node) bool {
		if ast.IsJsxElement(node) && enclosingCallableNode(node) != nil && ast.IsArrowFunction(enclosingCallableNode(node)) {
			jsx = node
		}
		return true
	})
	if jsx == nil {
		t.Fatal("missing original host JSX")
	}
	reached, finished := 0, 0
	var work *callableEffectWork
	var application sourceInstalledMemberApplication
	for _, publisher := range cache.owner.pendingMemberPublishers {
		if publisher.workRegistrar == nil || publisher.workRegistrar.installedPhase == nil {
			continue
		}
		original := publisher.workRegistrar.installedPhase
		publisher.workRegistrar.installedPhase = func(q *sourceValueQuery, parent sourceStagedOperationRequest, get *sourceGetInputs, read *sourceMemberWriterReadCut, phase sourceInstalledMemberPhase, key string, receiver sourceRelativeEndpoint) (*sourceInstalledMemberEvent, func(), bool) {
			event, revoke, ok := original(q, parent, get, read, phase, key, receiver)
			if !ok || key != "value" || get == nil || !ast.IsPropertyAccessExpression(get.operation) || !ast.IsCallExpression(get.operation.Expression()) || sourceText(generation.sourceFile, get.operation.Expression().Expression()) != "select" {
				return event, revoke, ok
			}
			reached++
			work = event.work
			application = event.application
			b := q.stagedMember
			finish := b.finish
			b.finish = func(disposition sourceStagedMemberDisposition) bool {
				finished++
				if row.late {
					registered := false
					for _, recipe := range event.work.operationRecipes {
						if source := recipe.memberSource; source != nil && source.candidate.operation == jsx && sameInstalledMemberRequest(source.parent, event.application.request) {
							registered = true
						}
					}
					if !registered {
						t.Fatal("UNREACHED: pre-profile original candidate registration")
					}
					generation.sourceJSXConstruction = profile
					if q.jsxConstructionDisjointFromRecord(jsx, receiver.expression, get, read, event.result) {
						t.Fatal("late profile removed an already registered candidate")
					}
					generation.sourceJSXConstruction = nil
				} else if row.eligible {
					if profile == nil || !profile.profiles[jsx] {
						t.Fatal("UNREACHED: canonical construction classifier at original Get")
					}
					assertJSXRecordScopeRefusers(t, q, event, get, read, jsx, receiver.expression)
				}
				return finish(disposition)
			}
			return event, revoke, ok
		}
	}
	collection.collect()
	collection.resolve(generation.sourceFile)
	if reached == 0 || finished == 0 || work == nil {
		t.Fatal("UNREACHED: original selected factory Get/source disposition")
	}
	var coverage *sourceStagedMemberCoverage
	for _, recipe := range work.operationRecipes {
		if s := recipe.memberSource; s != nil && s.coverage != nil && sameInstalledMemberApplication(s.coverage.installedMember, &application) {
			coverage = s.coverage
		}
	}
	if coverage == nil {
		t.Fatal("UNREACHED: original installed C")
	}
	admitted := false
	otherChildren := 0
	for _, required := range coverage.required {
		if required.producer.selector.occurrence == jsx {
			admitted = true
		} else {
			otherChildren++
		}
	}
	if admitted == row.eligible {
		t.Fatal("own construction admission did not match bounded profile", admitted, row.eligible)
	}
	if row.childWork {
		if otherChildren == 0 {
			t.Fatal("authored child source obligations disappeared")
		}
		browser := false
		for _, fact := range work.operationFacts {
			for _, effect := range fact.summary.DirectEffectSources {
				browser = browser || effect.Environment == "browser"
			}
		}
		if !browser {
			t.Fatal("known browser work in the authored child disappeared")
		}
		childMutation := false
		index := cache.owner.values.index(generation.sourceFile)
		for node := range index.normalOccurrences {
			if ast.IsPostfixUnaryExpression(node) || ast.IsBinaryExpression(node) && node.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
				childMutation = true
			}
		}
		if !childMutation {
			t.Fatal("authored child mutation disappeared from full source index")
		}
	}
	if !row.eligible || row.childWork {
		return
	}
	idSource := work.operationIDs[coverage.request.producer]
	if idSource.index == 0 {
		t.Fatal("UNREACHED: original C adoption")
	}
	state := &work.operations[idSource.index]
	sub := state.subscribers[sourceStagedOperationConsumer{coverage.request.consumer, coverage.request.edge}]
	if !coverage.extracted || state.revision == 0 || !state.delta.extracted || !state.memberCoverageObserved || !work.closedOperationDependencies()[idSource.index] || sub == nil || sub.blocked || sub.consumed != state.revision || sub.applied != state.revision {
		t.Fatal("local original C output/current/APPLIED/closure unpaid")
	}
	// C closure alone does not qualify the Get that observed it. The real
	// original traversal must have captured the nonzero revision it later uses.
	parentID := work.operationIDs[application.request.producer]
	if parentID.epoch != work.operationEpoch || parentID.index == 0 || int(parentID.index) >= len(work.operations) {
		t.Fatal("UNREACHED: original installed parent adoption")
	}
	parent := &work.operations[parentID.index]
	observation := parent.installedMemberObserved
	if observation == nil || observation.self != observation || !observation.accounted || len(observation.required) == 0 || len(observation.required) != len(observation.revisions) {
		t.Fatal("UNREACHED: original accounted installed parent observation")
	}
	capturedC := false
	for i, required := range observation.required {
		if sameOperationRequest(required.request, coverage.request) {
			capturedC = true
			if required.producer != idSource || observation.revisions[i] == 0 || observation.revisions[i] != state.revision {
				t.Fatal("original parent did not observe its actual published C revision")
			}
		}
	}
	if !capturedC || !work.installedMemberOutcomeCurrent(application.request).current {
		t.Fatal("original parent output/current/APPLIED/closure unpaid")
	}
}

// Distinct invalid API consumers may not borrow the genuine event. These checks
// execute once each as refusals, not as tracing or replays of compiler decisions.
func assertJSXRecordScopeRefusers(t *testing.T, q *sourceValueQuery, e *sourceInstalledMemberEvent, get *sourceGetInputs, read *sourceMemberWriterReadCut, jsx, origin *ast.Node) {
	t.Helper()
	copied := *q
	if copied.jsxConstructionDisjointFromRecord(jsx, origin, get, read, e.result) {
		t.Fatal("query copy inherited record authority")
	}
	otherGet := *get
	if q.jsxConstructionDisjointFromRecord(jsx, origin, &otherGet, read, e.result) {
		t.Fatal("Get copy inherited record authority")
	}
	otherRead := *read
	if q.jsxConstructionDisjointFromRecord(jsx, origin, get, &otherRead, e.result) {
		t.Fatal("reader copy inherited record authority")
	}
	if q.jsxConstructionDisjointFromRecord(jsx, get.operation, get, read, e.result) {
		t.Fatal("wrong/DOM/unknown source category accepted")
	}
	before := e.epoch
	e.epoch = &sourceStagedOperationEpoch{}
	accepted := q.jsxConstructionDisjointFromRecord(jsx, origin, get, read, e.result)
	e.epoch = before
	if accepted {
		t.Fatal("foreign epoch inherited record authority")
	}
	saved := q.owner.generation.sourceJSXConstruction
	q.owner.generation.sourceJSXConstruction = nil
	accepted = q.jsxConstructionDisjointFromRecord(jsx, origin, get, read, e.result)
	q.owner.generation.sourceJSXConstruction = saved
	if accepted {
		t.Fatal("missing mode accepted")
	}
	if saved != nil {
		wrong := *saved
		wrong.provider = "different-provider"
		q.owner.generation.sourceJSXConstruction = &wrong
		accepted = q.jsxConstructionDisjointFromRecord(jsx, origin, get, read, e.result)
		q.owner.generation.sourceJSXConstruction = saved
		if accepted {
			t.Fatal("cached syntax crossed current configuration")
		}
		wrong = *saved
		wrong.generation = &projectGeneration{}
		q.owner.generation.sourceJSXConstruction = &wrong
		accepted = q.jsxConstructionDisjointFromRecord(jsx, origin, get, read, e.result)
		q.owner.generation.sourceJSXConstruction = saved
		if accepted {
			t.Fatal("cached syntax crossed generation")
		}
	}
	oldPhase := q.installedMemberPhase
	copiedEvent := *e
	q.installedMemberPhase = &copiedEvent
	accepted = q.jsxConstructionDisjointFromRecord(jsx, origin, get, read, e.result)
	q.installedMemberPhase = oldPhase
	if accepted {
		t.Fatal("event clone inherited original Get authority")
	}

}
