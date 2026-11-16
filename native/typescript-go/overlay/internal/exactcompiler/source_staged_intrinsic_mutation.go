package exactcompiler

// This event belongs to the original conditional Get decision, independently
// of Effects/no-user-entry accounting. It never survives the synchronous borrow.
// A publication describes only ordinary local dispatch, not prototype delegates,
// returned values, property absence, normal completion or whole-Get NoWrites.
type sourceStagedIntrinsicMutationEvent struct {
	issuer   *sourceValueQuery
	get      *sourceGetInputs
	physical *sourceMemberWriterReadCut
}

func (q *sourceValueQuery) observeStagedFieldIntrinsicMutation(get *sourceGetInputs, key string, physical *sourceMemberWriterReadCut) bool {
	if !q.liveStagedFieldGet(get) || get.hasOnly || key != get.propertyKey || physical == nil || physical.operation != get.operation || physical.use != q.reading || !q.traceModeKnown || q.traceMode != accessorAcquire {
		return false
	}
	b := get.stagedEffects
	if b.observation == nil || b.observation.phase != stagedFieldObservationGet || b.intrinsicMutation == nil || b.intrinsicPublication != nil {
		return false
	}
	event := &sourceStagedIntrinsicMutationEvent{issuer: q, get: get, physical: physical}
	b.intrinsicPublication = event
	defer func() { b.intrinsicPublication = nil }()
	owner, generation, cut, observation := b.owner, b.generation, b.cut, b.observation
	accepted := b.intrinsicMutation(q, get, physical)
	return accepted && q.liveStagedFieldGet(get) && get.stagedEffects == b && b.owner == owner && b.generation == generation && b.cut == cut && b.observation == observation && observation.phase == stagedFieldObservationGet && b.intrinsicPublication == event && event.issuer == q && event.get == get && event.physical == physical
}
