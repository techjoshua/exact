package exactcompiler

// completeDemandedConstructedSource is called only by the original result
// service, after its ordinary semantic factory has issued the current Get/C.
// A passive source relationship can publish the same conditional role facts as
// a reached occurrence without entering a Call or registering ordinary use.
// Failed role prerequisites remain pending and are retried by that service.
func (work *callableEffectWork) completeDemandedConstructedSource(facts []callableFacts, demand sourceStagedOperationKey, source *sourceStagedConstructedMember, owner *executableBodyOwner) bool {
	if !validConstructedMemberSource(source) || owner == nil || owner.values == nil || owner.project == nil || owner.checker == nil || work.operationGeneration == nil || !work.operationGeneration.active || owner.values.generation != work.operationGeneration || owner.project.activeGeneration != work.operationGeneration || owner.values.program != work.operationGeneration.program || owner.checker != work.operationGeneration.checker || owner.values.checker != owner.checker {
		return false
	}
	request := work.operationRecipes[demand]
	id, adopted := work.operationIDs[demand]
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || work.operations[id.index].invalid || !work.operations[id.index].dependenciesRegistered || !validConstructedMemberRecipe(request) || request.constructed == nil || request.constructed.kind != sourceNativeWeakMapGetEffect || demand != constructedMemberRequest(request.constructed, "member-result").producer || request.constructedDisposition == nil || !request.constructedDisposition.resultGetComplete || request.constructed.construction != source.construction || !work.constructedAssignmentProtocolCurrent(request.constructed) {
		return false
	}
	if source.kind != sourceNativeWeakMapSetEffect && !sameConstructedMemberSource(request.constructed, source) {
		return false
	}
	caller, known := work.memberNodes[source.request.consumer]
	publisher := owner.pendingMemberPublishers[source.request.consumer]
	if !known || caller < 0 || caller >= len(facts) || publisher == nil || !publisher.live || publisher.fact != &facts[caller] || facts[caller].sourceFile == nil || owner.values.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return false
	}
	root := work.operationRecipes[source.request.producer]
	if !validConstructedMemberRecipe(root) || len(root.constructedGroup) == 0 {
		return false
	}
	matched := false
	for _, member := range root.constructedGroup {
		matched = matched || sameConstructedMemberSource(&member, source)
		if !sameOperationRequest(member.request, source.request) || owner.standardConstructions[member.construction.site] != member.construction || !work.constructedAssignmentProtocolCurrent(&member) {
			return false
		}
	}
	if !matched {
		return false
	}
	// Use the same role publishers as reached collection. In particular eager
	// readiness still comes from the original canonical fact, and own-writer
	// coverage retains its real RHS/container and private-use prerequisites.
	for _, member := range root.constructedGroup {
		work.completeConstructedSourceRoles(facts, caller, member, owner)
	}
	work.completeConstructedSourceRoot(facts, caller, source.request, source.get.Expression(), owner)
	// Roles may have become available after the original C-tail notification.
	// Reuse that exact current observation and the existing waiting-source index.
	// No Get is reissued and no observation or semantic vector is refreshed.
	root = work.operationRecipes[source.request.producer]
	if work.issuedConstructedProtocolSource(root) {
		work.indexStagedMemberProtocolSource(root, owner)
	}
	return true // Source association only; extraction, APPLIED and closure differ.
}
