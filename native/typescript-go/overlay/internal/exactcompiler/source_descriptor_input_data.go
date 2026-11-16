package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceDescriptorInputData contains the applied producer's detached source
// alternatives. It is not an acquired value or permission to restore creating
// inputs. A reader must still match its exact live factory/cut and deliveries.
// The literal arm describes only this original intrinsic input construction.
type sourceDescriptorInputData struct {
	application  *sourceDescriptorInputApplication // original registered return/input composition, no scope/current token
	request      sourceStagedOperationRequest
	construction bool
	alternatives []sourceStagedOperationAlternative
}

func cloneDescriptorInputData(input sourceDescriptorInputData) sourceDescriptorInputData {
	input.application = cloneDescriptorInputApplication(input.application)
	input.alternatives = cloneOperationDelta(sourceStagedOperationDelta{exposures: input.alternatives}).exposures
	return input
}

func sameDescriptorInputData(a, b sourceDescriptorInputData) bool {
	return sameDescriptorInputApplication(a.application, b.application) && a.construction == b.construction && sameOperationRequest(a.request, b.request) && len(a.alternatives) == len(b.alternatives) && operationPrefix(a.alternatives, b.alternatives, sameOperationAlternative)
}

// descriptorActualDataRequest names the existing original operand producer.
// Literal construction is distinct from a lexical/Call/Get DATA delivery; its
// source endpoint is licensed by the original actual and Call Effects, not by
// lookup under a later reader's bindings or by native inertness of the result.
func descriptorActualDataRequest(source *sourceStagedDescriptorRetrieval, position int) (sourceStagedOperationRequest, bool) {
	actual := source.actuals[position].expression
	caller := source.request.producer.declaration
	if ast.IsIdentifier(actual) {
		return stagedBindingResultRequest(actual, caller), false
	}
	if stagedResultExpression(actual) {
		return stagedResultSourceRequest(actual, caller, nil), false
	}
	return sourceStagedOperationRequest{}, stagedSourceDataValue(actual)
}

func validDescriptorInputData(source *sourceStagedDescriptorRetrieval, position int, input sourceDescriptorInputData) bool {
	if source == nil || position < 0 || position >= len(source.actuals) {
		return false
	}
	if input.application != nil {
		return validDescriptorInputApplication(input.application, input) && input.application.generation == source.generation && validDescriptorInputData(source, position, *input.application.prior)
	}
	request, construction := descriptorActualDataRequest(source, position)
	if !sameOperationRequest(request, input.request) || construction != input.construction {
		return false
	}
	if construction {
		return len(input.alternatives) == 1 && input.alternatives[0].creating == nil && sameOperationEndpoint(input.alternatives[0].endpoint, source.actuals[position])
	}
	return request.producer.operation != nil && len(input.alternatives) != 0
}

// descriptorInputData captures an actually applied, locally extracted source delivery.
// The owning view reader separately requires full dependency closure.
// The descriptive source/creating associations are copied without evaluating an
// old actual expression in this operation or any future reader context.
func (work *callableEffectWork) descriptorInputData(source *sourceStagedDescriptorRetrieval, position int) (sourceDescriptorInputData, bool) {
	if source == nil || position < 0 || position >= len(source.actuals) || source.generation != work.operationGeneration {
		return sourceDescriptorInputData{}, false
	}
	request, construction := descriptorActualDataRequest(source, position)
	input := sourceDescriptorInputData{request: request, construction: construction}
	if construction {
		input.alternatives = []sourceStagedOperationAlternative{{endpoint: cloneSourceRelativeEndpoint(source.actuals[position])}}
		return input, true
	}
	if request.producer.operation == nil {
		return input, false
	}
	data, applied := work.stagedCallResultData(request)
	if !applied || !data.delta.extracted || len(data.delta.exposures) == 0 {
		return input, false
	}
	input.alternatives = cloneOperationDelta(sourceStagedOperationDelta{exposures: data.delta.exposures}).exposures
	return input, true
}

// descriptorViewInputDataCurrent never promotes a saved snapshot on ACK.
// Actual DATA producers and their exact currently applied associations must
// still match. Source descriptions preserved in a clone are not deliveries.
func (work *callableEffectWork) descriptorViewInputDataCurrent(view *sourceNativeDescriptorView) bool {
	if view == nil {
		return false
	}
	for position, input := range view.inputs {
		if !work.descriptorInputSnapshotCurrent(&view.source, position, input) {
			return false
		}
	}
	return true
}

func (work *callableEffectWork) descriptorInputSnapshotCurrent(source *sourceStagedDescriptorRetrieval, position int, input sourceDescriptorInputData) bool {
	if !validDescriptorInputData(source, position, input) {
		return false
	}
	if input.application != nil {
		if !work.descriptorInputApplicationCurrent(source, position, input) {
			return false
		}
		for _, reading := range input.application.readings {
			if !work.nativePrimitivePayloadsApplied(work.operationRecipes[reading.producer]) {
				return false
			}
		}
		return true
	}
	current, applied := work.descriptorInputData(source, position)
	if !applied || !sameDescriptorInputData(current, input) {
		return false
	}
	if input.request.producer.operation != nil {
		return work.nativePrimitivePayloadsApplied(work.operationRecipes[input.request.producer])
	}
	return true
}
