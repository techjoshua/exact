package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceInstalledMutationRHS describes one actual implicit binding's writer
// projection. It is distinct from the ordinary live-Get RHS recipe. The input
// edge is a detached SOURCE description, not permission to install a frame.
type sourceInstalledMutationRHS struct {
	direct          bool
	native          *sourceStagedDescriptorRetrieval
	nativeInputs    [2]sourceDescriptorInputData
	inputRequired   []sourceStagedOperationRequest
	request, parent sourceStagedOperationRequest
	template        sourceMutationWriterTemplate
	binding         *sourceRelativeInputEdge
	bound           sourceRelativeBoundInputs
	projection      sourceStagedWriterProjection
	generation      *projectGeneration
}

func installedMutationRHSRequest(parent sourceStagedOperationRequest, t sourceMutationWriterTemplate, binding *sourceRelativeInputEdge) sourceStagedOperationRequest {
	request := sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: t.region, operation: t.write, kind: relativeDemandDirectExposure, selector: sourceStagedOperationSelector{occurrence: binding.request.operation, association: parent.producer.operation, field: "installed-mutation-rhs"}}, consumer: parent.consumer, use: t.write, cut: t.value.cut, inputs: binding, reading: parent.producer}
	request.edge = fmt.Sprintf("%s:installed-mutation-rhs:%p:%p", parent.edge, t.write, binding.request.operation)
	return request
}

func cloneInstalledMutationRHS(s *sourceInstalledMutationRHS) *sourceInstalledMutationRHS {
	if s == nil {
		return nil
	}
	out := *s
	out.native = cloneDescriptorRetrieval(s.native)
	for position, input := range s.nativeInputs {
		out.nativeInputs[position] = cloneDescriptorInputData(input)
	}
	out.inputRequired = cloneOperationDelta(sourceStagedOperationDelta{required: s.inputRequired}).required
	out.template.value = cloneSourceRelativeEndpoint(s.template.value)
	out.bound = cloneSourceRelativeBoundInputs(s.bound)
	out.projection.delta = cloneOperationDelta(s.projection.delta)
	out.projection.pending = cloneSourceRelativeEndpoints(s.projection.pending)
	return &out
}

func sameInstalledMutationRHS(a, b *sourceInstalledMutationRHS) bool {
	if a != nil && a.binding == nil || b != nil && b.binding == nil {
		return false
	}
	return a == b || a != nil && b != nil && a.generation == b.generation && a.direct == b.direct && sameDescriptorRetrieval(a.native, b.native) && sameDescriptorInputData(a.nativeInputs[0], b.nativeInputs[0]) && sameDescriptorInputData(a.nativeInputs[1], b.nativeInputs[1]) && len(a.inputRequired) == len(b.inputRequired) && operationPrefix(a.inputRequired, b.inputRequired, sameOperationRequest) && a.template.write == b.template.write && a.template.region == b.template.region && sameOperationRequest(a.request, b.request) && sameOperationRequest(a.parent, b.parent) && sameInstalledMemberBoundInputs(a.bound, b.bound) && sameSourceRelativeInputEnvelope(a.binding.request, a.binding.bound) && sameSourceRelativeInputEnvelope(b.binding.request, b.binding.bound) && sameSourceRelativeInvocation(a.binding.request, b.binding.request) && operationDeltaPrefix(a.projection.delta, b.projection.delta) && operationDeltaPrefix(b.projection.delta, a.projection.delta) && len(a.projection.pending) == len(b.projection.pending) && operationPrefix(a.projection.pending, b.projection.pending, sameOperationEndpoint)
}

func validInstalledMutationRHSRecipe(recipe sourceStagedOperationRecipe) bool {
	s := recipe.installedMutationRHS
	if s == nil || s.generation == nil || s.binding == nil || !s.binding.delivered || s.template.generation != s.generation || s.binding.request.declaration != s.template.region || s.bound.declaration != s.template.region || !sameSourceRelativeInputEnvelope(s.binding.request, s.bound) || !sameOperationRequest(s.request, installedMutationRHSRequest(s.parent, s.template, s.binding)) || recipe.key != s.request.producer || s.template.write == nil || !ast.IsBinaryExpression(s.template.write) || s.template.write.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken {
		return false
	}
	write := s.template.write.AsBinaryExpression()
	if write.Left != s.template.left || write.Right != s.template.right || s.template.value.producer != s.template.write || s.template.value.expression != s.template.right || s.template.value.get != s.template.left || !sourceStagedOccurrenceOwned(s.template.write, s.template.region) {
		return false
	}
	if recipe.mutationData != nil || recipe.nativeGet != nil || recipe.memberSource != nil || recipe.writer != nil || recipe.callResult != nil || recipe.installedCall != nil || recipe.installedMember != nil || recipe.descriptorSource != nil || recipe.descriptorTarget != nil || recipe.frameworkEffects != nil || recipe.moduleArgument != nil || recipe.entryLaw != nil || recipe.assignment != nil || recipe.declarationCall != nil || recipe.constructionEffects != nil || recipe.hasInstance != nil || recipe.constructed != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.getter != nil || recipe.returning != nil || len(recipe.delta.invoked)+len(recipe.delta.effects)+len(recipe.delta.relative)+len(recipe.delta.residuals) != 0 || len(recipe.delta.required) == 0 || !sameOperationRequest(recipe.delta.required[0], s.parent) {
		return false
	}
	return operationPrefix(recipe.delta.exposures, s.projection.delta.exposures, sameOperationAlternative) && operationPrefix(s.projection.delta.exposures, recipe.delta.exposures, sameOperationAlternative) && (!recipe.delta.extracted || s.projection.delta.extracted && len(s.projection.pending) == 0)
}

func (work *callableEffectWork) installedMutationRHSCurrent(recipe sourceStagedOperationRecipe) bool {
	if !validInstalledMutationRHSRecipe(recipe) || recipe.installedMutationRHS.generation != work.operationGeneration || work.memberCoverageObserved[recipe.key] != work.operationGeneration {
		return false
	}
	s := recipe.installedMutationRHS
	reader, adopted := work.operationIDs[s.parent.producer]
	if !adopted || reader.epoch != work.operationEpoch || reader.index == 0 || int(reader.index) >= len(work.operations) {
		return false
	}
	for _, getter := range work.operations[reader.index].getters {
		if getter.declaration == s.template.region && getter.inputs == s.binding && getter.bodyTransferred && getter.bodyReady && sameInstalledMemberBoundInputs(getter.inputs.relative, s.bound) {
			return true
		}
	}
	return work.directInstalledMutationRHSCurrent(recipe)
}

// installedMutationRHSData reads the exact original subscriber. Local SOURCE
// delivery remains separate from full native/BODY/RHS dependency closure.
func (work *callableEffectWork) installedMutationRHSData(request sourceStagedOperationRequest) (sourceStagedOperationDelta, bool) {
	id, adopted := work.operationIDs[request.producer]
	recipe := work.operationRecipes[request.producer]
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || !work.installedMutationRHSCurrent(recipe) || !sameOperationRequest(recipe.installedMutationRHS.request, request) {
		return sourceStagedOperationDelta{}, false
	}
	state := &work.operations[id.index]
	sub := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
	if state.invalid || state.revision == 0 || sub == nil || sub.blocked || !sameOperationRequest(sub.request, request) || sub.applied != state.revision {
		return sourceStagedOperationDelta{}, false
	}
	return cloneOperationDelta(state.delta), true
}

func validInstalledMutationRHSReading(recipe sourceStagedOperationRecipe, request sourceStagedOperationRequest) bool {
	return validInstalledMutationRHSRecipe(recipe) && sameOperationRequest(recipe.installedMutationRHS.request, request)
}
