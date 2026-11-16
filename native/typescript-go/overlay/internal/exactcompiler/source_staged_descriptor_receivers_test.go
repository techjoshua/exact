package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// A saved descriptor retains the original Identifier and a distinct subscriber
// per implicit field. DATA delivery does not complete Has/Get or invoke its body.
func TestStagedDescriptorReceiverOriginalSource(t *testing.T) {
	const source = `function factory(){return 0}export function invoke(){const descriptor={value:()=>window.name,enumerable:true};return Object.defineProperty({},'callback',descriptor)}factory()`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, final *ast.Node) {
		facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(final))
		work := registerCallableEffectWork(facts)
		caller := -1
		var call *ast.Node
		for i, fact := range facts {
			if fact.summary.Name == "invoke" {
				caller = i
				call = fact.node.Body().AsBlock().Statements.Nodes[1].AsReturnStatement().Expression
			}
		}
		if caller < 0 {
			t.Fatal("original field consumer absent")
		}
		// The original selected native owner publishes the six pending field roles.
		// Its literal-only eager planner does not yet consume this alias.
		work.describeNativeInputOccurrence(facts, caller, call, owner)
		read := call.AsCallExpression().Arguments.Nodes[2]
		var readings []sourceStagedOperationRequest
		var parents []sourceStagedOperationRequest
		for _, field := range reflectiveDescriptorKeys {
			var parent sourceStagedOperationRequest
			for key, recipe := range work.operationRecipes {
				if recipe.nativeGet != nil && key.operation == call && key.selector.occurrence == read && key.selector.field == field {
					parent = recipe.nativeGet.request
					parent.producer = key
				}
			}
			reading, registered := work.prepareStagedDescriptorReceiver(facts, parent, read, owner)
			if !registered || reading.producer.operation != read || reading.reading != parent.producer || reading.cut.operation != read || reading.cut == parent.cut {
				t.Fatalf("%s original reader association refused", field)
			}
			recipe := work.operationRecipes[parent.producer]
			if !validNativeGetRecipe(recipe) || recipe.delta.extracted || len(recipe.delta.required) != 3 || !sameOperationRequest(recipe.delta.required[2], reading) {
				t.Fatalf("%s lost own/prototype/DATA prerequisites", field)
			}
			again, repeated := work.prepareStagedDescriptorReceiver(facts, parent, read, owner)
			if !repeated || !sameOperationRequest(again, reading) || len(work.operationRecipes[parent.producer].delta.required) != 3 {
				t.Fatal("same reader registration was not idempotent")
			}
			parents = append(parents, parent)
			readings = append(readings, reading)
		}
		if len(work.operationIDs) != 0 || len(facts[caller].staged.operationUses) != 0 || len(facts[caller].summary.Calls) != 0 {
			t.Fatal("passive reader registration activated its parent or callback")
		}
		for i, reading := range readings {
			if i != 0 && sameOperationRequest(readings[0], reading) {
				t.Fatal("field subscribers aliased")
			}
			if _, registered := work.requireOperation(facts, reading); !registered {
				t.Fatal("required DATA reader refused")
			}
		}
		work.prepareOperationUses(facts, owner)
		for i, reading := range readings {
			data, delivered := work.stagedDescriptorReceiverData(facts, parents[i], reading)
			if !delivered || !data.delta.extracted || len(data.delta.exposures) != 1 || data.delta.exposures[0].endpoint.expression != owner.checker.GetSymbolAtLocation(read).ValueDeclaration.Initializer() || data.delta.exposures[0].creating != nil {
				t.Fatalf("field DATA did not preserve original literal endpoint: delivered=%v delta=%+v", delivered, data.delta)
			}
			if work.operationRecipes[parents[i].producer].delta.extracted {
				t.Fatal("DATA substituted for field Has/Get")
			}
		}
		if _, accepted := work.stagedDescriptorReceiverData(facts, parents[1], readings[0]); accepted {
			t.Fatal("mismatched field subscriber accepted")
		}
		copied := append([]callableFacts(nil), facts...)
		if _, accepted := work.prepareStagedDescriptorReceiver(copied, parents[0], read, owner); accepted {
			t.Fatal("copied fact borrowed current owner")
		}
		generation := work.operationGeneration
		work.operationGeneration = &projectGeneration{}
		if _, accepted := work.prepareStagedDescriptorReceiver(facts, parents[0], read, owner); accepted {
			t.Fatal("stale generation accepted")
		}
		if _, accepted := work.stagedDescriptorReceiverData(facts, parents[0], readings[0]); accepted {
			t.Fatal("stale DATA delivered")
		}
		work.operationGeneration = generation
		clone := make([]callableFacts, len(facts))
		for i := range facts {
			clone[i] = cloneProjectCallableFact(facts[i])
		}
		fresh := registerCallableEffectWork(clone)
		if _, accepted := fresh.stagedDescriptorReceiverData(clone, parents[0], readings[0]); accepted {
			t.Fatal("clone inherited a DATA subscriber")
		}
		if len(facts[caller].summary.Calls) != 0 {
			t.Fatal("DATA read invoked dormant descriptor callback")
		}
	})
}
