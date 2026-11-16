package exactcompiler

// enrollDescriptorStrongResumption registers a pending continuation at the
// original lexical/selector Get when nominal DATA was already delivered before
// this visit. Only the registered strong reader may supply its own dependency;
// no target currentness or callable/source result follows from enrollment.
func (work *callableEffectWork) enrollDescriptorStrongResumption(facts []callableFacts, q *sourceValueQuery, view sourceNativeDescriptorView, get *sourceGetInputs, read *sourceMemberWriterReadCut, strong sourceStagedOperationRequest) bool {
	if q == nil || q.stagedMember == nil || !work.descriptorStrongReadingCurrent(strong, q.stagedMember.request, q.stagedMember.observation) {
		return false
	}
	return work.enrollDescriptorGetResumption(facts, q, view, get, read, strong)
}

// enrollDescriptorRecordResumption is the equivalent original owner for local
// Get Effects. It cannot lend its narrower use interest to a strong source
// reader, and it cannot make an inherited prototype/body child current.
func (work *callableEffectWork) enrollDescriptorRecordResumption(facts []callableFacts, q *sourceValueQuery, view sourceNativeDescriptorView, get *sourceGetInputs, read *sourceMemberWriterReadCut, effects sourceStagedOperationRequest) bool {
	if q == nil || q.stagedMember == nil {
		return false
	}
	recipe := work.operationRecipes[effects.producer]
	if !validDescriptorRecordGetRecipe(recipe) || !sameOperationRequest(recipe.memberSource.parent, q.stagedMember.request) || recipe.memberSource.candidate.cut != q.stagedMember.observation || !sameNativeDescriptorView(&recipe.memberSource.getEffects.descriptor.view, &view) || work.memberCoverageObserved[recipe.key] != work.operationGeneration {
		return false
	}
	return work.enrollDescriptorGetResumption(facts, q, view, get, read, effects)
}

// enrollDescriptorGetResumption factors the existing original Get queue, not
// traversal or acquisition. The caller has authenticated its concrete child.
// Every observer is freshly captured by prepareFrameworkGetResumption; neither
// this registration nor an ACK can update its immutable semantic snapshot.
func (work *callableEffectWork) enrollDescriptorGetResumption(facts []callableFacts, q *sourceValueQuery, view sourceNativeDescriptorView, get *sourceGetInputs, read *sourceMemberWriterReadCut, child sourceStagedOperationRequest) bool {
	if q == nil || q.owner == nil || q.owner.program == nil || q.executable == nil || q.executable.project == nil || work.operationGeneration == nil || work.operationGeneration != q.owner.generation || work.operationGeneration != q.executable.project.activeGeneration || !work.operationGeneration.active || q.returnObservation != nil || q.operation != nil {
		return false
	}
	b := q.stagedMember
	if b == nil || !q.liveStagedMemberSource(b, get, read) || b.observation != q.relativeInputCut(get.operation) || !memberReceiverCutsCorrespond(b.request, b.observation, b.request.cut) || !validStagedMemberParent(b.request) || len(view.projection) != 0 || !validStagedCallResultReading(view.delivery, b.request, b.observation) || !work.stagedMemberResultReading(view.delivery, b.request, b.request.cut) {
		return false
	}
	caller, known := work.memberNodes[b.request.consumer]
	publisher := q.executable.pendingMemberPublishers[b.request.consumer]
	if !known || caller < 0 || caller >= len(facts) || publisher == nil || !publisher.live || publisher.fact != &facts[caller] || facts[caller].sourceFile == nil || q.owner.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return false
	}
	if !work.descriptorRecordViewDelivered(&view) {
		return false
	}
	// The shared kernel owns the original reading and resumption registration.
	// Generic authored-return recipes intentionally remain unmigrated here.
	source := work.operationRecipes[view.delivery.producer].callResult
	if !work.enrollFrameworkGetResumption(facts, b.request, b.request.cut, source, view.delivery) {
		return false
	}
	request := frameworkGetResumptionRequest(b.request)
	prior := work.operationRecipes[request.producer]
	if !validFrameworkGetResumptionRecipe(prior) {
		return false
	}
	recipe := prior
	recipe.callResult = cloneStagedCallResultSource(prior.callResult)
	recipe.delta = cloneOperationDelta(prior.delta)
	resume := recipe.callResult.getResult.frameworkResume
	resume.readings = appendEntryLawRequirement(resume.readings, view.delivery)
	recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, view.delivery)
	recipe.delta.required = appendEntryLawRequirement(recipe.delta.required, child)
	if prior.delta.extracted && !operationPrefix(recipe.delta.required, prior.delta.required, sameOperationRequest) || !validFrameworkGetResumptionRecipe(recipe) {
		return false // A sealed successful reader cannot gain an unobserved tail.
	}
	if !work.attachOperationSource(facts, recipe) || !work.registerOperationUse(facts, sourceStagedOperationUse{request: request}) {
		return false
	}
	id, adopted := work.operationIDs[request.producer]
	if !adopted {
		return false
	}
	work.attachSourceObservationDependencies(facts, id)
	return true
}
