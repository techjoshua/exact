package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The original reached collector owns creation B, not the input reader. Saved
// identifiers keep their own argument/read cut and borrow the existing original
// binding source relationship without rewriting their syntax into a factory Call.
func TestStagedCapturedCallResultOriginalCreatingInputs(t *testing.T) {
	for _, saved := range []bool{false, true} {
		source := `function factory(cb:()=>string,unused:()=>string){return()=>cb()}function browser(){return window.name}function dormant(){return document.title}function consume(callback:()=>string){return callback()}export function invoke(){return consume(factory(browser,dormant))}`
		if saved {
			source = `function factory(cb:()=>string,unused:()=>string){return()=>cb()}function browser(){return window.name}function dormant(){return document.title}function consume(callback:()=>string){return callback()}export function invoke(){const saved=factory(browser,dormant);return consume(saved)}`
		}
		withStagedReturnProgram(t, source, func(owner *executableBodyOwner, factory *ast.Node) {
			file := ast.GetSourceFileOfNode(factory)
			facts := stagedReturnSourceFacts(file)
			for index := range facts {
				facts[index].callSymbols = make(map[string]ast.SymbolId)
				facts[index].callExpressions = make(map[string]*ast.Node)
			}
			work := registerCallableEffectWork(facts)
			caller := work.memberNodes[enclosingCallableNode(factory)]
			var outer *ast.Node
			walkNode(facts[caller].node.Body(), func(node *ast.Node) bool {
				if ast.IsCallExpression(node) && ast.IsIdentifier(node.Expression()) && node.Expression().Text() == "consume" {
					outer = node
				}
				return true
			})
			work.extracting = caller
			if outer == nil || !work.stageSourceDeclarationCall(facts, caller, outer, owner) || !work.stageReturnedCreation(facts, caller, factory, work.memberNodes, owner) {
				t.Fatal("original collector did not provide Call inputs/creating B")
			}
			work.extracting = -1
			var call sourceStagedDeclarationCall
			var creating *sourceRelativeInputEdge
			for _, original := range facts[caller].staged.calls {
				if original.invocation.operation == outer {
					call = original
				} else if original.invocation.operation == factory {
					creating = original.inputs
				}
			}
			var endpoint sourceRelativeEndpoint
			for _, binding := range call.sourceInputs.bindings.bindings {
				if binding.target.kind == relativeRoleFormal && binding.target.slot == 0 && len(binding.sources) == 1 {
					endpoint = binding.sources[0]
				}
			}
			reading, registered := work.prepareStagedInputCallResult(facts, caller, call, endpoint, owner)
			if !registered || creating == nil || !creating.delivered || reading.producer.operation != endpoint.expression || saved != ast.IsIdentifier(endpoint.expression) {
				t.Fatal("reader changed original endpoint or failed to authenticate original creating B")
			}
			work.prepareOperationUses(facts, owner)
			data, available := work.stagedInputCallResultData(facts, reading)
			if !available || !data.delta.extracted || len(data.delta.exposures) != 1 {
				t.Fatalf("original captured DATA prefix unavailable: saved=%v available=%v delta=%+v", saved, available, data.delta)
			}
			alternative := data.delta.exposures[0]
			if alternative.creating != creating || !work.currentStagedResultCreating(alternative) || alternative.endpoint.creation != factory || alternative.endpoint.cut != creating.request.cut || alternative.endpoint.returning == nil {
				t.Fatal("creating source relationship lost or replaced")
			}
			copy := *creating
			alternative.creating = &copy
			if work.currentStagedResultCreating(alternative) {
				t.Fatal("copied B inherited capture authority")
			}
			if work.closedOperationDependencies()[data.producer.index] {
				t.Fatal("captured DATA paid the uncollected canonical body")
			}
			if saved {
				input := work.operationRecipes[reading.producer].callResult.inputReadings[0]
				if work.operationRecipes[reading.producer].callResult.binding != facts[caller].staged.returnedCreations[0].binding || input.endpoint.expression != endpoint.expression || input.endpoint.cut != endpoint.cut {
					t.Fatal("saved read lost its original binding and argument cuts")
				}
				original := work.operationRecipes[reading.producer].delta.required
				if len(original) != 1 || original[0].producer.operation != factory {
					t.Fatal("binding DATA did not retain original factory producer")
				}

			}
			for _, fact := range facts {
				if fact.staged.ready || len(fact.summary.DirectEffectSources) != 0 {
					t.Fatal("DATA delivery invoked a factory, captured donor or unused callback body")
				}
			}
		})
	}
}
