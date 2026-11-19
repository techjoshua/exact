package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Actual invoked-formal readers must receive DATA through return operands,
// including local binding and formal-forwarding relationships. The factory
// and callback execute once, while the stored callback remains dormant.
func TestStagedReturnOperandSessionAndArtifacts(t *testing.T) {
	for _, row := range []struct {
		name, declarations, argument string
		unknown                      bool
	}{
		{"direct", `function relay(){return factory()}`, `relay()`, true},
		{"binding", `function relay(){const stored=factory();return stored}`, `relay()`, true},
		{"formal", `function identity(callback:()=>()=>string){return callback}function relay(callback:()=>()=>string){return identity(callback)}`, `relay(()=>{window.name;return()=>document.title})`, false},
		{"formal_result", `function identity(callback:()=>()=>string){return callback}function relay(callback:()=>()=>string){return identity(callback)}`, `relay(factory())`, true},
		{"formal_chain", `function identity(callback:()=>()=>string){return callback}function relay(callback:()=>()=>string){return identity(callback)}function forward(callback:()=>()=>string){return relay(callback)}`, `forward(factory())`, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `declare function foreign():void;function factory(){foreign();return()=>{window.name;return()=>document.title}}` + row.declarations + `function consume(callback:()=>()=>string){return callback()}export function invoke(){return consume(` + row.argument + `)}`
			for _, target := range []Target{TargetClient, TargetServer} {
				session := NewSession()
				response := session.Execute(Request{Kind: "compile", ID: "/virtual/return-operands.ts", Source: source, Target: target, Diagnostics: "semantic"})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatalf("%s: %s %#v", target, response.Error, response.Diagnostics)
				}
				filename := filepath.Join(t.TempDir(), "return-operands.mts")
				if err := os.WriteFile(filename, []byte(response.Code), 0600); err != nil {
					t.Fatal(err)
				}
				const runner = `import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';const events=[];globalThis.foreign=()=>events.push('factory');globalThis.window={get name(){events.push('callback');return'known'}};globalThis.document={get title(){events.push('later');return'later'}};const m=await import(pathToFileURL(process.argv[1]).href);const stored=m.invoke();assert.equal(typeof stored,'function');assert.deepEqual(events,process.argv[2]==='formal'?['callback']:['factory','callback']);assert.equal(stored(),'later');assert.equal(events.at(-1),'later');`
				ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, filename, row.name).CombinedOutput()
				cancel()
				if err != nil {
					t.Fatalf("target=%s runtime: %v %s", target, err, output)
				}
			}
		})
	}
}

// A known nested return prefix is delivered while the original Get and all
// canonical body memberships remain pending. Registration is through the same
// occurrence issuer as production, with no supplied result or ready summary.
func TestStagedReturnOperandKnownPrefixAndRequiredChildren(t *testing.T) {
	const source = `declare const choice:boolean;declare const other:{value:()=>string};function factory(){if(choice)return other.value;return()=>window.name}function relay(){return factory()}export function invoke(){return relay()}`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, inner *ast.Node) {
		file := ast.GetSourceFileOfNode(inner)
		facts := stagedReturnSourceFacts(file)
		work := registerCallableEffectWork(facts)
		var outer *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) {
				return true
			}
			if node.Expression().Text() == "relay" {
				outer = node
			}
			caller := work.memberNodes[enclosingCallableNode(node)]
			work.extracting = caller
			if !work.stageSourceDeclarationCall(facts, caller, node, owner) {
				invocation, gap := stageDeclarationCall(&facts[caller], node, owner.checker, owner)
				inputs, bound := bindStagedDeclarationInputs(&facts[caller], invocation, owner)
				target, known := work.memberNodes[invocation.declaration]
				if gap != stagedCallSupported || !bound || !known || !work.deferDeclarationCall(facts, caller, target, inputs.request, inputs) {
					t.Fatal("actual lexical Call association refused", node.Pos())
				}
			}
			return true
		})
		work.extracting = -1
		work.operationGeneration = owner.values.generation
		caller := work.memberNodes[enclosingCallableNode(outer)]
		result, described := work.describeStagedCallResultSource(facts, caller, outer, owner)
		if !described || !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: result.request.producer, callResult: result}) {
			t.Fatal("original result description refused")
		}
		id, required := work.requireOperation(facts, result.request)
		if !required {
			t.Fatal("original result subscriber refused")
		}
		resolveCallableEffectsWithWork(facts, owner, &work)
		delivery, available := work.stagedCallResultData(result.request)
		known := false
		for _, alternative := range delivery.delta.exposures {
			known = known || isWriterInputCallable(alternative.endpoint.expression)
		}
		if !available || !known || delivery.delta.extracted || work.closedOperationDependencies()[id.index] {
			t.Fatalf("nested known prefix or pending closure lost: available=%t known=%t delta=%+v", available, known, delivery.delta)
		}
		operandFound, rawGetFound := false, false
		for _, recipe := range work.operationRecipes {
			if recipe.callResult == nil || recipe.callResult.operand == nil {
				continue
			}
			operandFound = operandFound || recipe.callResult.operand.expression == inner && len(recipe.delta.required) == 1 && !recipe.delta.extracted
			rawGetFound = rawGetFound || ast.IsPropertyAccessExpression(recipe.callResult.operand.expression) && !recipe.delta.extracted
			if !work.currentStagedResultAssociation(facts, recipe.callResult) {
				t.Fatal("original outer creating association lost")
			}
			copied := cloneStagedCallResultSource(recipe.callResult)
			if copied.association.sourceInputs != nil {
				packet := *copied.association.sourceInputs
				copied.association.sourceInputs = &packet
			} else {
				packet := *copied.association.inputs
				copied.association.inputs = &packet
			}
			if work.currentStagedResultAssociation(facts, copied) {
				t.Fatal("copied source packet inherited current association")
			}
		}
		if !operandFound || !rawGetFound {
			t.Fatal("nested Call or independent Get requirement dropped")
		}
		for _, fact := range facts {
			if fact.staged.ready || len(fact.summary.DirectEffectSources) != 0 {
				t.Fatal("DATA projection executed or completed a canonical body")
			}
		}
	})
}
