package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// A declaration Call's Effects request is independent of its DATA result. A
// passive source description supplies neither an actual Call edge nor a binder.
func stagedDeclarationCallEffectsRequest(call, caller *ast.Node) sourceStagedOperationRequest {
	return sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: caller, operation: call, kind: relativeDemandEffects}, consumer: caller, edge: fmt.Sprintf("declaration-call-effects:%d", call.Pos()), use: call, cut: sourceRelativeCut{operation: call, use: call, reading: call}}
}

func validStagedDeclarationCallEffectsRecipe(recipe sourceStagedOperationRecipe) bool {
	source := recipe.declarationCall
	key := recipe.key
	if source == nil || recipe.declarationCallGeneration == nil || !validStagedDataResultCall(*source) || source.kind != relativeDemandEffects || source.legacyInputs || key.operation != source.invocation.operation || key.kind != relativeDemandEffects || key.selector != (sourceStagedOperationSelector{}) || !sourceStagedOccurrenceOwned(key.operation, key.declaration) || !ast.IsIdentifier(key.operation.Expression()) || !ast.IsFunctionDeclaration(source.invocation.declaration) || source.invocation.declaration.Body() == nil || !stagedDeclarationEffectsOwner(source.invocation.declaration, key.declaration) {
		return false
	}
	if recipe.entryLaw != nil || recipe.constructionEffects != nil || recipe.assignment != nil || recipe.hasInstance != nil || recipe.callResult != nil || recipe.memberSource != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.writer != nil || recipe.constructed != nil || recipe.nativeGet != nil || recipe.getter != nil || recipe.returning != nil || recipe.constructedDisposition != nil || len(recipe.writerRequired)+len(recipe.constructedInputs)+len(recipe.constructedGroup)+len(recipe.fieldForwards) != 0 || len(recipe.delta.exposures)+len(recipe.delta.invoked)+len(recipe.delta.relative)+len(recipe.delta.residuals) != 0 || !validAmbientArgumentReads(recipe) {
		return false
	}
	for _, required := range recipe.delta.required {
		operation := required.producer.operation
		if operation == nil || operation == key.operation || required.producer.kind != relativeDemandEffects || required.inputs != nil || required.reading != (sourceStagedOperationKey{}) || required.consumer != key.declaration || required.producer.declaration != key.declaration || required.use != operation || required.cut != (sourceRelativeCut{operation: operation, use: operation, reading: operation}) || enclosingCallableNode(operation) != enclosingCallableNode(key.operation) {
			return false
		}
		eager := operation == key.operation.Expression()
		for _, argument := range restrictedInvocationArguments(key.operation.AsCallExpression()) {
			eager = eager || operation == argument || nodeInside(operation, argument)
		}
		if !eager {
			return false
		}
	}
	return true
}

func cloneStagedDeclarationCall(source *sourceStagedDeclarationCall) *sourceStagedDeclarationCall {
	if source == nil {
		return nil
	}
	copy := *source
	copy.invocation = cloneStagedWriterInvocation(source.invocation)
	copy.ambientReads = append([]sourceAmbientArgumentRead(nil), source.ambientReads...)
	copy.inputConsumerWait = nil
	return &copy
}

func sameStagedDeclarationCall(a, b *sourceStagedDeclarationCall) bool {
	return a == b || a != nil && b != nil && a.kind == b.kind && a.backedge == b.backedge && a.legacyInputs == b.legacyInputs && a.inputs == b.inputs && a.sourceInputs == b.sourceInputs && sameSourceRelativeInvocation(a.invocation, b.invocation) && sameAmbientArgumentReads(a.ambientReads, b.ambientReads)
}

// This predicate admits a source-supported pending child, not its execution.
// The original source owner must describe it anew in this graph. Publication
// additionally requires the collector's actual Call edge and current inputs.
func (work *callableEffectWork) passiveDeclarationCallEffectsReady(recipe sourceStagedOperationRecipe) bool {
	return validStagedDeclarationCallEffectsRecipe(recipe) && recipe.declarationCallGeneration == work.operationGeneration && work.declarationCallObserved[recipe.key] == work.operationGeneration && recipe.delta.extracted && ambientArgumentReadsCurrent(recipe.declarationCall.ambientReads, work.operationGeneration)
}

// currentDeclarationCallEffects uses an existing original collector edge as the
// reached-Call witness. Merely requiring an operation or describing source inputs
// cannot create fieldEdgeOperations, an actual edge or a delivered binder.
func (work *callableEffectWork) currentDeclarationCallEffects(recipe sourceStagedOperationRecipe) (sourceStagedDeclarationCall, bool) {
	if !work.passiveDeclarationCallEffectsReady(recipe) {
		return sourceStagedDeclarationCall{}, false
	}
	caller, known := work.memberNodes[recipe.key.declaration]
	if !known || caller >= len(work.operationFacts) {
		return sourceStagedDeclarationCall{}, false
	}
	fact := &work.operationFacts[caller]
	for _, call := range fact.staged.calls {
		if call.invocation.operation != recipe.key.operation || call.invocation.declaration != recipe.declarationCall.invocation.declaration || call.kind != relativeDemandEffects || call.legacyInputs || call.inputConsumerWait != nil || !validStagedDataResultCall(call) {
			continue
		}
		edge := stagedDeclarationCallEdge(fact.summary.ID, call.invocation)
		if fact.fieldEdgeOperations[edge] != recipe.key.operation {
			continue
		}
		target, exists := work.memberNodes[call.invocation.declaration]
		if !exists {
			continue
		}
		for _, actual := range fact.summary.Calls {
			if actual.ID == edge && actual.Resolved && actual.TargetID == work.operationFacts[target].summary.ID {
				return call, true
			}
		}
	}
	return sourceStagedDeclarationCall{}, false
}

// Canonical source membership and actual invocation retain separate owners.
// This owner only requires/observes the definition. It never adds a CallEdge or
// invokes a body to compensate for a missing original collector contribution.
func (work *callableEffectWork) prepareStagedDeclarationCallEffects(facts []callableFacts, id sourceStagedOperationID) {
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	if !validStagedDeclarationCallEffectsRecipe(recipe) || recipe.declarationCallGeneration != work.operationGeneration || work.declarationCallObserved[state.key] != work.operationGeneration || !ambientArgumentReadsCurrent(recipe.declarationCall.ambientReads, work.operationGeneration) {
		return
	}
	consumer := work.memberNodes[state.key.declaration]
	target, known := work.memberNodes[recipe.declarationCall.invocation.declaration]
	if !known {
		return
	}
	request := stagedDeclarationCallEffectsRequest(state.key.operation, state.key.declaration)
	edge := request.edge + ":body"
	work.requireStagedSummary(facts, consumer, target, edge, request.use, request.cut)
	if len(state.memberActivations) == 0 {
		state.memberActivations = append(state.memberActivations, sourceStagedMemberRequirement{producer: target, edge: edge})
	}
	if facts[target].staged.ready {
		work.observeStagedSummary(facts, consumer, target, edge)
	}
	if operationDeltaSize(recipe.delta) == 0 {
		if recipe.delta.extracted {
			work.publishSourceDisposition(id)
		}
	} else {
		work.publishOperation(id, recipe.delta)
	}
}

func (work *callableEffectWork) declarationCallEffectsAccounted(state *sourceStagedOperationState, recipe sourceStagedOperationRecipe) bool {
	_, reached := work.currentDeclarationCallEffects(recipe)
	if !reached || len(state.memberActivations) != 1 {
		return false
	}
	body := state.memberActivations[0]
	consumer := work.memberNodes[state.key.declaration]
	dependency := work.stagedRequired[sourceStagedDependencyKey{consumer, body.edge}]
	return dependency != nil && !dependency.invalid && !dependency.projectionPending && dependency.producer == body.producer && body.producer < len(work.stagedRevisions) && work.operationFacts[body.producer].staged.ready && dependency.consumed == work.stagedRevisions[body.producer]
}
