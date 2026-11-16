package exactcompiler

// beginInstalledMemberReader belongs only to memberWriterRead, before that
// owner changes query fields. Enrollment supplies an actual full subscriber;
// this interval transports its semantic cut and pays no source or output debt.
func (q *sourceValueQuery) beginInstalledMemberReader(get *sourceGetInputs, read *sourceMemberWriterReadCut) *sourceInstalledMemberEvent {
	if q == nil {
		return nil
	}
	e := q.installedMemberPhase
	if e == nil || e.readerActive || e.read != read || e.get == nil || e.get != get || q.relativeInputCut(e.get.operation) != e.application.memberCut || !q.liveInstalledMemberPhase(e, e.get, read) || !q.installedMemberReaderEnrollmentOwned(e) {
		return nil
	}
	e.readerActive = true
	return e
}

// installedMemberReaderEnrollmentOwned checks the original work, not merely a
// generation or an equal detached application. No current/APPLIED bit is read
// or renewed, and no query or producer is executed here.
func (q *sourceValueQuery) installedMemberReaderEnrollmentOwned(e *sourceInstalledMemberEvent) bool {
	if e == nil || e.self != e {
		return false
	}
	work := e.work
	if work == nil || e.epoch == nil || work.operationEpoch != e.epoch || work.operationGeneration != e.application.generation {
		return false
	}
	consumer, known := work.memberNodes[e.application.request.consumer]
	if !known || consumer < 0 || consumer >= len(work.operationFacts) || e.publisher == nil || e.publisher.fact != &work.operationFacts[consumer] {
		return false
	}
	recipe, registered := work.operationRecipes[e.application.request.producer]
	id, adopted := work.operationIDs[e.application.request.producer]
	if !registered || !sameInstalledMemberApplication(recipe.installedMember, &e.application) || !adopted || id.epoch != e.epoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	subscriber := state.subscribers[sourceStagedOperationConsumer{consumer: e.application.request.consumer, edge: e.application.request.edge}]
	return state.key == e.application.request.producer && !state.invalid && subscriber != nil && !subscriber.blocked && sameInstalledMemberRequest(subscriber.request, e.application.request)
}

// installedMemberCutOwned keeps semantic S exact. Only the actual reader
// interval may also recognize its mechanical physical projection P. Other
// reading/initializing/invoking changes and copied query/Get/read owners refuse.
func (q *sourceValueQuery) installedMemberCutOwned(e *sourceInstalledMemberEvent, get *sourceGetInputs, read *sourceMemberWriterReadCut) bool {
	raw := q.relativeInputCut(get.operation)
	semantic := e.application.memberCut
	// Enrollment itself precedes work capture; later scopes cannot cross epochs.
	if e.work != nil && !q.installedMemberReaderEnrollmentOwned(e) {
		return false
	}
	if raw == semantic {
		return true
	}
	if !e.readerActive || e.issuer != q || q.installedMemberPhase != e || get != e.get || read != e.read || e.work == nil {
		return false
	}
	physical := semantic
	physical.reading, physical.returning = read.use, nil
	return raw == physical
}

// memberSourceObservationCut is local to the actual source/C publisher. The
// physical query and writer ordering remain untouched; only this same live
// installed event retains its original semantic identity in source metadata.
func (q *sourceValueQuery) memberSourceObservationCut(get *sourceGetInputs, read *sourceMemberWriterReadCut) sourceRelativeCut {
	if b := q.stagedMember; b != nil && b.installedMember != nil && q.liveInstalledMemberPhase(b.installedMember, get, read) {
		return b.installedMember.application.memberCut
	}
	return q.relativeInputCut(get.operation)
}
