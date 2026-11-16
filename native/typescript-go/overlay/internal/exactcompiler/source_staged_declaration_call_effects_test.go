package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Describing/requiring a Call is not reaching it. A source-input packet and an
// available declaration cannot replace the original collector's invocation edge.
func TestStagedDeclarationCallEffectsPassiveSource(t *testing.T) {
	const source = `function factory(){return()=>window.name}export function invoke(){return factory()}`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, call *ast.Node) {
		facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(call))
		work := registerCallableEffectWork(facts)
		consumer := work.memberNodes[enclosingCallableNode(call)]
		request, registered := work.registerStagedDeclarationCallEffects(facts, consumer, call, owner)
		if !registered || request.producer.operation != call || request.producer.kind != relativeDemandEffects || request.producer.selector != (sourceStagedOperationSelector{}) || request.inputs != nil {
			t.Fatal("original Effects source registration refused/conflated DATA")
		}
		recipe := work.operationRecipes[request.producer]
		if recipe.declarationCall == nil || recipe.declarationCall.inputs != nil || recipe.declarationCall.sourceInputs == nil || !work.passiveDeclarationCallEffectsReady(recipe) {
			t.Fatal("passive lexical source description lost")
		}
		if len(facts[consumer].staged.calls) != 0 || len(facts[consumer].summary.Calls) != 0 {
			t.Fatal("passive registration manufactured original Call")
		}
		id, required := work.requireOperation(facts, request)
		if !required {
			t.Fatal("source Effects dependency refused")
		}
		work.prepareOperationUses(facts, owner)
		if len(facts[consumer].staged.calls) != 0 || len(facts[consumer].summary.Calls) != 0 {
			t.Fatal("producer preparation activated body")
		}
		if _, reached := work.currentDeclarationCallEffects(work.operationRecipes[request.producer]); reached || work.closedOperationDependencies()[id.index] {
			t.Fatal("unreached source description paid Call closure")
		}
		bodyEdge := request.edge + ":body"
		target := work.memberNodes[recipe.declarationCall.invocation.declaration]
		membership := work.stagedRequired[sourceStagedDependencyKey{consumer, bodyEdge}]
		if membership == nil || membership.producer != target || membership.operation != call || membership.cut != request.cut || membership.consumed != 0 {
			t.Fatal("canonical body membership/cut missing or revision fabricated")
		}
		if _, again := work.registerStagedDeclarationCallEffects(facts, consumer, call, owner); !again {
			t.Fatal("same source description registration is not idempotent")
		}
		delete(work.declarationCallObserved, request.producer)
		if work.passiveDeclarationCallEffectsReady(work.operationRecipes[request.producer]) {
			t.Fatal("cloneable description inherited source observation")
		}
	})
}
