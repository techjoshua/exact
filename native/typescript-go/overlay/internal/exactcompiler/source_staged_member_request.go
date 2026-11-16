package exactcompiler

// Publication commands are synchronous owner events, never recipe authority.
// A map request enrolls debt; only the final observation renews current C.
type sourceStagedMemberPublication uint8

const (
	stagedMemberFinalObservation sourceStagedMemberPublication = iota
	stagedMemberEarlyObservation
	stagedMemberSourceRequest
)

// The original map or field task owns one observation. Requested C inventories
// must receive their final event in that interval; ACK never re-enumerates it.
type sourceStagedMemberRequest struct {
	self      *sourceStagedMemberRequest
	work      *callableEffectWork
	query     *sourceValueQuery
	owner     *executableBodyOwner
	id        sourceStagedOperationID
	requests  []sourceStagedOperationRequest
	finalized []bool
}

func (work *callableEffectWork) beginStagedMapMemberSource(q *sourceValueQuery, facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) (func(), bool) {
	if q == nil || q.stagedMap == nil || owner == nil || q.executable != owner || q.owner == nil || owner.project == nil || q.owner.program != owner.project.program || q.owner.checker != owner.checker || q.owner.generation != work.operationGeneration || owner.project.activeGeneration != work.operationGeneration || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return func() {}, false
	}
	state := &work.operations[id.index]
	source := q.stagedMap.source
	if source == nil || source.descriptorMap == nil || state.key != source.descriptorMap.protocol.producer || state.invalid || !state.dependenciesRegistered || !state.mapSourceRequested {
		return func() {}, false
	}
	revoke, installed := work.beginStagedMemberWork(q, facts, source.request)
	if !installed {
		return func() {}, false
	}
	scope := &sourceStagedMemberRequest{work: work, query: q, owner: owner, id: id}
	scope.self = scope
	borrow := q.stagedMap
	prior := borrow.memberRequest
	borrow.memberRequest = scope
	return func() {
		if borrow.memberRequest == scope {
			borrow.memberRequest = prior
		}
		scope.self = nil
		revoke()
	}, true
}

func (s *sourceStagedMemberRequest) live() bool {
	if s == nil || s.self != s || s.work == nil || s.query == nil || s.owner == nil {
		return false
	}
	q, work := s.query, s.work
	if q.executable != s.owner || q.owner == nil || s.owner.project == nil || q.owner.program != s.owner.project.program || q.owner.checker != s.owner.checker || q.owner.generation != work.operationGeneration || s.owner.project.activeGeneration != work.operationGeneration || s.id.epoch != work.operationEpoch || s.id.index == 0 || int(s.id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[s.id.index]
	if state.invalid || !state.dependenciesRegistered {
		return false
	}
	if m := q.stagedMap; m != nil && m.memberRequest == s {
		return m.issuer == q && state.mapSourceRequested && state.key == m.request.producer
	}
	if f := q.stagedFieldGet; f != nil && f.memberRequest == s {
		return f.issuer == q && f.owner == q.owner && f.generation == work.operationGeneration && state.getterSourceRequested && state.effectsDemand != nil && state.key == f.request.producer && sameOperationRequest(state.effectsDemand.request, f.request)
	}
	return false
}

func (s *sourceStagedMemberRequest) request(get *sourceGetInputs, cut *sourceMemberWriterReadCut) bool {
	if !s.live() {
		return false
	}
	q := s.query
	b := q.stagedMember
	if b == nil || !q.liveStagedMemberSource(b, get, cut) || b.coverage == nil {
		return false
	}
	if m := q.stagedMap; m != nil && m.memberRequest == s {
		if m.reading || !m.converting || !q.traceModeKnown || q.traceMode != accessorEnumerate|accessorNoGet || !q.liveStagedMapObservation(get, accessorEnumerate|accessorNoGet) {
			return false
		}
	} else if f := q.stagedFieldGet; f == nil || f.memberRequest != s || !q.liveStagedFieldMemberSource(get) || !q.traceModeKnown || q.traceMode != accessorNoGet && q.traceMode != accessorAcquire {
		return false
	}
	prior, known := s.work.operationRecipes[b.coverage.request.producer]
	if !known || !prior.delta.extracted {
		q.excludeStagedMemberModuleCandidates(get, cut)
	}
	return q.publishStagedMemberDispositionPhase(get, cut, stagedMemberSourceRequest)
}

// A sealed inventory can be requested unchanged without downgrading or
// re-observing it. Its current graph stamp is deliberately not consulted here.
func (work *callableEffectWork) registerStagedMemberRequest(facts []callableFacts, q *sourceValueQuery, receipt sourceStagedMemberDisposition) bool {
	s := q.stagedMemberRequestOwner()
	if !s.live() || s.work != work || s.query != q {
		return false
	}
	b := q.stagedMember
	caller, known := work.memberNodes[b.request.consumer]
	publisher := s.owner.pendingMemberPublishers[b.request.consumer]
	if !known || caller < 0 || caller >= len(facts) || publisher == nil || !publisher.live || publisher.fact != &facts[caller] || facts[caller].sourceFile == nil || q.owner.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile || b.coverage == nil || b.coverage.generation != work.operationGeneration || !work.stagedMemberCoverageChildren(q, b.coverage) {
		return false
	}
	if m := q.stagedMap; m != nil && m.memberRequest == s {
		if b.get != m.get || b.mode != accessorEnumerate|accessorNoGet || !sameOperationRequest(b.request, m.source.request) || !validStagedMapMemberSourceRequest(m.source, b.coverage.request) || b.coverage.cut != m.cut {
			return false
		}
	} else if f := q.stagedFieldGet; f == nil || f.memberRequest != s || !q.liveStagedFieldMemberSource(b.get) || b.coverage.cut != f.cut || !sameOperationRequest(b.coverage.request, stagedMemberCoverageRequest(b.request, b.get.receiver.node, f.cut)) {
		return false
	}
	c := b.coverage
	prior, registered := work.operationRecipes[c.request.producer]
	if registered && prior.delta.extracted {
		if !sameSealedMemberRequest(prior, b.request, c, receipt) {
			return false
		}
	} else if !work.registerStagedMemberObservation(facts, q, receipt) {
		return false
	}
	if m := q.stagedMap; m != nil && m.memberRequest == s {
		if !work.enrollStagedMapMemberCoverage(facts, q, m.source, c.request) {
			return false
		}
	} else if !work.publishStagedFieldMemberSources(facts, q, stagedMemberSourceRequest) {
		return false
	}
	id, adopted := work.operationIDs[c.request.producer]
	if adopted {
		work.registerOperationDependencies(facts, id)
	}
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || work.operations[id.index].invalid || !work.operations[id.index].dependenciesRegistered {
		return false
	}
	for _, old := range s.requests {
		if sameOperationRequest(old, c.request) {
			return true
		}
	}
	s.requests = append(s.requests, c.request)
	s.finalized = append(s.finalized, false)
	return true
}

// Called only after normal final publication and map admission succeeded.
func (s *sourceStagedMemberRequest) observeFinal() {
	if !s.live() {
		return
	}
	b := s.query.stagedMember
	if b == nil || b.coverage == nil || !b.coverage.extracted || s.work.memberCoverageObserved[b.coverage.request.producer] != s.work.operationGeneration {
		return
	}
	for i, r := range s.requests {
		if sameOperationRequest(r, b.coverage.request) {
			s.finalized[i] = true
		}
	}
}
func (s *sourceStagedMemberRequest) completed() bool {
	if !s.live() {
		return false
	}
	for _, final := range s.finalized {
		if !final {
			return false
		}
	}
	return true
}

// This interval is installed only by the existing field dispatcher. It expires
// with its query; phase-specific C ownership is checked again at each request.
func (work *callableEffectWork) beginStagedFieldMemberRequests(q *sourceValueQuery, facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner, task *callableExtractionTask) (func(), bool) {
	if q == nil || q.stagedFieldGet == nil || task == nil || task.operation != id || task.delivery || task.nativeInputRevision != 0 || task.nativeTargetRevision != 0 || task.callable < 0 || task.callable >= len(facts) || owner == nil || q.executable != owner || q.owner == nil || owner.project == nil || q.owner.program != owner.project.program || q.owner.checker != owner.checker || q.owner.generation != work.operationGeneration || owner.project.activeGeneration != work.operationGeneration || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return func() {}, false
	}
	f := q.stagedFieldGet
	state := &work.operations[id.index]
	caller, known := work.memberNodes[f.request.consumer]
	publisher := owner.pendingMemberPublishers[f.request.consumer]
	if !known || caller != task.callable || publisher == nil || !publisher.live || publisher.fact != &facts[caller] || state.invalid || !state.dependenciesRegistered || !state.getterSourceRequested || state.effectsDemand == nil || !sameOperationRequest(state.effectsDemand.request, f.request) || state.key != f.request.producer {
		return func() {}, false
	}
	s := &sourceStagedMemberRequest{work: work, query: q, owner: owner, id: id}
	s.self = s
	previous := f.memberRequest
	f.memberRequest = s
	return func() {
		if f.memberRequest == s {
			f.memberRequest = previous
		}
		s.self = nil
	}, true
}
func (q *sourceValueQuery) stagedMemberRequestOwner() *sourceStagedMemberRequest {
	if q.stagedMap != nil && q.stagedMap.memberRequest != nil {
		return q.stagedMap.memberRequest
	}
	if q.stagedFieldGet != nil {
		return q.stagedFieldGet.memberRequest
	}
	return nil
}

// Descriptive equality only: this cannot supply a current observation or ACK.
func sameSealedMemberRequest(prior sourceStagedOperationRecipe, parent sourceStagedOperationRequest, c *sourceStagedMemberCoverage, receipt sourceStagedMemberDisposition) bool {
	if c == nil || !prior.delta.extracted || !validStagedMemberCoverageRecipe(prior) || receipt.generation != c.generation || receipt.cut != c.cut || !sameOperationRequest(receipt.request, parent) {
		return false
	}
	old := prior.memberSource
	return sameOperationRequest(old.parent, parent) && sameOperationRequest(old.request, c.request) && old.generation == c.generation && old.coverage.origin == c.origin && old.coverage.cut == c.cut && old.coverage.nativeObserver == c.nativeObserver && sameStagedMemberFieldBodies(old.coverage.fieldBodies, c.fieldBodies) && operationPrefix(prior.delta.required, c.required, sameOperationRequest) && operationPrefix(c.required, prior.delta.required, sameOperationRequest) && operationPrefix(receipt.delta.required, c.required, sameOperationRequest) && operationPrefix(c.required, receipt.delta.required, sameOperationRequest)
}
