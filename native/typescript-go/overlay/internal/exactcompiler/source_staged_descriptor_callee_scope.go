package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// descriptorCalleeRequested identifies a component reading, never a whole-Call
// disposition. It shares the existing detached request/task and APPLIED wake.
func descriptorCalleeRequested(recipe sourceStagedOperationRecipe) bool {
	s := recipe.memberSource
	return s != nil && s.call != nil && s.call.sourceRequest != nil && s.call.sourceRequest.descriptorCallee
}

func nativeWriterScopeRequested(recipe sourceStagedOperationRecipe) bool {
	return nativeWriterSourceRequested(recipe) || descriptorCalleeRequested(recipe)
}

func descriptorCalleeKind(kind sourceNativeKind) bool {
	return kind == sourceNativeObjectDefineProperty || kind == sourceNativeReflectDefineProperty
}

func descriptorCalleeRequestKey(parent sourceStagedOperationRequest, candidate sourceStagedMemberCandidate) sourceStagedOperationRequest {
	return nativeWriterScopeRequestKey(parent, candidate, true)
}

func descriptorCalleeRequirements(source *sourceStagedNativeGetSource) []sourceStagedOperationRequest {
	required := []sourceStagedOperationRequest{source.request, nativeRootDebtRequest(source, "callee-get"), nativeRootDebtRequest(source, "algorithm"), nativeRootDebtRequest(source, "eager-inputs")}
	if source.descriptorGet != nil {
		for _, key := range reflectiveDescriptorKeys {
			field := source.request
			field.producer.selector = sourceStagedOperationSelector{occurrence: source.descriptorGet, field: key}
			required = append(required, field)
		}
	}
	return required
}

func validDescriptorCalleeRequest(d *sourceStagedMemberCallRequest, s *sourceStagedMemberSource) bool {
	if d == nil || !d.descriptorCallee || d.nativeInput || s == nil || s.call == nil || d.generation == nil || d.generation != s.generation || len(d.occurrence.sites)+len(d.occurrence.upstream) != 0 || !sameOperationRequest(d.occurrence.request, s.parent) {
		return false
	}
	call := s.parent.producer.operation
	if call == nil || !ast.IsCallExpression(call) || !ast.IsPropertyAccessExpression(call.Expression()) || s.parent.cut != (sourceRelativeCut{operation: call, use: call, reading: call}) || s.parent.use != call || s.parent.inputs != nil || s.parent.reading != (sourceStagedOperationKey{}) || d.occurrence.receiver != call.Expression().Expression() {
		return false
	}
	candidate := requestedMemberCallCandidate(d.occurrence)
	if !sameStagedMemberCandidate(s.candidate, candidate) || !sameOperationRequest(s.request, descriptorCalleeRequestKey(s.parent, candidate)) || len(d.required) != 0 && len(d.required) != 4 && len(d.required) != 10 {
		return false
	}
	if len(d.required) == 0 {
		return !s.call.complete
	}
	// The selected descriptor pointer is authenticated again by the registered
	// algorithm factory at publication/current consumption, not this description.
	original := &sourceStagedNativeGetSource{request: s.parent, get: call.Expression()}
	if len(d.required) == 10 {
		original.descriptorGet = d.required[4].producer.selector.occurrence
		if original.descriptorGet == nil {
			return false
		}
	}
	expected := descriptorCalleeRequirements(original)
	for i, request := range d.required {
		if !sameOperationRequest(request, expected[i]) {
			return false
		}
	}
	return !s.call.complete || len(d.required) == 10
}

// descriptorCalleeSource consumes the existing selected algorithm admission.
// Inventory eligibility cannot install descriptorGet or an installation relation.
func (work *callableEffectWork) descriptorCalleeSource(recipe sourceStagedOperationRecipe) *sourceStagedNativeGetSource {
	if !descriptorCalleeRequested(recipe) || !validStagedMemberCallRecipe(recipe) || recipe.memberSource.generation != work.operationGeneration {
		return nil
	}
	parent := recipe.memberSource.parent
	root := work.operationRecipes[parent.producer]
	if !validNativeGetRecipe(root) || root.nativeGet == nil || !sameOperationRequest(root.nativeGet.request, parent) || !descriptorCalleeKind(root.nativeGet.kind) {
		return nil
	}
	algorithm := work.operationRecipes[nativeRootDebtRequest(root.nativeGet, "algorithm").producer]
	source := algorithm.nativeGet
	if !validNativeGetRecipe(algorithm) || source == nil || !sameNativeGetSource(source, root.nativeGet) || source.descriptorGet == nil || source.installation == nil || !descriptorCalleeKind(source.kind) {
		return nil
	}
	return source
}

func (work *callableEffectWork) refineDescriptorCalleeRequest(facts []callableFacts, key sourceStagedOperationKey, selected *sourceStagedNativeGetSource) bool {
	prior := work.operationRecipes[key]
	if !descriptorCalleeRequested(prior) || selected == nil || !sameOperationRequest(selected.request, prior.memberSource.parent) {
		return false
	}
	source := work.descriptorCalleeSource(prior)
	if source == nil {
		return false
	}
	required := descriptorCalleeRequirements(source)
	for _, request := range required {
		child, exists := work.operationRecipes[request.producer]
		if !exists || !validNativeGetRecipe(child) || !sameNativeGetSource(child.nativeGet, source) {
			return false
		}
	}
	copy := *prior.memberSource
	call := *copy.call
	description := *call.sourceRequest
	description.required = required
	call.sourceRequest = &description
	// This is precisely callee population, not NoUser entry or field closure.
	call.complete = work.nativeEffectsGetCurrent(source) && work.currentNativeOnlyPopulation(work.operationRecipes[source.request.producer].nativeGet) && work.nativeWriterSourceInvocationApplied(required[1])
	copy.call = &call
	recipe := prior
	recipe.memberSource = &copy
	recipe.delta = sourceStagedOperationDelta{required: required, extracted: call.complete}
	if !validStagedMemberCallRecipe(recipe) || !work.attachOperationSource(facts, recipe) {
		return false
	}
	if call.complete {
		if work.memberCoverageObserved == nil {
			work.memberCoverageObserved = make(map[sourceStagedOperationKey]*projectGeneration)
		}
		work.memberCoverageObserved[key] = work.operationGeneration
	}
	return true
}

func (work *callableEffectWork) descriptorCalleeCurrent(recipe sourceStagedOperationRecipe) bool {
	if work.operationGeneration == nil || !work.operationGeneration.active || !descriptorCalleeRequested(recipe) || work.operationRecipes[recipe.key].memberSource != recipe.memberSource || !recipe.delta.extracted || work.memberCoverageObserved[recipe.key] != work.operationGeneration {
		return false
	}
	source := work.descriptorCalleeSource(recipe)
	if source == nil || !work.nativeEffectsGetCurrent(source) || !work.currentNativeOnlyPopulation(work.operationRecipes[source.request.producer].nativeGet) {
		return false
	}
	required := descriptorCalleeRequirements(source)
	return operationPrefix(required, recipe.memberSource.call.sourceRequest.required, sameOperationRequest) && operationPrefix(recipe.memberSource.call.sourceRequest.required, required, sameOperationRequest) && work.nativeWriterSourceInvocationApplied(required[1])
}

// Local-ready is used only to publish/resume an existing typed reading. Whole
// writer exclusion still uses nativeObserverProducerCurrent, which refuses it.
func (work *callableEffectWork) writerSourceLocallyReady(recipe sourceStagedOperationRecipe) bool {
	return work.descriptorCalleeCurrent(recipe) || work.nativeObserverProducerCurrent(recipe)
}

func (work *callableEffectWork) consumeDescriptorCallee(q *sourceValueQuery, r *sourceWriterInputRequest, id sourceStagedOperationID) sourceStagedWriterCallDisposition {
	// The caller already authenticated the exact live parent, cut and reader.
	producer := work.operationRecipes[r.writerSource.producer]
	if !work.descriptorCalleeCurrent(producer) {
		return sourceStagedWriterCallDisposition{compilerPending: true}
	}
	work.publishNativeObserverProducer(work.operationFacts, id, q.executable)
	delivery, delivered := work.consumeOperation(id, r.writerSourceReading)
	if !delivered || !delivery.delta.extracted || !work.nativeWriterSourceInvocationApplied(r.writerSourceReading) {
		return sourceStagedWriterCallDisposition{compilerPending: true}
	}
	if n := q.stagedNativeGet; n != nil {
		n.selectionRequired = appendEntryLawRequirement(n.selectionRequired, r.writerSourceReading)
		n.selectionRequired = appendEntryLawRequirement(n.selectionRequired, producer.memberSource.parent)
	} else {
		q.stagedMember.selectionRequired = appendEntryLawRequirement(q.stagedMember.selectionRequired, r.writerSourceReading)
		q.stagedMember.selectionRequired = appendEntryLawRequirement(q.stagedMember.selectionRequired, producer.memberSource.parent)
	}
	return sourceStagedWriterCallDisposition{calleeCovered: true}
}
