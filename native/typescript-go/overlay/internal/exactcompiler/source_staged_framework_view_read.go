package exactcompiler

// frameworkViewMemberReading authenticates the real restored member callback's
// current conditional DATA reader. A copied description is insufficient: the
// exact original Get/cut must own an applied subscriber and closed input/Effects
// requirements in this graph. No normal receiver/output certificate is issued.
func (work *callableEffectWork) frameworkViewMemberReading(facts []callableFacts, q *sourceValueQuery, candidate sourceStagedMemberCandidate) (sourceStagedOperationRequest, bool) {
	view := candidate.target.frameworkView
	b := q.stagedMember
	if view == nil || b == nil || !q.liveStagedMemberSource(b, b.get, b.read) || !b.publishing || b.current == nil || !sameStagedMemberCandidate(*b.current, candidate) || candidate.origin != view.call || candidate.operation != b.get.operation || candidate.cut != b.observation || candidate.target.kind != relativeEndpointFrameworkView || candidate.target.expression != nil || candidate.target.producer != view.call || candidate.target.cut != candidate.cut {
		return sourceStagedOperationRequest{}, false
	}
	expected := sourceRelativeEndpoint{kind: relativeEndpointFrameworkView, producer: view.call, cut: candidate.cut, frameworkView: view}
	if !sameOperationEndpoint(candidate.target, expected) {
		return sourceStagedOperationRequest{}, false
	}
	caller := enclosingCallableNode(view.call)
	if caller == nil {
		caller = sourceStagedModuleOwner(view.call)
	}
	recipe := work.operationRecipes[stagedCallResultRequest(view.call, caller).producer]
	if recipe.callResult == nil || !sameFrameworkStorageView(recipe.callResult.frameworkView, view) {
		return sourceStagedOperationRequest{}, false
	}
	views, reading := work.currentFrameworkResultViews(facts, q, recipe)
	return reading, len(views) == 1 && sameFrameworkStorageView(&views[0], view) && validStagedCallResultReading(reading, b.request, candidate.cut)
}

func sameFrameworkViewReading(a, b *sourceStagedOperationRequest) bool {
	return a == b || a != nil && b != nil && sameOperationRequest(*a, *b)
}

// validFrameworkViewMemberRecipe retains an explicit runtime alternative AND
// its exact DATA prerequisite. The residual cannot stand in for unfinished
// selection, input or source work. Ordinary runtime-unknown member semantics
// supply the residual; the framework marker never becomes a raw object donor.
func validFrameworkViewMemberRecipe(recipe sourceStagedOperationRecipe) bool {
	source := recipe.memberSource
	if source == nil || source.frameworkRead == nil || source.nativeWriter != nil || source.globalWrite != nil || source.hasFreshTarget != nil || source.targetSource != nil || source.writeEffects || source.protocolSource != nil || source.coverage != nil || source.call != nil || source.getEffects != nil || source.moduleExcluded != nil || len(source.values)+len(recipe.writerRequired) != 0 {
		return false
	}
	candidate := source.candidate
	view := candidate.target.frameworkView
	if view == nil || view.generation != source.generation || !candidate.runtimeUnknown || candidate.reflective || candidate.protocol || candidate.invoking || candidate.getContribution || candidate.prior || candidate.region != nil || candidate.operation != source.parent.producer.operation || candidate.origin != view.call || candidate.target.kind != relativeEndpointFrameworkView || candidate.target.expression != nil || candidate.target.producer != view.call || candidate.target.cut != candidate.cut || !validStagedCallResultReading(*source.frameworkRead, source.parent, candidate.cut) || source.frameworkRead.producer.operation != view.call || len(recipe.delta.required) != 1 || !sameOperationRequest(recipe.delta.required[0], *source.frameworkRead) {
		return false
	}
	expected := sourceRelativeEndpoint{kind: relativeEndpointFrameworkView, producer: view.call, cut: candidate.cut, frameworkView: view}
	if !sameOperationEndpoint(candidate.target, expected) {
		return false
	}
	// Preserve the existing original-member factory/cut/unknown-residual rules.
	// This pure validation projection is never registered or published.
	copy := *source
	copy.frameworkRead = nil
	baseline := recipe
	baseline.memberSource = &copy
	baseline.delta = cloneOperationDelta(recipe.delta)
	baseline.delta.required = nil
	return validStagedMemberRecipe(baseline)
}
