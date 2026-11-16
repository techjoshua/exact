package exactcompiler

// descriptorViewMemberReading consumes the actual restored Get's applied DATA
// reading. Description, selected Get, original Call Effects and source inputs
// remain separate: this association cannot manufacture any of their deliveries.
func (work *callableEffectWork) descriptorViewMemberReading(facts []callableFacts, q *sourceValueQuery, candidate sourceStagedMemberCandidate) (sourceStagedOperationRequest, bool) {
	view := candidate.target.descriptorView
	b := q.stagedMember
	if view == nil || b == nil || !q.liveStagedMemberSource(b, b.get, b.read) || !b.publishing || b.current == nil || !sameStagedMemberCandidate(*b.current, candidate) || candidate.origin != view.delivery.producer.operation || candidate.operation != b.get.operation || candidate.cut != b.observation || len(view.projection) != 0 {
		return sourceStagedOperationRequest{}, false
	}
	expected := sourceRelativeEndpoint{kind: relativeEndpointDescriptorView, producer: candidate.origin, cut: candidate.cut, descriptorView: view}
	if !sameOperationEndpoint(candidate.target, expected) {
		return sourceStagedOperationRequest{}, false
	}
	recipe := work.operationRecipes[view.delivery.producer]
	if !work.descriptorViewSourceCurrent(view) {
		return sourceStagedOperationRequest{}, false
	}
	views, reading := work.currentDeliveredDescriptorViews(facts, q, recipe)
	matched := false
	for index := range views {
		matched = matched || sameNativeDescriptorView(&views[index], view)
	}
	return reading, matched && validStagedCallResultReading(reading, b.request, candidate.cut)
}

func validDescriptorViewMemberRecipe(recipe sourceStagedOperationRecipe) bool {
	source := recipe.memberSource
	if source == nil || source.frameworkRead == nil || source.nativeWriter != nil || source.globalWrite != nil || source.hasFreshTarget != nil || source.targetSource != nil || source.writeEffects || source.protocolSource != nil || source.coverage != nil || source.call != nil || source.getEffects != nil || source.moduleExcluded != nil || len(source.values)+len(recipe.writerRequired) != 0 {
		return false
	}
	candidate := source.candidate
	view := candidate.target.descriptorView
	if view == nil || view.source.generation != source.generation || view.method == nil || len(view.projection) != 0 || !candidate.runtimeUnknown || candidate.reflective || candidate.protocol || candidate.invoking || candidate.getContribution || candidate.prior || candidate.region != nil || candidate.operation != source.parent.producer.operation || candidate.origin != view.delivery.producer.operation || !validStagedCallResultReading(*source.frameworkRead, source.parent, candidate.cut) || source.frameworkRead.producer.operation != candidate.origin || len(recipe.delta.required) != 1 || !sameOperationRequest(recipe.delta.required[0], *source.frameworkRead) {
		return false
	}
	expected := sourceRelativeEndpoint{kind: relativeEndpointDescriptorView, producer: candidate.origin, cut: candidate.cut, descriptorView: view}
	if !sameOperationEndpoint(candidate.target, expected) || !sameOperationRequest(*source.frameworkRead, view.delivery) {
		return false
	}
	// Preserve the existing runtime member factory and residual law, not a new
	// native/NoUser disposition. The pure validation projection is never issued.
	copy := *source
	copy.frameworkRead = nil
	baseline := recipe
	baseline.memberSource = &copy
	baseline.delta = cloneOperationDelta(recipe.delta)
	baseline.delta.required = nil
	return validStagedMemberRecipe(baseline)
}

// observeDescriptorViewRuntime is called after original recovery restoration.
// Only an actual applied reader can enroll this additive runtime alternative;
// pending input/selection/compiler work cannot be turned into runtime unknown.
func (q *sourceValueQuery) observeDescriptorViewRuntime(view sourceNativeDescriptorView, result *accessorCandidates) {
	b := q.stagedMember
	if b == nil || !q.liveStagedMemberSource(b, b.get, b.read) {
		result.valueIncomplete = true
		return
	}
	if view.delivery.producer.operation == nil {
		b.represented = false
		result.valueIncomplete = true
		return
	}
	cut := q.relativeInputCut(b.get.operation)
	copy := projectNativeDescriptorView(view, nil)
	candidate := sourceStagedMemberCandidate{request: b.request, operation: b.get.operation, origin: view.delivery.producer.operation, runtimeUnknown: true, cut: cut}
	candidate.target = sourceRelativeEndpoint{kind: relativeEndpointDescriptorView, producer: candidate.origin, cut: cut, descriptorView: &copy}
	if !q.publishStagedMemberCandidate(b.get, b.read, candidate) {
		result.valueIncomplete, result.opaque = true, true
	}
}
