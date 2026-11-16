package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The original alias DATA becomes a semantic receiver only on the existing
// field subscriber. The original descriptor read and all source debts survive.
func TestStagedDescriptorFieldConsumerOriginalSource(t *testing.T) {
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
		occurrence, described := work.describeNativeInputOccurrence(facts, caller, call, owner)
		if !described {
			t.Fatal("original alias eager/field description missing")
		}
		read := restrictedInvocationArguments(call.AsCallExpression())[2]
		binding := owner.checker.GetSymbolAtLocation(read).ValueDeclaration
		parent := occurrence.source.request
		parent.producer.selector = sourceStagedOperationSelector{occurrence: read, field: "value"}
		id, required := work.requireOperation(facts, parent)
		if !required {
			t.Fatal("original value field not issued")
		}
		work.consumeFieldGetterSource(facts, id, owner)
		if work.operations[id.index].getterSourceRequested || work.operations[id.index].getterRequirementsRegistered {
			t.Fatal("absent DATA sealed field source before delivery")
		}
		before, issued := work.issueFieldEffectsDemand(facts, id, owner)
		if !issued || before.receiver.expression != read {
			t.Fatal("undelivered DATA manufactured a literal receiver")
		}
		if !work.adoptNativeInputOccurrence(facts, occurrence) {
			t.Fatal("original native consumer not adopted")
		}
		work.prepareOperationUses(facts, owner)
		demand, issued := work.issueFieldEffectsDemand(facts, id, owner)
		if !issued || demand.receiver.expression != binding.Initializer() || demand.receiverPending || demand.request.producer.selector.occurrence != read || work.operationRecipes[parent.producer].nativeGet.descriptorGet != read {
			t.Fatal("alias receiver lost original Identifier/request association")
		}
		state := &work.operations[id.index]
		if state.fieldDisposition == nil || state.fieldDisposition.receiver != binding.Initializer() || !state.delta.extracted {
			t.Fatal("actual Has/Get owner did not consume delivered receiver")
		}
		reading := stagedDescriptorReceiverRequest(parent, read)
		retained := false
		for _, child := range work.operationRecipes[parent.producer].delta.required {
			retained = retained || sameOperationRequest(child, reading)
		}
		if !retained || len(work.operationRecipes[parent.producer].delta.required) != 3 {
			t.Fatal("field lost own/prototype/alias DATA prerequisites")
		}
		if len(facts[caller].summary.Calls) != 0 || len(state.getters) != 0 {
			t.Fatal("stored callback was invoked by descriptor DATA/Get")
		}
		copied := append([]callableFacts(nil), facts...)
		copiedDemand, valid := work.issueFieldEffectsDemand(copied, id, owner)
		if valid && copiedDemand.receiver.expression == binding.Initializer() {
			t.Fatal("copied facts borrowed current semantic receiver")
		}
	})
}
