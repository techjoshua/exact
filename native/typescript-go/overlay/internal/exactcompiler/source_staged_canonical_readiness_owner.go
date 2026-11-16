package exactcompiler

// sourceCanonicalReadinessOwner preserves the actual collecting definition only
// for its bounded operation drain. It is embedded once per work, never allocated
// per operation or copied into facts, fingerprints or recipes. The direct-call
// extraction context deliberately stays disabled throughout that drain.
type sourceCanonicalReadinessOwner struct {
	work       *callableEffectWork
	owner      *executableBodyOwner
	fact       *callableFacts
	publisher  *sourcePendingMemberPublisher
	generation *projectGeneration
	caller     int
}

func (work *callableEffectWork) canonicalReadinessOwner(facts []callableFacts, owner *executableBodyOwner, caller int) sourceCanonicalReadinessOwner {
	none := sourceCanonicalReadinessOwner{}
	if !work.operationPreparing || work.extracting != -1 || caller < 0 || caller >= len(facts) || caller >= len(work.extractionPhases) || caller >= len(work.operationFacts) || work.extractionPhases[caller] != callableExtractionRunning || facts[caller].staged.ready || &facts[caller] != &work.operationFacts[caller] {
		return none
	}
	if owner == nil || owner.values == nil || owner.project == nil || work.operationGeneration == nil || !work.operationGeneration.active || owner.values.generation != work.operationGeneration || owner.project.activeGeneration != work.operationGeneration {
		return none
	}
	fact := &facts[caller]
	publisher := owner.pendingMemberPublishers[fact.node]
	if fact.node == nil || fact.sourceFile == nil || publisher == nil || !publisher.live || publisher.fact != fact || owner.values.program.GetSourceFile(fact.sourceFile.FileName()) != fact.sourceFile {
		return none
	}
	return sourceCanonicalReadinessOwner{work: work, owner: owner, fact: fact, publisher: publisher, generation: work.operationGeneration, caller: caller}
}

// live authenticates a real adopted producer under the same synchronous owner.
// The epoch comes from original adoption in this work; entry need not create an
// identity just to retain the canonical caller. PhaseRunning alone cannot grant
// this continuation, and nothing here grants source completion or a receipt.
func (scope sourceCanonicalReadinessOwner) live(work *callableEffectWork, id sourceStagedOperationID, caller int) bool {
	if scope.work != work || work == nil || !work.operationPreparing || work.extracting != -1 || caller != scope.caller || caller < 0 || caller >= len(work.operationFacts) || caller >= len(work.extractionPhases) || work.extractionPhases[caller] != callableExtractionRunning || scope.fact != &work.operationFacts[caller] || scope.fact.staged.ready || scope.generation == nil || scope.generation != work.operationGeneration || !scope.generation.active {
		return false
	}
	if id.epoch == nil || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return false
	}
	state := &work.operations[id.index]
	if state.invalid || state.key.declaration != scope.fact.node || work.operationIDs[state.key] != id {
		return false
	}
	owner := scope.owner
	if owner == nil || owner.values == nil || owner.project == nil || owner.values.generation != scope.generation || owner.project.activeGeneration != scope.generation || scope.publisher == nil || !scope.publisher.live || scope.publisher.fact != scope.fact || owner.pendingMemberPublishers[scope.fact.node] != scope.publisher || scope.fact.sourceFile == nil {
		return false
	}
	return owner.values.program.GetSourceFile(scope.fact.sourceFile.FileName()) == scope.fact.sourceFile
}
