package exactcompiler

import (
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Inventory keeps both sides of a possible replacement until its independent
// write obligations close. A declaration candidate is never runtime identity.
func TestSourceCalleeWriteInventoryAlternatives(t *testing.T) {
	for _, row := range []struct {
		name, source string
		bodies       []string
		library      bool
	}{
		{"authored writer", `const box={field:0,run(){this.field=1}};export function invoke(){box.run()}`, []string{"run"}, false},
		{"old and new", `const box={run(){}};box.run=function replacement(){};export function invoke(){box.run()}`, []string{"run", "replacement"}, false},
		{"conditional library", `const box:string[]=[];export function invoke(){box.push('value')}`, nil, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(q *sourceValueQuery, call *ast.Node) {
				view := q.receiverWriteCandidates(call, nil)
				if len(view.dependencies) == 0 {
					t.Fatal("member inventory lost pending interference")
				}
				found := make(map[string]bool)
				library := false
				for _, value := range view.candidates.values {
					if value.node == nil {
						continue
					}
					library = library || standardLibrarySource(ast.GetSourceFileOfNode(value.node))
					if ast.IsFunctionLike(value.node) && value.node.Body() != nil {
						found[callableNameText(value.node.Name())] = true
					}
				}
				for _, body := range row.bodies {
					if !found[body] {
						t.Fatal("MAY inventory removed represented body", body, found)
					}
				}
				if library != row.library {
					t.Fatal("conditional library alternatives", library)
				}
				assertSourceCalleeInventoryReleased(t, q)
			})
		})
	}
}

// Getter inspection is explicitly incomplete. The original fallback retains
// its lookup writes, receiver mapping and independent returned-target uncertainty.
func TestSourceCalleeWriteInventoryGetter(t *testing.T) {
	const source = `declare function foreign():()=>void;const box={field:0,get run(){this.field=1;return foreign()}};export function invoke(){box.run()}`
	withSourceCalleeWriteQuery(t, source, func(q *sourceValueQuery, call *ast.Node) {
		view := q.receiverWriteCandidates(call, nil)
		if len(view.dependencies) == 0 || !view.unknown {
			t.Fatal("lookup obligation or independent returned-target uncertainty lost", len(view.dependencies) != 0, view.unknown)
		}
		if len(view.candidates.environmentEffects) != 0 || len(view.candidates.normalCalls) != 0 || len(view.candidates.accessorMutations) != 0 {
			t.Fatal("inventory executed lookup or manufactured output")
		}
		assertSourceCalleeInventoryReleased(t, q)
	})
}

// Foreign/prototype/setter routes may remain pending or unknown, but inventory
// cannot certify their absence. Their write/effect consumption is still open.
func TestSourceCalleeWriteInventoryUnclosedRoutes(t *testing.T) {
	for _, source := range []string{
		`declare function foreign(value:unknown):void;const box={run(){}};foreign(box);export function invoke(){box.run()}`,
		`const base={run(){}};const box={__proto__:base,run(){}};Object.setPrototypeOf(box,{run(){document.title}});export function invoke(){box.run()}`,
		`declare function foreign(value:unknown):void;const box={field:0,run(){},set other(value:number){this.field=value}};export function install(){foreign(box);box.other=1}export function invoke(){box.run()}`,
	} {
		withSourceCalleeWriteQuery(t, source, func(q *sourceValueQuery, call *ast.Node) {
			view := q.receiverWriteCandidates(call, nil)
			if len(view.dependencies) == 0 && !view.unknown {
				t.Fatal("unclosed mutation route classified complete")
			}
			assertSourceCalleeInventoryReleased(t, q)
		})
	}
}

func TestSourceCalleeWriteInventoryNormalGuard(t *testing.T) {
	withSourceCalleeWriteQuery(t, `const box={run(){}};export function invoke(){box.run()}`, func(q *sourceValueQuery, call *ast.Node) {
		q.dependenciesOnly = false
		before := q.receiverCandidates(call, nil)
		view := q.receiverWriteCandidates(call, nil)
		after := q.receiverCandidates(call, nil)
		if !view.unknown || len(view.dependencies) != 0 || len(view.candidates.values) != 0 {
			t.Fatal("normal query issued source inventory")
		}
		if len(before.values) != len(after.values) || before.opaque != after.opaque || before.valueIncomplete != after.valueIncomplete {
			t.Fatal("inventory changed normal acquisition")
		}
		assertSourceCalleeInventoryReleased(t, q)
	})
}

// Construction proofs and field reads have their own synchronous prerequisites.
// A source-only inventory cannot detach them or consume an older demand under them.
func TestSourceCalleeWriteConstructionContext(t *testing.T) {
	withSourceCalleeWriteQuery(t, `const box={run(){}};export function invoke(){box.run()}`, func(q *sourceValueQuery, call *ast.Node) {
		initial := q.receiverWriteCandidates(call, nil)
		if initial.unknown || len(initial.dependencies) == 0 {
			t.Fatal("ordinary source context did not issue a demand")
		}
		for _, fieldRead := range []bool{false, true} {
			if fieldRead {
				q.constructionFieldRead = &sourceConstructionFieldRead{owner: q}
			} else {
				q.provingConstructionCompletion = true
			}
			if q.definitionWriteInventoryContext() || initial.dependencies[0].live(q) {
				t.Fatal("construction prerequisite escaped into write inspection")
			}
			view := q.receiverWriteCandidates(call, nil)
			if !view.unknown || len(view.candidates.normalCalls) != 0 || len(view.candidates.ownedGets) != 0 {
				t.Fatal("construction context acquired a write verdict or normal output")
			}
			q.provingConstructionCompletion, q.constructionFieldRead = false, nil
			assertSourceCalleeInventoryReleased(t, q)
		}
	})
}

// A carrier's exclusion survives inventory refusal. Its node cannot become a
// raw source object merely because this consumer cannot interpret the carrier.
func TestSourceCalleeWriteInventoryCarrierGuards(t *testing.T) {
	for _, value := range []sourceValue{
		{instance: &sourceConstructedInstance{}}, {number: numberPayload{present: true}},
		{ownedGetRow: &ownedGetRow{}}, {initializerUse: &sourceInitializerUse{}},
		{adapter: &sourceOrdinaryAdapter{}}, {acquired: &sourceObservedValue{}},
		{entrySlot: &ast.Node{}}, {bound: &sourceInvocationBody{}},
		{normal: &sourceNormalValue{}}, {awaited: &sourceNativeInvocation{}},
		{native: &sourceNativeValue{}},
	} {
		if inventorySourceValue(value) {
			t.Fatal("unsupported carrier became plain source syntax")
		}
	}
	if !inventorySourceValue(sourceValue{capture: &acquiredCallableScope{}}) {
		t.Fatal("source capture was discarded")
	}
}

// Map ownership outlives traversal restoration. Candidate scopes
// retain their own correspondence instead of borrowing the restored query.
func TestSourceCalleeWriteInventoryScopeLifetime(t *testing.T) {
	const source = `const box={run(){}};export function invoke(){box.run()}`
	withSourceCalleeWriteQuery(t, source, func(q *sourceValueQuery, call *ast.Node) {
		body := enclosingCallableNode(call)
		bindings := sourceValueBindings{99999: {{node: body}}}
		q.creators = map[*ast.Node]sourceValueCreation{body: {invocation: call}}
		view := q.receiverWriteCandidates(call, bindings)
		if len(view.dependencies) == 0 {
			t.Fatal("missing pending source use")
		}
		bindings[99999] = []sourceValue{{node: call}}
		q.creators[body] = sourceValueCreation{invocation: body}
		check := func(scope acquiredCallableScope) {
			t.Helper()
			if len(scope.bindings[99999]) != 1 || scope.bindings[99999][0].node != body || scope.creators[body].invocation != call {
				t.Fatal("source mapping changed after ambient context mutation")
			}
		}
		for _, demand := range view.dependencies {
			if !demand.supported || demand.cut == nil || demand.cut.use != call || demand.member != call.Expression() {
				t.Fatal("definition-relative cut or member lost")
			}
			check(demand.scope)
			check(demand.cut.scope)
			if len(demand.excludedCalls) != 1 || demand.excludedCalls[0] != call || len(view.dependencies) == 0 {
				t.Fatal("in-progress Call lost its unresolved dependency")
			}
		}
		associated := 0
		for i, value := range view.candidates.values {
			scope, found := view.candidates.callableScopes[i]
			if value.capture != nil {
				scope, found = *value.capture, true
			}
			if found {
				check(scope)
				associated++
			}
		}
		if associated == 0 {
			t.Fatal("candidate scope correspondence lost")
		}
	})
}

func TestSourceCalleeWriteInventoryDemandDomain(t *testing.T) {
	withSourceCalleeWriteQuery(t, `const box={run(){}};export function invoke(){box.run()}`, func(q *sourceValueQuery, call *ast.Node) {
		file := ast.GetSourceFileOfNode(call)
		sources := []*ast.SourceFile{file}
		cut := q.memberWriterReadCut(nil, nil, &accessorCandidates{})
		view := sourceCalleeWriteView{}
		q.calleeWriteInventory = &view
		q.inventoryMemberWrites(call, nil, "run", accessorAcquire, nil, &accessorCandidates{}, sources, cut)
		sources[0] = nil
		cut.use = nil
		if len(view.dependencies) != 1 || view.dependencies[0].sources[0] != file || view.dependencies[0].cut.use != call {
			t.Fatal("source selection or original cut was borrowed")
		}
		q.inputs = &sourceValueInputs{}
		q.inventoryMemberWrites(call, nil, "run", accessorAcquire, nil, &accessorCandidates{}, nil, nil)
		last := view.dependencies[len(view.dependencies)-1]
		if last.supported || !view.unknown || last.scope.bindings != nil {
			t.Fatal("input capability became a detached source context")
		}
		q.inputs, q.calleeWriteInventory = nil, nil
	})
}

// The original member Get supplies the receiver, while the later Call supplies
// the argument. Acquiring the writer's saved scope must preserve both.
func TestMemberWriterReadCutMethodInputs(t *testing.T) {
	const source = `function put(box:{run:(key:string)=>string}){box.run=function(key:string){return key}}
const box={run:(key:string)=>key};put(box);export function invoke(){return box.run('actual')}`
	withSourceCalleeWriteQuery(t, source, func(q *sourceValueQuery, call *ast.Node) {
		revoke, ok := q.beginStagedWriterSource(func(sourceStagedWriterRead) bool { return false })
		if !ok {
			t.Fatal("original writer source unavailable")
		}
		defer revoke()
		delivered := false
		q.stagedWriter.consumeProjection = func(projected sourceStagedWriterProjection) bool {
			for _, alternative := range projected.delta.exposures {
				edge, ok := q.bindStagedWriterMethodInputs(alternative, call)
				if !ok || edge.bound.operation != call || edge.bound.declaration != alternative.endpoint.expression ||
					edge.request.receiver.expression != call.Expression().Expression() ||
					len(edge.request.actuals) != 1 || edge.request.actuals[0].expression != call.AsCallExpression().Arguments.Nodes[0] {
					t.Fatal("original receiver or argument lost at method input delivery")
				}
				delivered = true
			}
			return false
		}
		q.receiverCandidates(call, nil)
		if !delivered {
			t.Fatal("stored method never reached the original invocation binder")
		}
	})
}

func TestSourceCalleeWriteInventoryReaderCarrierRefusal(t *testing.T) {
	withSourceCalleeWriteQuery(t, `const box={run(){}};export function invoke(){box.run()}`, func(q *sourceValueQuery, call *ast.Node) {
		for _, term := range []sourceValue{
			{node: call, initializerUse: &sourceInitializerUse{}},
			{node: call, normal: &sourceNormalValue{}},
		} {
			cut := q.memberWriterReadCut(nil, nil, &accessorCandidates{})
			cut.evaluationScope().bindings[1] = []sourceValue{term}
			view, result := sourceCalleeWriteView{}, accessorCandidates{}
			q.calleeWriteInventory = &view
			q.inventoryMemberWrites(call.Expression(), []string{"run"}, "", accessorAcquire, nil, &result, nil, cut)
			q.calleeWriteInventory = nil
			if !view.unknown || len(view.dependencies) != 1 || view.dependencies[0].supported || view.dependencies[0].scope.bindings != nil || result.opaque || result.valueIncomplete {
				t.Fatal("reader mapping was sealed/resolved before source refusal")
			}
			if cut.scope.bindings[1][0].initializerUse != term.initializerUse || cut.scope.bindings[1][0].normal != term.normal {
				t.Fatal("inventory mutated original reader carrier")
			}
		}
	})
}

// Copied slots must pass selected children through the carrier-aware visitor.
// Passing only node/path would turn unsupported observations into source bodies.
func TestSourceCalleeWriteInventoryCopiedChild(t *testing.T) {
	withSourceCalleeWriteQuery(t, `const box={run(){}};export function invoke(){box.run()}`, func(q *sourceValueQuery, call *ast.Node) {
		body := enclosingCallableNode(call)
		for _, unsupported := range []sourceValue{
			{node: body, acquired: &sourceObservedValue{}},
			{node: body, normal: &sourceNormalValue{}},
			{node: body, native: &sourceNativeValue{}},
		} {
			child := sourceValue{copied: map[string][]sourceValue{"child": {unsupported, {node: body}}}}
			container := sourceValue{copied: map[string][]sourceValue{"slot": {child}}}
			view := sourceCalleeWriteView{}
			q.calleeWriteInventory = &view
			got := q.accessorsAtGetOutput(nil, []string{"slot", "child"}, "", accessorAcquire, nil, nil, nil, nil, nil, container)
			q.calleeWriteInventory = nil
			if !view.unknown || !got.valueIncomplete || len(got.values) != 1 || got.values[0].node != body {
				t.Fatal("nested child lost its exclusion or the known sibling", view.unknown, got.valueIncomplete, len(got.values))
			}
		}
	})
}

func assertSourceCalleeInventoryReleased(t *testing.T, q *sourceValueQuery) {
	t.Helper()
	if q.calleeWriteInventory != nil || q.protectedMember != nil || q.initializing != nil || q.inputs != nil || len(q.active) != 0 {
		t.Fatal("inventory leaked traversal ownership")
	}
}

func withSourceCalleeWriteQuery(t *testing.T, source string, inspect func(*sourceValueQuery, *ast.Node), packageTypes ...string) {
	t.Helper()
	withSourceCalleeWriteQueryStatus(t, source, inspect, false, packageTypes...)
}

// Pending-source controls inspect original producers before their required
// algorithms are migrated. Public behavior controls retain the strict helper.
// Only the causal coverage-gap response is permitted, with no partial artifacts.
func withSourceCalleeWriteQueryStatus(t *testing.T, source string, inspect func(*sourceValueQuery, *ast.Node), allowPending bool, packageTypes ...string) {
	t.Helper()
	const id = "/virtual/callee-write-inventory.ts"
	session := NewSession()
	packageType := ""
	if len(packageTypes) != 0 {
		packageType = packageTypes[0]
	}
	r := session.Execute(Request{Kind: "analyze", ID: id, Source: source, PackageType: packageType, Diagnostics: "semantic"})
	pending := allowPending && strings.HasPrefix(r.Error, "Compiler analysis coverage gap: required staged effect contribution")
	if hasErrorDiagnostic(r.Diagnostics) || r.Error != "" && !pending {
		t.Fatal(r.Error, r.Diagnostics)
	}
	if pending && (r.Code != "" || len(r.Analysis.Callables) != 0) {
		t.Fatal("pending source control received partial artifacts")
	}
	for _, project := range session.projects {
		file := project.program.GetSourceFile(id)
		if file == nil {
			continue
		}
		var call *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) && enclosingCallableNode(node) != nil && enclosingCallableNode(node).Name() != nil && callableNameText(enclosingCallableNode(node).Name()) == "invoke" {
				call = node
			}
			return true
		})
		if call == nil {
			t.Fatal("missing source callee")
		}
		owner := project.callableCache.owner
		q := newSourceDependencyQuery(call, owner.values.checker, owner, enclosingCallableNode(call))
		inspect(q, call)
		return
	}
	t.Fatal("missing source project")
}
