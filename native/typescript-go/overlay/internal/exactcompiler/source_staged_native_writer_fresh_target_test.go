package exactcompiler

import (
	"path/filepath"
	"testing"
)

// Refusals start from actual original-callback currency in the active graph.
// No token, stamp, revision, ACK or candidate-positive is manufactured here.
func assertNativeWriterFreshTargetLifecycle(t *testing.T, work *callableEffectWork, facts []callableFacts, owner *executableBodyOwner) {
	t.Helper()
	reached := 0
	for key, recipe := range work.operationRecipes {
		s := recipe.memberSource
		if s == nil || s.nativeWriter == nil || s.nativeWriter.provenance != nativeWriterFreshTarget {
			continue
		}
		if !work.nativeWriterCapabilityCurrent(recipe) {
			t.Fatal("genuine fresh-target candidate CURRENT positive UNREACHED")
		}
		reached++
		id, adopted := work.operationIDs[key]
		if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || !work.operations[id.index].delta.extracted || work.operations[id.index].revision == 0 {
			t.Fatal("genuine original published native writer positive UNREACHED")
		}
		unchanged := nativeWriterPublishedStateControl(t, work, id)
		work.publishNativeWriterCapability(id)
		unchanged()
		p := s.nativeWriter
		stamp := work.memberCoverageObserved[key]
		if stamp == nil || stamp != owner.values.generation {
			t.Fatal("fresh event has no genuine graph-local observation")
		}
		// Descriptions cannot reissue a removed observation, including attachment's
		// automatic publisher path on an already-extracted recipe.
		delete(work.memberCoverageObserved, key)
		work.publishNativeWriterCapability(id)
		unchanged()
		attached := work.attachNativeWriterCapability(facts, recipe, cloneNativeWriterCapability(p))
		unobserved := work.memberCoverageObserved[key] == nil && !work.nativeWriterCapabilityCurrent(work.operationRecipes[key])
		work.memberCoverageObserved[key] = stamp
		if !attached || !unobserved || !work.nativeWriterCapabilityCurrent(work.operationRecipes[key]) {
			t.Fatal("generic description attachment issued observation or lost the genuine restored association")
		}

		for _, provenance := range []sourceStagedNativeWriterProvenance{nativeWriterUnknown, nativeWriterAllRowsDisjoint} {
			bad := recipe
			source := *s
			payload := *p
			payload.provenance = provenance
			source.nativeWriter = &payload
			bad.memberSource = &source
			if sameNativeWriterCapability(p, &payload) || work.nativeWriterRefinementAllowed(recipe, bad) || work.attachOperationSource(facts, bad) || work.nativeWriterCapabilityCurrent(bad) {
				t.Fatal("unknown/other event provenance borrowed an observed association")
			}
			if !sameNativeWriterCapability(work.operationRecipes[key].memberSource.nativeWriter, p) || work.memberCoverageObserved[key] != stamp {
				t.Fatal("refused provenance changed registered observation")
			}
		}

		wrongCut := recipe
		wrongSource := *s
		wrongPayload := *p
		wrongPayload.coverage.cut = sourceRelativeCut{}
		wrongSource.nativeWriter = &wrongPayload
		wrongCut.memberSource = &wrongSource
		if work.attachOperationSource(facts, wrongCut) || work.nativeWriterCapabilityCurrent(wrongCut) {
			t.Fatal("wrong physical cut borrowed fresh-target observation")
		}
		expired := recipe
		expiredSource := *s
		expiredSource.generation = &projectGeneration{}
		expired.memberSource = &expiredSource
		if work.nativeWriterCapabilityCurrent(expired) || work.attachOperationSource(facts, expired) {
			t.Fatal("expired generation description borrowed current event")
		}

		// This is an actually observed C from the same positive. The narrow shared
		// refinement guard must refuse first nativeWriter adoption on any stamped key,
		// independently of envelope guards that also reject this cross-family draft.
		prior := work.operationRecipes[p.coverage.producer]
		if prior.memberSource == nil || prior.memberSource.nativeWriter != nil || work.memberCoverageObserved[prior.key] != stamp {
			t.Fatal("genuine alternate-family stamped key UNREACHED")
		}
		refinement := prior
		copySource := *prior.memberSource
		copySource.nativeWriter = cloneNativeWriterCapability(p)
		refinement.memberSource = &copySource
		if work.nativeWriterRefinementAllowed(prior, refinement) {
			t.Fatal("first nativeWriter refinement borrowed an alternate-family observation")
		}

		// Extra source rights remain in the immutable request list. They cannot be
		// dropped to satisfy the current owner's exact two-request supported domain.
		extra := recipe
		extra.delta = cloneOperationDelta(recipe.delta)
		extra.delta.required = appendEntryLawRequirement(extra.delta.required, p.coverage)
		described, valid := nativeWriterCapabilityDescription(extra, p)
		if !valid || len(described.delta.required) <= 2 || !operationContainsRequest(described.delta.required, p.source) || !operationContainsRequest(described.delta.required, p.law) || !operationContainsRequest(described.delta.required, p.coverage) {
			t.Fatal("description narrowed unsupported extra source obligations")
		}
		if work.attachOperationSource(facts, described) || work.nativeWriterCapabilityCurrent(described) {
			t.Fatal("changed full factory reused prior observed association")
		}

		// Fingerprinting is descriptive only; changing provenance must change its
		// actual existing cache signature without touching the live fact graph.
		consumer := work.memberNodes[s.request.consumer]
		originalFact := facts[consumer]
		modifiedFact := originalFact
		modifiedFact.staged.operationRecipes = append([]sourceStagedOperationRecipe(nil), originalFact.staged.operationRecipes...)
		replaced := false
		for i, r := range modifiedFact.staged.operationRecipes {
			if r.key != key {
				continue
			}
			copyRecipe := r
			copySource := *r.memberSource
			copyPayload := *r.memberSource.nativeWriter
			copyPayload.provenance = nativeWriterAllRowsDisjoint
			copySource.nativeWriter = &copyPayload
			copyRecipe.memberSource = &copySource
			modifiedFact.staged.operationRecipes[i] = copyRecipe
			replaced = true
		}
		if !replaced || callableAnalysisFingerprint(callableAnalysis{facts: []callableFacts{originalFact}}) == callableAnalysisFingerprint(callableAnalysis{facts: []callableFacts{modifiedFact}}) {
			t.Fatal("provenance missing from retained descriptive fingerprint")
		}
	}
	if reached == 0 {
		t.Fatal("actual fresh-target event/candidate positive UNREACHED; lifecycle refusers not covered")
	}
	t.Logf("genuine fresh-target current candidates=%d; generic-attach/provenance/full-factory/cut/generation/prestamped guards reached", reached)
}

// The original G4 source must still produce a genuine all-row event; success
// through the new fresh-target owner cannot substitute for this control.
func TestStagedNativeWriterAllRowsProvenance(t *testing.T) {
	f := newStagedGlobalStoreFixture(t)
	request := f.request("analyze", "component-abi/opaque-operation.ts")
	request.stagedReplacement = true
	withActiveModuleSourceWork(t, request, nativeWriter679FixtureSources(f), []string{filepath.Join(f.root, "component/contract-versions.ts")}, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		current := 0
		for _, recipe := range work.operationRecipes {
			source := recipe.memberSource
			if source == nil || source.nativeWriter == nil || source.nativeWriter.provenance != nativeWriterAllRowsDisjoint {
				continue
			}
			if work.nativeWriterCapabilityCurrent(recipe) {
				current++
			}
		}
		if current == 0 {
			t.Fatal("original all-row event CURRENT positive UNREACHED; fresh-target events cannot pay this gate")
		}
		assertOriginalNativeWriterCapability(t, work, facts, owner)
	}, activeModuleCompleteAnalysis)
}

// nativeWriterPublishedStateControl starts only from an authentic completed
// producer. Repeating publication/description must preserve every known atom,
// required edge and actual subscriber receipt; it cannot issue currentness.
func nativeWriterPublishedStateControl(t *testing.T, work *callableEffectWork, id sourceStagedOperationID) func() {
	t.Helper()
	state := &work.operations[id.index]
	before, revision := cloneOperationDelta(state.delta), state.revision
	head, queued, delivery := work.extractionHead, len(work.extractionQueue), state.deliveryQueued
	type receipt struct {
		key               sourceStagedOperationConsumer
		request           sourceStagedOperationRequest
		cursor            sourceStagedOperationCursor
		consumed, applied uint64
		blocked           bool
	}
	receipts := make([]receipt, 0, len(state.subscriberOrder))
	for _, key := range state.subscriberOrder {
		sub := state.subscribers[key]
		if sub == nil {
			t.Fatal("published original subscriber missing")
		}
		receipts = append(receipts, receipt{key, sub.request, sub.cursor, sub.consumed, sub.applied, sub.blocked})
	}
	return func() {
		t.Helper()
		state := &work.operations[id.index]
		if state.revision != revision || !state.delta.extracted || !operationDeltaPrefix(before, state.delta) || !operationDeltaPrefix(state.delta, before) || work.extractionHead != head || len(work.extractionQueue) != queued || state.deliveryQueued != delivery || len(state.subscriberOrder) != len(receipts) {
			t.Fatal("duplicate native writer publication changed known output/debt/revision or queued work")
		}
		for _, prior := range receipts {
			sub := state.subscribers[prior.key]
			if sub == nil || !sameOperationRequest(sub.request, prior.request) || sub.cursor != prior.cursor || sub.consumed != prior.consumed || sub.applied != prior.applied || sub.blocked != prior.blocked {
				t.Fatal("duplicate native writer publication changed actual subscriber authority")
			}
		}
	}
}
