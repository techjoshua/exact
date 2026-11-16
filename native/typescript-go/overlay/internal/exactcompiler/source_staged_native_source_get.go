package exactcompiler

// observeSelectedNativeGetSource visits one original callee Get with its selected
// algorithm consumer. The returned flag reports traversal setup, not selection,
// DATA, completion or a current semantic receipt. Original publishers alone issue
// those observations. No child input is traversed or ordinary use adopted here.
//
// A caller's existing argument issuer can lend its narrower child-callee phase.
// Source tasks with no such issuer gain no argument-order authority. Both loans
// end before this helper returns, including when acquisition refuses or panics.
func (work *callableEffectWork) observeSelectedNativeGetSource(facts []callableFacts, consumer int, request sourceStagedNativeRequest, owner *executableBodyOwner) (*sourceStagedNativeOccurrence, bool) {
	if consumer < 0 || consumer >= len(facts) || owner == nil || owner.values == nil || request.call == nil || request.occurrence != nil {
		return nil, false
	}
	occurrence := &sourceStagedNativeOccurrence{}
	request.occurrence = occurrence
	query := newSourceDependencyQuery(request.call, owner.checker, owner, facts[consumer].node)
	defer query.publishDependencyStatistics()
	revoke, installed := query.beginStagedNativeGetSource(work, facts, request, consumeStagedNativeDescriptorAlgorithm)
	if !installed {
		return nil, false
	}
	defer revoke()
	revokeArgument := request.argumentIssuer.beginChildCallee(query, request)
	defer revokeArgument()
	query.receiverCandidates(request.call, nil)
	borrow := query.stagedNativeGet
	if borrow != nil && borrow.issuer == query && borrow.owner == query.owner && borrow.generation == work.operationGeneration && borrow.call == request.call && occurrence.work == work && occurrence.generation == work.operationGeneration && occurrence.source != nil && sameOperationRequest(occurrence.source.request, request.request) && occurrence.source.get == request.get && occurrence.callee != nil && validStagedNativeCalleeEffects(*occurrence.callee, occurrence.source) {
		// Detached current-event provenance for the owning source continuation.
		// It is never a cached receipt or a replacement for the Get proof.
		occurrence.observedCoverage = append([]sourceStagedOperationRequest(nil), borrow.memberSources...)
		id, adopted := work.operationIDs[occurrence.callee.request.producer]
		if adopted && id.epoch == work.operationEpoch && id.index != 0 && int(id.index) < len(work.operations) && work.operations[id.index].key == occurrence.callee.request.producer {
			// This original event can pay its existing Get ticket even when a
			// source-only caller cannot adopt the child Call's input algorithm.
			// Admission retains its own failure; traversal setup is independent.
			work.admitNativeCalleeEffects(facts, occurrence.source, *occurrence.callee)
		}
	}
	if request.descriptorTarget != nil {
		work.finishDescriptorTargetGet(facts, query, request, occurrence)
	}
	return occurrence, true
}
