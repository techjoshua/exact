package exactcompiler

import (
	"path/filepath"
	"slices"
	"testing"
)

// assertOriginalNativeWriterCapability reads the live original production-source
// journey after its normal tasks/ACKs. It installs no proof, IDs or delivery.
func assertOriginalNativeWriterCapability(t *testing.T, work *callableEffectWork, facts []callableFacts, owner *executableBodyOwner) {
	t.Helper()
	reached, wholeCurrent := 0, 0
	for key, recipe := range work.operationRecipes {
		s := recipe.memberSource
		if s == nil || s.nativeWriter == nil {
			continue
		}
		reached++
		current := work.nativeWriterCapabilityCurrent(recipe)

		t.Logf("native writer capability call=%d current=%v role=%q", s.candidate.operation.Pos(), current, key.selector.field)
		if !current {
			continue
		}
		wholeCurrent++
		// A detached recipe has no graph-local event or current proof. Wrong physical
		// source association must fail even with the original observed map intact.
		bad := recipe
		copySource := *s
		copyPayload := *s.nativeWriter
		copyPayload.coverage.cut = sourceRelativeCut{}
		if copyPayload.coverage.cut == s.nativeWriter.coverage.cut {
			t.Fatal("wrong-cut test did not change actual source cut")
		}
		copySource.nativeWriter = &copyPayload
		bad.memberSource = &copySource
		if work.nativeWriterCapabilityCurrent(bad) {
			t.Fatal("wrong capability cut acquired writer currency")
		}
		saved := work.memberCoverageObserved[key]
		delete(work.memberCoverageObserved, key)
		accepted := work.nativeWriterCapabilityCurrent(recipe)
		work.memberCoverageObserved[key] = saved
		if accepted {
			t.Fatal("unobserved capability acquired writer currency")
		}

		for _, r := range recipe.delta.required {
			if _, present := work.operationRecipes[r.producer]; !present {
				t.Fatal("native capability lost required source factory")
			}
		}
	}
	if wholeCurrent == 0 {
		t.Fatalf("no genuinely CURRENT original whole-writer capability: associations=%d; refusals UNREACHED", reached)
	}
	if reached == 0 {
		t.Fatal("original source reached no native writer capability association")
	}
	clones := make([]callableFacts, len(facts))
	for i := range facts {
		clones[i] = cloneProjectCallableFact(facts[i])
	}
	fresh := registerCallableEffectWork(clones)
	fresh.operationGeneration = owner.values.generation
	for _, r := range fresh.operationRecipes {
		if r.memberSource != nil && r.memberSource.nativeWriter != nil && fresh.nativeWriterCapabilityCurrent(r) {
			t.Fatal("cloned capability inherited current writer rights")
		}
	}
	t.Logf("original native writer capabilities payloads=%d/current%d; pending is unqualified", reached, wholeCurrent)
}

// assertOriginalNativeEagerWitness starts from an actual CURRENT original
// positive, then removes/mismatches one operand. Refusal cannot pass vacuously.
func assertOriginalNativeEagerWitness(t *testing.T, work *callableEffectWork) {
	assertOriginalNativeEagerReceipt(t, work, nil, work.nativeEagerWitnessCurrent)
}

func assertOriginalNativeEagerReceipt(t *testing.T, work *callableEffectWork, source *sourceStagedNativeGetSource, current func(*sourceStagedNativeGetSource) bool) {
	t.Helper()
	for _, r := range work.operationRecipes {
		if source != nil {
			break
		}
		if r.nativeGet == nil || r.key != r.nativeGet.request.producer {
			continue
		}
		canonical := work.nativeWriterSource(r.nativeGet.request)
		if canonical == nil {
			continue
		}
		eager := work.operationRecipes[nativeRootDebtRequest(canonical, "eager-inputs").producer].nativeGet
		if eager != nil && current(eager) {
			source = eager
			break
		}
	}
	if source == nil || !current(source) {
		t.Fatal("original eager witness CURRENT positive UNREACHED")
	}
	request, _ := nativeEagerReceiptRequest(source)
	receipt := work.entryLawReceipts[request.producer]
	w := receipt.nativeEager
	late := false
	for i, d := range w.observed {
		if w.vector[1+3*i+2] < d.revision {
			late = true
		}
	}
	if !late || !w.delivered {
		t.Fatal("original late-ACK eager completion positive UNREACHED")
	}
	assertNativeEagerReceiptInvariants(t, work, source, current)
}

// Function input currency admits either real arrival order. It retains the
// same current/evidence/lifetime controls without asserting a MODULE fixture's
// APPLIED-lag schedule. Module callers above still require genuine late ACK.
func assertOriginalCurrentNativeEagerReceipt(t *testing.T, work *callableEffectWork, source *sourceStagedNativeGetSource, current func(*sourceStagedNativeGetSource) bool) {
	t.Helper()
	if source == nil || !current(source) {
		t.Fatal("original eager witness CURRENT positive UNREACHED")
	}
	assertNativeEagerReceiptInvariants(t, work, source, current)
}

// Both callers have established an actual CURRENT original receipt. Mutation
// controls below touch copied observation data/slots, never producers or ACKs.
func assertNativeEagerReceiptInvariants(t *testing.T, work *callableEffectWork, source *sourceStagedNativeGetSource, current func(*sourceStagedNativeGetSource) bool) {
	t.Helper()
	request, _ := nativeEagerReceiptRequest(source)
	receipt := work.entryLawReceipts[request.producer]
	w := receipt.nativeEager
	oldVector := append([]uint64(nil), w.vector...)
	observed := append([]sourceStagedNativeEagerDependency(nil), w.observed...)
	required := append([]sourceStagedOperationRequest(nil), w.required...)
	late := false
	for i, d := range w.observed {
		if w.vector[1+3*i+2] < d.revision {
			late = true
		}
	}
	revision := work.operations[w.get.index].revision
	watch := sourceStagedNativeEagerWatch{owner: request, receipt: receipt, witness: w}
	if !work.completePendingNativeEagerReceipt(watch) || !work.completePendingNativeEagerReceipt(watch) || !slices.Equal(oldVector, w.vector) || work.operations[w.get.index].revision != revision {
		t.Fatal("ACK completion rewrote original observation or semantic revision")
	}
	if !slices.EqualFunc(observed, w.observed, func(a, b sourceStagedNativeEagerDependency) bool {
		return a.dependency.producer == b.dependency.producer && a.revision == b.revision && sameOperationRequest(a.dependency.request, b.dependency.request)
	}) || !slices.EqualFunc(required, w.required, sameOperationRequest) || !current(source) {
		t.Fatal("repeated ACK completion changed typed semantic observation or required association")
	}
	// An equivalent-looking foreign receipt slot is not the admitted original.
	foreignReceipt := *receipt
	foreignWatch := watch
	foreignWatch.receipt = &foreignReceipt
	if work.completePendingNativeEagerReceipt(foreignWatch) {
		t.Fatal("foreign pending receipt slot gained completion")
	}
	t.Logf("genuine eager CURRENT positive; observed-late-ACK=%t; original vector=%v; typed observations/full requests unchanged on repeated completion", late, oldVector)
	receipt.nativeEager = nil
	accepted := current(source)
	receipt.nativeEager = w
	if accepted {
		t.Fatal("missing original input admission gained eager currency")
	}
	copy := *w
	receipt.nativeEager = &copy
	accepted = current(source)
	receipt.nativeEager = w
	if accepted {
		t.Fatal("copied original input witness gained eager currency")
	}
	admitted := w.admitted
	w.admitted = false
	accepted = current(source)
	w.admitted = admitted
	if accepted {
		t.Fatal("unadopted returned Get gained eager currency")
	}
	// Corrupt only a COPY of the captured association, never the live producer
	// revision, subscriber ACK, source factory or observation query.
	if len(w.observed) == 0 {
		t.Fatal("typed original semantic observation positive UNREACHED")
	}
	savedObserved := w.observed
	w.observed = append([]sourceStagedNativeEagerDependency(nil), savedObserved...)
	w.observed[0].dependency.request.edge += ":foreign-observation"
	accepted = current(source)
	w.observed = savedObserved
	if accepted {
		t.Fatal("wrong captured full-request association gained eager currency")
	}
	w.observed = append([]sourceStagedNativeEagerDependency(nil), savedObserved...)
	w.observed[0].revision++
	accepted = current(source)
	w.observed = savedObserved
	if accepted {
		t.Fatal("wrong captured semantic revision gained eager currency")
	}
	if !current(source) {
		t.Fatal("typed observation refusal control failed to restore the actual positive")
	}
	cut := w.proof.cut
	w.proof.cut.reading = nil
	if w.proof.cut == cut {
		w.proof.cut.operation = nil
	}
	if w.proof.cut == cut {
		t.Fatal("wrong-cut control unchanged")
	}
	accepted = current(source)
	w.proof.cut = cut
	if accepted {
		t.Fatal("wrong Get gained eager currency")
	}
	epoch := w.epoch
	w.epoch = new(sourceStagedOperationEpoch)
	accepted = current(source)
	w.epoch = epoch
	if accepted {
		t.Fatal("expired original input witness gained eager currency")
	}
}

// The root source may genuinely carry count one while the algorithm snapshot
// remains count zero. This tests the actual retained population branch without
// copying optional metadata or manufacturing its factory, receipt or adoption.
func assertOriginalNativePopulationCapability(t *testing.T, work *callableEffectWork) {
	t.Helper()
	for _, r := range work.operationRecipes {
		source := r.nativeGet
		if source == nil || r.key != source.request.producer || source.kind != sourceNativeObjectDefineProperties {
			continue
		}
		request, described := work.describeNativeOnlyPopulation(source)
		if !described || !work.currentNativeOnlyPopulation(source) || !work.nativeWriterCapabilityApplied(request) {
			continue
		}
		if !work.nativeWriterPopulationCurrent(source, request) {
			t.Fatal("genuine count-one population consumer refused current original source")
		}
		wrong := request
		wrong.edge += ":wrong-reader"
		if work.nativeWriterPopulationCurrent(source, wrong) {
			t.Fatal("wrong population request acquired capability")
		}
		id := work.operationIDs[request.producer]
		sub := work.operations[id.index].subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
		applied := sub.applied
		sub.applied = 0
		accepted := work.nativeWriterPopulationCurrent(source, request)
		sub.applied = applied
		if accepted {
			t.Fatal("unapplied population acquired capability")
		}
		t.Logf("genuine current count-one source call=%d role=%q; algorithm optional metadata unchanged", source.request.use.Pos(), r.key.selector.field)
		return
	}
	t.Fatal("genuine count-one population CURRENT control UNREACHED; no metadata fabricated")
}

func TestStagedNativeWriterPopulationCurrentOriginal(t *testing.T) {
	f := newStagedGlobalStoreFixture(t)
	request := f.request("analyze", "component-abi/opaque-operation.ts")
	request.stagedReplacement = true
	withActiveModuleSourceWork(t, request, nativeWriter679FixtureSources(f), []string{filepath.Join(f.root, "component/contract-versions.ts")}, func(_ []callableFacts, work *callableEffectWork, _ *executableBodyOwner) {
		assertOriginalNativePopulationCapability(t, work)
	}, activeModuleCompleteAnalysis)
}
