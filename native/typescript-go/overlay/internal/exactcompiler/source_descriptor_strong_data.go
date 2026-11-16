package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

func descriptorTargetStoredRequirementShape(request sourceStagedOperationRequest) bool {
	operation := request.producer.operation
	if operation == nil || request.producer.kind != relativeDemandDirectExposure || request.inputs != nil || request.consumer != request.producer.declaration || !sourceStagedOccurrenceOwned(operation, request.consumer) {
		return false
	}
	if ast.IsIdentifier(operation) {
		return sameOperationRequest(request, stagedBindingResultRequest(operation, request.consumer))
	}
	return stagedResultExpression(operation) && sameOperationRequest(request, stagedResultSourceRequest(operation, request.consumer, nil))
}

// descriptorTargetKnownData retains each actually delivered known sibling even
// when target C or another receiver/RHS alternative is still unsupported. It
// never reports complete coverage from a construction prefix or runtime MAY.
func (work *callableEffectWork) descriptorTargetKnownData(source *sourceStagedNativeGetSource) (*sourceDescriptorTargetData, bool) {
	request := descriptorTargetRequest(source)
	recipe := work.operationRecipes[request.producer]
	id, adopted := work.operationIDs[request.producer]
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || !validDescriptorTargetRecipe(recipe) || !sameNativeGetSource(recipe.descriptorTarget.source, source) || !recipe.descriptorTarget.enumerated || work.operations[id.index].invalid || !work.nativeEffectsGetCurrent(source) {
		return nil, false
	}
	observation := work.operations[id.index].descriptorTargetObservation
	if observation == nil || observation.work != work || observation.epoch != work.operationEpoch || observation.generation != work.operationGeneration || !sameDescriptorTargetSource(observation.source, recipe.descriptorTarget) {
		return nil, false
	}
	for position, input := range recipe.descriptorTarget.inputs {
		if !work.descriptorInputSnapshotCurrent(source.descriptorRead, position, input) {
			return nil, false
		}
	}
	data := &sourceDescriptorTargetData{request: request}
	complete := work.descriptorTargetApplied(request)
	for _, field := range recipe.descriptorTarget.fields {
		receiver, receiverApplied := work.stagedCallResultData(field.receiver)
		if !receiverApplied || !receiver.delta.extracted {
			complete = false
			continue
		}
		matches, represented := descriptorTargetReceiverMatch(receiver.delta.exposures, field.target)
		complete = complete && represented
		if !matches {
			continue
		}
		child, childApplied := work.stagedCallResultData(field.data)
		if !childApplied || !child.delta.extracted {
			complete = false
			continue
		}
		data.fields = append(data.fields, sourceDescriptorTargetFieldData{field: field.field, writer: field.writer, request: field.data, alternatives: cloneOperationDelta(child.delta).exposures})
	}
	return data, complete
}
