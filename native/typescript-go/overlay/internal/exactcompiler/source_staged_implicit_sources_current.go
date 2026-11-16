package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// implicitNativeGetCurrent consumes the genuine complete all-MAY Get only.
// It is deliberately independent of the Call's Effects and whole-entry law.
func (work *callableEffectWork) implicitNativeGetCurrent(source *sourceStagedNativeGetSource) bool {
	proof := work.currentNativeCalleeEffects(source)
	return proof != nil && proof.noUserEntry && work.nativeEffectsGetCurrent(source) && work.nativeWriterCapabilityApplied(nativeRootDebtRequest(source, "callee-get"))
}

// implicitNativeInputCurrent is input acquisition, never fullCall NoWrites.
// The bounded function slice consumes the newly factored original input receipt.
// Freeze's existing same-activation lexical DATA binding has its own current
// producer; evaluating that Identifier does not reexecute its initializer.
func (work *callableEffectWork) implicitNativeInputCurrent(source, original *sourceStagedNativeGetSource) bool {
	if source == nil || !work.implicitNativeGetCurrent(source) {
		return false
	}
	eagerRequest := nativeRootDebtRequest(source, "eager-inputs")
	eager := work.operationRecipes[eagerRequest.producer]
	if !validNativeGetRequest(eager, eagerRequest) || !work.nativeWriterCapabilityApplied(eagerRequest) {
		return false
	}
	if source.kind == sourceNativeObjectDefineProperties {
		return work.nativeEagerPrimitiveCurrent(eager.nativeGet)
	}
	if source.kind != sourceNativeObjectFreeze || original == nil || !work.nativeInputBindingPhaseCurrent(eager) {
		return false
	}
	root, current := work.nativeInputBindingResult(eager)
	return current && sameOperationRequest(root.request, original.request) && work.nativeWriterCapabilityApplied(eager.nativeGet.input.bindingData)
}

func (work *callableEffectWork) implicitMappedNativeCurrent(mapping sourceStagedImplicitFieldMapping, original *sourceStagedNativeGetSource, required []sourceStagedOperationRequest) bool {
	if mapping.kind == implicitFieldMappingForeignCreate && mapping.mapped && len(mapping.required) == 1 && operationContainsRequest(required, mapping.required[0]) {
		reader := work.operationRecipes[mapping.required[0].producer]
		return work.nativeFieldSourceCurrent(reader) && reader.memberSource.nativeFieldGet.nominalCreate && mapping.operation == reader.memberSource.nativeFieldGet.source.producer.operation && sameOperationRequest(mapping.original, reader.memberSource.nativeFieldGet.source)
	}
	if mapping.kind == implicitFieldMappingForeignCalleeLookup && mapping.mapped && len(mapping.required) == 1 && operationContainsRequest(required, mapping.required[0]) {
		reader := work.operationRecipes[mapping.required[0].producer]
		return work.nativeFieldGetCurrent(reader) && mapping.operation == reader.memberSource.nativeFieldGet.get && sameOperationRequest(mapping.original, reader.memberSource.nativeFieldGet.source)
	}
	if !mapping.mapped {
		return false
	}
	source := work.implicitNativeSource(mapping.original)
	if source == nil || !work.implicitNativeGetCurrent(source) {
		return false
	}
	get := nativeRootDebtRequest(source, "callee-get")
	if !operationContainsRequest(required, get) {
		return false
	}
	switch mapping.kind {
	case implicitFieldMappingCalleeLookup:
		return mapping.operation == source.get
	case implicitFieldMappingOriginalDefinition:
		return sameOperationRequest(source.request, original.request) && mapping.operation == original.request.use && work.implicitNativeInputCurrent(source, original)
	case implicitFieldMappingOrdinaryNativeAlgorithm:
		return mapping.operation == source.request.use && work.implicitNativeInputCurrent(source, original)
	default:
		return false // Declared bodies/unclassified sources remain explicit debt.
	}
}

func (work *callableEffectWork) implicitFieldSourcesCurrent(observed *sourceStagedImplicitFieldSources, request sourceStagedOperationRequest, phases *sourceStagedImplicitFieldObservation, original *sourceStagedNativeGetSource) bool {
	if observed == nil || observed.generation != work.operationGeneration || observed.epoch != work.operationEpoch || !sameOperationRequest(observed.request, request) || !observed.accounted || !work.nativeWriterCapabilityApplied(request) {
		return false
	}
	recipe := work.operationRecipes[request.producer]
	if !validNativeGetRequest(recipe, request) || !operationPrefix(observed.required, recipe.delta.required, sameOperationRequest) {
		return false
	}
	for _, mapping := range observed.mappings {
		if !work.implicitMappedNativeCurrent(mapping, original, observed.required) {
			return false
		}
		for _, r := range mapping.required {
			if !operationContainsRequest(observed.required, r) {
				return false
			}
		}
	}
	// Preserve every actual mapping prerequisite. Full source roots and bodies
	// have no empty-set exemption and cannot be certified by Effects extraction.
	for _, r := range observed.required {
		if !work.implicitSourceRequirementCurrent(r, original) {
			return false
		}
	}
	for _, r := range recipe.delta.required {
		if operationContainsRequest(observed.required, r) {
			continue
		}
		isPhase := phases != nil && (phases.has != nil && sameOperationRequest(r, phases.has.coverage) || phases.get != nil && sameOperationRequest(r, phases.get.coverage))
		if !isPhase {
			return false
		}
	}
	return true
}
func (work *callableEffectWork) implicitSourceRequirementCurrent(request sourceStagedOperationRequest, original *sourceStagedNativeGetSource) bool {
	recipe := work.operationRecipes[request.producer]
	if recipe.memberSource != nil && recipe.memberSource.nativeFieldGet != nil {
		return sameOperationRequest(request, recipe.memberSource.request) && work.nativeFieldSourceCurrent(recipe) && work.nativeWriterCapabilityApplied(request)
	}
	source := recipe.nativeGet
	if source == nil || !validNativeGetRequest(recipe, request) {
		return false
	}
	if sameOperationRequest(request, nativeRootDebtRequest(source, "callee-get")) {
		return work.implicitNativeGetCurrent(source)
	}
	if sameOperationRequest(request, nativeRootDebtRequest(source, "eager-inputs")) {
		return work.implicitNativeInputCurrent(source, original)
	}
	return false
}

// implicitCoverageCurrent validates an observed source set at its exact cut.
// Its source-set extraction is NOT an empty-set proof: each nonempty prerequisite
// additionally needs its own typed current semantic owner. Unsupported members
// remain pending rather than being discarded or inferred harmless from X.
func (work *callableEffectWork) implicitCoverageCurrent(request, parent sourceStagedOperationRequest, original *sourceStagedNativeGetSource, phase *sourceStagedImplicitProtocolPhase) bool {
	recipe := work.operationRecipes[request.producer]
	if !validStagedMemberCoverageRecipe(recipe) || recipe.memberSource.generation != work.operationGeneration || !sameOperationRequest(recipe.memberSource.parent, parent) || !sameOperationRequest(recipe.memberSource.request, request) || !recipe.memberSource.coverage.extracted || work.memberCoverageObserved[recipe.key] != work.operationGeneration || !work.nativeWriterCapabilityApplied(request) {
		return false
	}
	for _, r := range recipe.delta.required {
		child := work.operationRecipes[r.producer]
		if child.memberSource != nil {
			if !work.implicitReadProtocolCurrent(child, recipe, r, original, phase) {
				return false
			}
		} else if !work.implicitSourceRequirementCurrent(r, original) {
			return false
		}
	}
	return true
}

// implicitNativeBindingDescription connects only the ALREADY issued lexical
// binding DATA reader to its actual original initializer. It describes a
// conditional source component while the real DATA/Get producer is pending;
// implicitNativeInputCurrent still requires every delivered MAY to be that
// ordinary initializer. Syntax or this description alone cannot pay emptiness.
func (work *callableEffectWork) implicitNativeBindingDescription(source, original *sourceStagedNativeGetSource) bool {
	if source == nil || original == nil || source.kind != sourceNativeObjectFreeze || original.kind != sourceNativeObjectDefineProperties || original.request.consumer == nil || !ast.IsFunctionLike(original.request.consumer) || source.request.consumer != original.request.consumer {
		return false
	}
	eager := work.operationRecipes[nativeRootDebtRequest(source, "eager-inputs").producer]
	if !validNativeInputBindingPhase(eager) {
		return false
	}
	reading := eager.nativeGet.input.bindingData
	recipe := work.operationRecipes[reading.producer]
	return validStagedCallResultRecipe(recipe) && recipe.callResult != nil && recipe.callResult.binding != nil && recipe.callResult.binding.Initializer() == original.request.use && validNativeInputBindingReading(recipe.callResult, reading, eager.nativeGet.input.request.cut)
}

// implicitProtocolSource validates the exact registered source wrapper and C
// context only. Its returned source is not itself a relevance/NoWrites proof.
// Each consumer below requires its own independent current semantic premises.
func (work *callableEffectWork) implicitProtocolSource(recipe, coverage sourceStagedOperationRecipe, request sourceStagedOperationRequest) (*sourceStagedNativeGetSource, sourceStagedOperationRequest, bool) {
	s := recipe.memberSource
	c := coverage.memberSource
	if !validStagedMemberProtocolRecipe(recipe) || !validStagedMemberCoverageRecipe(coverage) || s == nil || c == nil || c.coverage == nil || s.generation != work.operationGeneration || c.generation != work.operationGeneration || s.nativeWriter != nil || s.targetSource != nil || s.hasFreshTarget != nil || s.globalWrite != nil || !sameOperationRequest(s.request, request) || !sameOperationRequest(s.parent, c.parent) || s.candidate.cut != c.coverage.cut || s.candidate.origin != c.coverage.origin || !operationContainsRequest(c.coverage.required, request) || !work.nativeWriterCapabilityApplied(request) {
		return nil, sourceStagedOperationRequest{}, false
	}
	actual := work.operationRecipes[request.producer]
	if !sameStagedMemberSource(s, actual.memberSource) || !operationDeltaPrefix(recipe.delta, actual.delta) || !operationDeltaPrefix(actual.delta, recipe.delta) {
		return nil, sourceStagedOperationRequest{}, false
	}
	p := s.protocolSource
	if p == nil || p.nativeArgument != nil || p.selfRead || p.setEffects || p.get != nil || p.evaluation != nil || p.external != nil || len(recipe.delta.required) != 1 || !sameOperationRequest(recipe.delta.required[0], p.required) {
		return nil, sourceStagedOperationRequest{}, false
	}
	child := work.operationRecipes[p.required.producer]
	source := child.nativeGet
	if source == nil || !validNativeGetRequest(child, p.required) {
		return nil, sourceStagedOperationRequest{}, false
	}
	return source, p.required, true
}

// A lookup keeps its own current all-MAY Get proof. Adjacent phases and Calls
// cannot use this clause, even when their Effects graph is already extracted.
func (work *callableEffectWork) implicitLookupOperationCurrent(recipe sourceStagedOperationRecipe, source *sourceStagedNativeGetSource, required sourceStagedOperationRequest) bool {
	if !sameOperationRequest(required, nativeRootDebtRequest(source, "callee-get")) {
		return false
	}
	for node := source.get; ast.IsPropertyAccessExpression(node) || ast.IsElementAccessExpression(node); node = node.Expression() {
		if node == recipe.memberSource.candidate.operation {
			return work.implicitNativeGetCurrent(source)
		}
	}
	return false
}
func (work *callableEffectWork) implicitLookupSourceCurrent(recipe, coverage sourceStagedOperationRecipe, request sourceStagedOperationRequest) bool {
	source, required, valid := work.implicitProtocolSource(recipe, coverage, request)
	return valid && work.implicitLookupOperationCurrent(recipe, source, required)
}

// The read consumer selects distinct primitive clauses AFTER common contextual
// source validation. No Call is treated as a lookup, or certified from local X.
func (work *callableEffectWork) implicitReadProtocolCurrent(recipe, coverage sourceStagedOperationRecipe, request sourceStagedOperationRequest, original *sourceStagedNativeGetSource, phase *sourceStagedImplicitProtocolPhase) bool {
	source, required, valid := work.implicitProtocolSource(recipe, coverage, request)
	if !valid {
		return false
	}
	if sameOperationRequest(required, nativeRootDebtRequest(source, "callee-get")) {
		return work.implicitLookupOperationCurrent(recipe, source, required)
	}
	return work.implicitFreezeOperationCurrent(recipe, coverage, source, required, original, phase)
}

// Freeze's ordinary-receiver algorithm changes internal integrity attributes,
// not values/getter identity/prototype/keys/enumerability at these specific
// reads. Its Get and argument acquisition are INDEPENDENT current premises.
// The entire Call/algorithm/eager/Throw/creator graph remains closure debt; this
// clause grants neither whole Call NoUser nor a normal result/identity or B.
func (work *callableEffectWork) implicitFreezeOperationCurrent(recipe, coverage sourceStagedOperationRecipe, source *sourceStagedNativeGetSource, required sourceStagedOperationRequest, original *sourceStagedNativeGetSource, phase *sourceStagedImplicitProtocolPhase) bool {
	if source.kind != sourceNativeObjectFreeze || original == nil || source.request.consumer != original.request.consumer || !sameOperationRequest(required, source.request) || recipe.memberSource.candidate.operation != source.request.use || !work.implicitDescriptorReadPhase(coverage, original, phase) {
		return false
	}
	// This exact typed binding DATA relation quantifies all delivered alternatives
	// as the original ordinary initializer. Unknown/Proxy/mixed inputs stay pending;
	// an ordinary-looking result description alone cannot supply this premise.
	return work.implicitNativeInputCurrent(source, original)
}
func (work *callableEffectWork) implicitFreezeSourceCurrent(recipe, coverage sourceStagedOperationRecipe, request sourceStagedOperationRequest, original *sourceStagedNativeGetSource, phase *sourceStagedImplicitProtocolPhase) bool {
	source, required, valid := work.implicitProtocolSource(recipe, coverage, request)
	return valid && work.implicitFreezeOperationCurrent(recipe, coverage, source, required, original, phase)
}
