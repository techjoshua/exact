package exactcompiler

import (
	"context"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Each replacement keeps the full original source index. Only positive current
// checker-bound private non-entry removes per-Get obligations; real exposure or
// unknown coverage retains the assignment, reflective and protocol siblings.
func TestStagedPrivateCandidateEligibilityAndGeneration(t *testing.T) {
	const id = "/virtual/private-source-eligibility.tsx"
	const jsxID = "/virtual/private-source-jsx.d.ts"
	const jsxSource = `declare namespace JSX {
interface Element {}
interface IntrinsicElements {
 p: {title?:string;children?:unknown;onClick?:()=>unknown};
 span: {children?:unknown};
 button: {children?:unknown;onClick?:()=>unknown};
}
}`
	const prefix = `/// <reference path="./private-source-jsx.d.ts" />
declare function foreign():void;const box={run:1};`
	const body = `function Install():any{box.run=2;foreign();Object.defineProperty(box,'run',{value:3});return 0}`
	const componentBody = `function Install():any{box.run=2;foreign();Object.defineProperty(box,'run',{value:3});return()=> <span/>}`
	const decoration = `function decoration(){return <><p title="static">text{1}<span/></p></>}`
	const suffix = `export function invoke(){return box.run}`
	rows := []struct {
		name, definition, exposure string
		excluded, refused          bool
	}{
		{"private", body, "", true, false},
		{"implicit-component", componentBody, "", false, false},
		{"component-source-only", componentBody, "", false, false},
		{"private-after-component", body, "", true, false},
		{"direct", body, `Install();`, false, false},
		{"private-again", body, "", true, false},
		{"exported", `export ` + body, "", false, false},
		{"private-after-export", body, "", true, false},
		{"alias", body, `const start=Install;`, false, false},
		{"private-after-alias", body, "", true, false},
		{"escape", body, `declare function retain(value:unknown):void;retain(Install);`, false, false},
		{"callback", body, `export function Panel(){return()=> <button onClick={Install}>go</button>}`, false, false},
		{"component-tag", body, `export function Panel(){return()=> <Install/>}`, false, false},
		{"spread", body, `export function Panel(){return()=> <p {...{onClick:Install}}/>}`, false, false},
		{"jsx-invocation", body, `export function Panel(){return()=> <p>{Install()}</p>}`, false, false},
		{"private-after-jsx", body, "", true, false},
		{"eval", body, `eval('Install()');`, false, true},
		{"unknown-syntax", body, `for(let i=0;i<1;i++){}`, false, true},
		{"final-private", body, "", true, false},
	}
	first := prefix + body + decoration + suffix
	project, diagnostics, err := newProjectStateWithSources(Request{Kind: "analyze", ID: id, Source: first, Diagnostics: "semantic"}, id, map[string]string{id: first, jsxID: jsxSource})
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	for _, row := range rows {
		t.Run(row.name, func(t *testing.T) {
			source := prefix + row.definition + row.exposure + decoration + suffix
			generation, err := project.advance(context.Background(), id, source)
			if err != nil {
				t.Fatal(err)
			}
			defer generation.release()
			if ambient := generation.program.GetSourceFile(jsxID); ambient == nil || !ambient.IsDeclarationFile {
				t.Fatal("real JSX ambient declaration source not loaded")
			}
			if diagnostics := generation.checker.GetDiagnostics(context.Background(), generation.sourceFile); len(diagnostics) != 0 {
				t.Fatal("source semantic preflight", diagnostics)
			}
			owner := newExecutableBodyOwner(project, generation.checker)
			// Real normal inventory publication supplies component identity,
			// including unexported definitions, without invoking their bodies.
			if row.name != "component-source-only" {
				prepareCallableSourceInventory(generation.sourceFile, owner.checker, callableComponentNames(collectComponents(generation.sourceFile)), owner, nil)
			}
			if row.name == "implicit-component" {
				recognized := false
				for definition := range owner.values.components {
					recognized = recognized || callableNameText(definition.Name()) == "Install"
				}
				if !recognized {
					t.Fatal("UNREACHED: genuine private component semantic owner")
				}
			}
			if row.name == "component-source-only" && len(owner.values.components) != 0 {
				t.Fatal("source-only classifier control inherited component metadata")
			}
			assertPrivateCandidateSource(t, owner, generation.sourceFile, row.excluded, row.refused)
		})
	}
}

func assertPrivateCandidateSource(t *testing.T, owner *executableBodyOwner, file *ast.SourceFile, excluded, refused bool) {
	t.Helper()
	var install, read *ast.Node
	var operations []*ast.Node
	walkNode(file.AsNode(), func(node *ast.Node) bool {
		if ast.IsFunctionDeclaration(node) && callableNameText(node.Name()) == "Install" {
			install = node
		}
		if ast.IsPropertyAccessExpression(node) && callableNameText(node.Name()) == "run" && enclosingCallableNode(node) != nil && callableNameText(enclosingCallableNode(node).Name()) == "invoke" {
			read = node
		}
		return true
	})
	if install == nil || read == nil {
		t.Fatal("original source owner/Get absent")
	}
	index := owner.values.index(file)
	if index.privateUses == nil || !index.privateUses.complete || index.privateUses.refused != refused {
		t.Fatal("JSX reference population not covered or dynamic-code refusal lost")
	}
	for _, occurrence := range index.normalOccurrences {
		if occurrence.region == install && (ast.IsCallExpression(occurrence.node) || ast.IsBinaryExpression(occurrence.node) && occurrence.node.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken) {
			operations = append(operations, occurrence.node)
		}
	}
	if len(operations) != 3 {
		t.Fatal("full original assignment/reflective/protocol inventory lost", len(operations))
	}
	facts := stagedReturnSourceFacts(file)
	work := callableEffectWork{extracting: -1}
	work.indexOperationSources(facts)
	caller := work.memberNodes[enclosingCallableNode(read)]
	request, owned := sourceStagedOccurrenceRequest(&facts[caller], read, relativeDemandEffects, "private-source-eligibility")
	if !owned {
		t.Fatal("original Get request absent")
	}
	q := newSourceDependencyQuery(read, owner.checker, owner, facts[caller].node)
	revoke, installed := work.beginStagedMemberWork(q, facts, request)
	if !installed {
		t.Fatal("original Get source interval refused")
	}
	defer revoke()
	q.evaluatedSourceAccessors(read, nil)
	var coverage *sourceStagedMemberCoverage
	retained := map[*ast.Node]bool{}
	for _, recipe := range work.operationRecipes {
		s := recipe.memberSource
		if s == nil || !sameOperationRequest(s.parent, request) {
			continue
		}
		if s.coverage != nil {
			coverage = s.coverage
		}
		if s.candidate.region == install {
			retained[s.candidate.operation] = true
		}
	}
	if coverage == nil {
		t.Fatal("UNREACHED: original source C publication")
	}
	for _, operation := range operations {
		if retained[operation] == excluded {
			t.Fatal("private proof did not govern every admission path", operation.Kind, operation.Pos(), excluded)
		}
		if index.normalOccurrences[operation] == nil {
			t.Fatal("eligibility deleted passive source index")
		}
	}
	if excluded {
		if proof, cached := index.privateUses.proofs[install]; !cached || !proof {
			t.Fatal("positive current-generation private proof was not cached")
		}
	}
	if !excluded {
		return
	} // Independent open producers remain owed; no normal body is invoked.
	if !coverage.extracted || len(coverage.required) != 0 {
		t.Fatal("private source exclusions invented or retained obligations", len(coverage.required))
	}
	if !work.registerOperationUse(facts, sourceStagedOperationUse{request: coverage.request}) {
		t.Fatal("real source C consumer refused")
	}
	work.prepareOperationUses(facts, owner)
	id := work.operationIDs[coverage.request.producer]
	if id.index == 0 || id.epoch != work.operationEpoch {
		t.Fatal("C consumer not adopted")
	}
	state := &work.operations[id.index]
	subscriber := state.subscribers[sourceStagedOperationConsumer{coverage.request.consumer, coverage.request.edge}]
	if state.revision == 0 || !state.delta.extracted || !state.memberCoverageObserved || !work.closedOperationDependencies()[id.index] || subscriber == nil || subscriber.blocked || subscriber.consumed != state.revision || subscriber.applied != state.revision {
		t.Fatal("real local C output/current/APPLIED/closure contract unpaid")
	}
	// Cloning source descriptions cannot inherit this graph's Get observation.
	clones := make([]callableFacts, len(facts))
	for i := range facts {
		clones[i] = facts[i]
		clones[i].staged = cloneCallableExtraction(facts[i].staged)
	}
	fresh := callableEffectWork{extracting: -1, operationGeneration: owner.values.generation}
	fresh.indexOperationSources(clones)
	if !fresh.registerOperationUse(clones, sourceStagedOperationUse{request: coverage.request}) {
		t.Fatal("clone lost descriptive C membership")
	}
	fresh.prepareOperationUses(clones, owner)
	next := fresh.operationIDs[coverage.request.producer]
	if fresh.operations[next.index].memberCoverageObserved || fresh.closedOperationDependencies()[next.index] {
		t.Fatal("clone inherited Get/source currentness")
	}
}
