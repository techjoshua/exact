package exactcompiler

// sourceStagedEntryLawCandidateExclusion retains an original module Get's
// contextual prior-activation disposition. The indexed protocol's full Effects
// remain required; this is not a no-user-entry law for its invocation.
// Authority lives only on the current graph's original entry-law receipt.
type sourceStagedEntryLawCandidateExclusion struct {
	request, coverage sourceStagedOperationRequest
	candidate         sourceStagedMemberCandidate
	prefix            sourceStagedModuleActivation
}

// entryLawCandidateContext identifies an already described implicit phase.
// It neither registers a phase nor reconstructs an original observation.
func (work *callableEffectWork) entryLawCandidateContext(q *sourceValueQuery) (sourceStagedOperationRequest, bool) {
	if q.stagedFieldGet != nil {
		b := q.stagedFieldGet
		if b.observation == nil || q.stagedMember == nil || !q.liveStagedFieldMemberSource(q.stagedMember.get) {
			return sourceStagedOperationRequest{}, false
		}
		kind := stagedEntryLawFieldHas
		if b.observation.phase == stagedFieldObservationGet {
			kind = stagedEntryLawFieldGet
		}
		return stagedEntryLawRequest(b.request, kind)
	}
	if b := q.stagedMap; b != nil && b.currentRead != nil && q.stagedMember != nil && q.liveStagedMapEntryMemberSource(q.stagedMember.get) {
		return stagedEntryLawRequest(b.currentRead.request, stagedEntryLawMapGet)
	}
	return sourceStagedOperationRequest{}, false
}

// recordEntryLawCandidateExclusion is called only after the same live-event
// authorization used by the original sole module-exclusion path. Pending and
// indexed source descriptions may coexist with this contextual disposition;
// indexing later cannot create it from an AST or a cached producer.
func (work *callableEffectWork) recordEntryLawCandidateExclusion(facts []callableFacts, q *sourceValueQuery, recipe sourceStagedOperationRecipe, future bool) bool {
	s := recipe.memberSource
	b := q.stagedMember
	if s == nil {
		return false
	}
	actualFuture, authorized := work.authorizeStagedModuleCandidateExclusion(q, s, s.candidate.operation)
	if !authorized || actualFuture != future {
		return false
	}
	if s == nil || !s.candidate.protocol && !s.writeEffects || !validStagedMemberRecipe(recipe) || b == nil || b.coverage == nil || q.executable == nil || q.executable.values == nil || q.owner == nil || q.executable.project == nil || q.executable.project.activeGeneration != work.operationGeneration || q.owner.program != q.executable.values.program || q.owner.checker != q.executable.checker {
		return false
	}
	consumer, known := work.memberNodes[s.parent.consumer]
	if !known || consumer < 0 || consumer >= len(facts) {
		return false
	}
	publisher := q.executable.pendingMemberPublishers[s.parent.consumer]
	if publisher == nil || !publisher.live || publisher.fact != &facts[consumer] {
		return false
	}
	request, valid := work.entryLawCandidateContext(q)
	plan := work.operationRecipes[request.producer].entryLaw
	coverage := stagedMemberCoverageRequest(s.parent, s.candidate.origin, s.candidate.cut)
	if !valid || plan == nil || !sameOperationRequest(plan.request, request) || plan.receiver.expression != s.candidate.origin || b.coverage.generation != work.operationGeneration || b.coverage.origin != s.candidate.origin || b.coverage.cut != s.candidate.cut || !sameOperationRequest(b.coverage.request, coverage) {
		return false
	}
	if work.entryLawReceipts == nil {
		work.entryLawReceipts = make(map[sourceStagedOperationKey]*sourceStagedEntryLawReceipt)
	}
	proof := work.entryLawReceipts[request.producer]
	if proof == nil {
		proof = &sourceStagedEntryLawReceipt{source: cloneStagedEntryLawSource(plan), cut: b.moduleReceipt.source.cut, generation: work.operationGeneration}
		proof.issuer = &sourceStagedEntryLawIssuer{proof: proof, epoch: work.operationEpoch}
		work.entryLawReceipts[request.producer] = proof
	}
	if proof.issuer == nil || proof.issuer.proof != proof || proof.issuer.epoch != work.operationEpoch || proof.generation != work.operationGeneration || proof.cut != s.candidate.cut || !sameStagedEntryLawSource(proof.source, plan) {
		return false
	}
	prefix := *b.moduleReceipt
	prefix.required = cloneOperationDelta(sourceStagedOperationDelta{required: prefix.required}).required
	if future {
		prefix.notEntered = s.candidate.operation
	}
	disposition := sourceStagedEntryLawCandidateExclusion{request: s.request, coverage: coverage, candidate: s.candidate, prefix: prefix}
	for i, prior := range proof.exclusions {
		if sameOperationRequest(prior.request, s.request) {
			if !sameStagedMemberCandidate(prior.candidate, s.candidate) || !sameOperationRequest(prior.coverage, coverage) {
				return false
			}
			proof.exclusions[i] = disposition
			return true
		}
	}
	proof.exclusions = append(proof.exclusions, disposition)
	return true
}

// entryLawCandidateExcluded consumes only the exact original contextual event.
// It does not account protocol Effects, retire a source, or select its output.
func (work *callableEffectWork) entryLawCandidateExcluded(law, child sourceStagedOperationRecipe, proof *sourceStagedEntryLawReceipt) bool {
	s := child.memberSource
	if s == nil || !validStagedMemberProtocolRecipe(child) || proof == nil || proof.prefix == nil || proof.issuer == nil || proof.issuer.proof != proof || proof.issuer.epoch != work.operationEpoch || proof.generation != work.operationGeneration || !sameStagedEntryLawSource(proof.source, law.entryLaw) || s.generation != work.operationGeneration {
		return false
	}
	for _, event := range proof.exclusions {
		p := &event.prefix
		if !sameOperationRequest(event.request, s.request) || !sameStagedMemberCandidate(event.candidate, s.candidate) || !p.supported || !p.accounted || p.source.generation != work.operationGeneration || p.source.cut != s.candidate.cut || !sameOperationRequest(p.source.request, s.parent) || !runtimeModuleEvaluation(s.parent.consumer) || !stagedModuleProtocolReadOwned(s.parent, p) || p.source.read != proof.prefix.source.read || p.source.cut != proof.prefix.source.cut || !sameOperationRequest(p.source.request, proof.prefix.source.request) || !operationPrefix(p.required, proof.prefix.required, sameOperationRequest) || !operationPrefix(proof.prefix.required, p.required, sameOperationRequest) || s.candidate.region == nil && p.notEntered != s.candidate.operation || s.candidate.region != nil && p.notEntered != nil {
			continue
		}
		expected := stagedMemberCoverageRequest(s.parent, s.candidate.origin, s.candidate.cut)
		c := work.operationRecipes[event.coverage.producer].memberSource
		if !sameOperationRequest(event.coverage, expected) || c == nil || c.coverage == nil || !sameOperationRequest(c.parent, s.parent) || !sameOperationRequest(c.coverage.request, expected) || c.coverage.origin != s.candidate.origin || c.coverage.cut != s.candidate.cut || c.coverage.generation != work.operationGeneration || !c.coverage.extracted || work.memberCoverageObserved[expected.producer] != work.operationGeneration || !operationContainsRequest(c.coverage.required, s.request) {
			continue
		}
		// Retain the exact registered full semantic source; its closure is paid
		// independently by C. No arbitrary or missing producer can use this event.
		r := s.protocolSource.required
		if !validOperationEnvelope(work.operationRecipes[r.producer]) || !operationContainsRequest(child.delta.required, r) {
			continue
		}
		return true
	}
	return false
}
