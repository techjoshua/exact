package exactcompiler

// describeNativeOnlyPopulation recognizes an exact retained native-only Call
// population. This is description eligibility, including after cloning; it
// grants no current Get, result, no-user-entry or invocation authority.
func (work *callableEffectWork) describeNativeOnlyPopulation(source *sourceStagedNativeGetSource) (sourceStagedOperationRequest, bool) {
	if source == nil || nativeMemberCallRequirementCount(source) != 1 || len(source.memberSources) == 0 {
		return sourceStagedOperationRequest{}, false
	}
	request := nativeMemberAlternativeRequest(source, "callee-alternatives")
	if !sameOperationRequest(source.callAlternatives, request) {
		return sourceStagedOperationRequest{}, false
	}
	recipe := work.operationRecipes[request.producer]
	s := recipe.memberSource
	if !validStagedMemberCallRecipe(recipe) || s == nil || !sameOperationRequest(s.request, request) || !sameOperationRequest(s.parent, source.request) || s.candidate.operation != source.request.use || s.candidate.value.expression != source.get || !s.candidate.invoking || !s.candidate.protocol || s.candidate.getContribution || s.candidate.reflective || s.candidate.runtimeUnknown || s.call == nil || !s.call.complete || !recipe.delta.extracted || len(s.call.values)+len(s.call.mapped)+len(s.call.standard)+len(s.call.storage) != 0 || s.call.sourceRequest != nil {
		return sourceStagedOperationRequest{}, false
	}
	// Phase snapshots share the original factory, not optional population lists.
	// Every referenced C must instead belong to the actual Get requirement set.
	getRequest := nativeRootDebtRequest(source, "callee-get")
	get := work.operationRecipes[getRequest.producer]
	if !validNativeGetRequest(get, getRequest) || !sameNativeGetSource(get.nativeGet, source) {
		return sourceStagedOperationRequest{}, false
	}
	contribution := nativeMemberAlternativeRequest(source, "member-get-effects")
	getEffects := work.operationRecipes[contribution.producer]
	if !sameOperationRequest(source.getContributions, contribution) || !validStagedMemberGetEffectsRecipe(getEffects) || !sameOperationRequest(getEffects.memberSource.parent, source.request) || getEffects.memberSource.candidate.cut != s.candidate.cut {
		return sourceStagedOperationRequest{}, false
	}
	for i, r := range source.memberSources {
		c := work.operationRecipes[r.producer]
		if !validStagedMemberCoverageRecipe(c) || c.memberSource == nil || !sameOperationRequest(c.memberSource.parent, source.request) || !sameOperationRequest(c.memberSource.request, r) || !operationContainsRequest(get.delta.required, r) {
			return sourceStagedOperationRequest{}, false
		}
		if i == len(source.memberSources)-1 && (c.memberSource.coverage.origin != s.candidate.origin || c.memberSource.coverage.cut != s.candidate.cut) {
			return sourceStagedOperationRequest{}, false
		}
	}
	return request, true
}

// currentNativeOnlyPopulation consumes admitted original Get and population
// observations. Required source closure stays independent: waiting for it here
// would make the local conditional relation wait on its own consumers.
func (work *callableEffectWork) currentNativeOnlyPopulation(source *sourceStagedNativeGetSource) bool {
	request, described := work.describeNativeOnlyPopulation(source)
	if !described {
		return false
	}
	proof := work.currentNativeCalleeEffects(source)
	if proof == nil {
		return false
	}
	id := work.operationIDs[request.producer]
	getID := work.operationIDs[nativeRootDebtRequest(source, "callee-get").producer]
	if id.epoch != work.operationEpoch || id.index == 0 || getID.epoch != work.operationEpoch || getID.index == 0 {
		return false
	}
	recipe := work.operationRecipes[request.producer]
	s := recipe.memberSource
	state := &work.operations[id.index]
	get := &work.operations[getID.index]
	if s.generation != work.operationGeneration || s.candidate.cut != proof.cut || state.invalid || get.invalid || !state.dependenciesRegistered || !get.dependenciesRegistered || state.revision == 0 || get.revision == 0 || !state.delta.extracted || !get.delta.extracted || !state.memberCoverageObserved || work.memberCoverageObserved[request.producer] != work.operationGeneration || !operationDeltaPrefix(state.delta, recipe.delta) || !operationDeltaPrefix(recipe.delta, state.delta) {
		return false
	}
	for _, r := range source.memberSources {
		c := work.operationRecipes[r.producer].memberSource
		cid := work.operationIDs[r.producer]
		if c == nil || c.coverage == nil || c.generation != work.operationGeneration || !c.coverage.extracted || work.memberCoverageObserved[r.producer] != work.operationGeneration || cid.epoch != work.operationEpoch || cid.index == 0 {
			return false
		}
		observed := &work.operations[cid.index]
		if observed.invalid || !observed.dependenciesRegistered || observed.revision == 0 || !observed.delta.extracted || !observed.memberCoverageObserved || !operationContainsRequest(get.delta.required, r) || !operationPrefix(c.coverage.required, observed.delta.required, sameOperationRequest) || !operationPrefix(observed.delta.required, c.coverage.required, sameOperationRequest) {
			return false
		}
	}
	return true
}

// nativePopulationDescriptionSupported and nativePopulationCurrent preserve
// the original count-zero domain. Only the exact retained native-only family
// can extend it, with current rights supplied exclusively by the latter.
func (work *callableEffectWork) nativePopulationDescriptionSupported(source *sourceStagedNativeGetSource) bool {
	if source == nil {
		return false
	}
	if nativeMemberCallRequirementCount(source) == 0 {
		return true
	}
	_, ok := work.describeNativeOnlyPopulation(source)
	return ok
}
func (work *callableEffectWork) nativePopulationCurrent(source *sourceStagedNativeGetSource) bool {
	return source != nil && (nativeMemberCallRequirementCount(source) == 0 || work.currentNativeOnlyPopulation(source))
}
