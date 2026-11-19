package exactcompiler

import (
	"path/filepath"
	"testing"
)

// The positive runs the unchanged original G4 module prefix through the SAME
// active collector as the independent adversarial fixtures. It is not Session
// artifact acceptance and deferred source bodies are not assumed settled.
func TestStagedNativeWriterCapabilityActiveModuleControls(t *testing.T) {
	if !t.Run("original-G4-positive", func(t *testing.T) {
		f := newStagedGlobalStoreFixture(t)
		request := f.request("analyze", "component-abi/opaque-operation.ts")

		sources := nativeWriter679FixtureSources(f)
		withActiveModuleSourceWork(t, request, sources, []string{filepath.Join(f.root, "component/contract-versions.ts")}, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
			whole, eagerCurrent := 0, 0
			wholePayloads := 0
			for _, r := range work.operationRecipes {
				if r.nativeGet == nil || r.key != r.nativeGet.request.producer || r.nativeGet.kind != sourceNativeObjectDefineProperties {
					continue
				}
				source := work.nativeWriterSource(r.nativeGet.request)
				if source == nil {
					t.Log("original module input capability source UNSUPPORTED/not registered")
					continue
				}
				law, _ := stagedEntryLawRequest(nativeRootDebtRequest(source, "algorithm"), stagedEntryLawNativeAlgorithm)
				eager := work.operationRecipes[nativeRootDebtRequest(source, "eager-inputs").producer].nativeGet
				witness := eager != nil && work.nativeEagerWitnessCurrent(eager)
				current := work.nativeWriterCapabilitiesCurrent(source, law)
				receiptRequest, _ := nativeEagerReceiptRequest(source)
				receipt := work.entryLawReceipts[receiptRequest.producer]
				if receipt == nil || receipt.nativeEager == nil {
					t.Logf("actual eager receipt missing effectsSource=%v", r.nativeGet.effectsSource != nil)
				} else {
					w := receipt.nativeEager
					t.Logf("actual eager receipt pendingSource=%v admitted=%v GetID=%d vectorLength=%d effectsSource=%v", w.needsSourceAdmission, w.admitted, w.get.index, len(w.vector), r.nativeGet.effectsSource != nil)
				}

				t.Logf("actual original module API reached Get=%v eagerWitness=%v completeCapability=%v", work.currentNativeCalleeEffects(source) != nil, witness, current)
				if witness {
					assertOriginalNativeEagerWitness(t, work)
					eagerCurrent++
				}
			}
			for _, recipe := range work.operationRecipes {
				if recipe.memberSource == nil || recipe.memberSource.nativeWriter == nil {
					continue
				}
				payload := recipe.memberSource.nativeWriter
				wholePayloads++
				current := work.nativeWriterCapabilityCurrent(recipe)
				if current {
					whole++
				}
				// Raw live-owned description only; no validator or predicate
				// is evaluated again for this bounded original-source log.
				if payload.source.use != nil && payload.source.use.Pos() == 745 {
					var lawKind any = "UNISSUED"
					if law := work.operationRecipes[payload.law.producer].entryLaw; law != nil {
						lawKind = law.kind
					}
					t.Logf("original745 writer payload source=%+v lawKind=%v observedGeneration=%p currentGeneration=%p key=%+v physicalCut=%+v current=%t", payload.source, lawKind, work.memberCoverageObserved[recipe.key], work.operationGeneration, recipe.key, recipe.memberSource.candidate.cut, current)
				}
			}
			t.Logf("original live module whole-writer capability payloads=%d CURRENT=%d; dispatch/current-source reachability reported separately", wholePayloads, whole)
			if wholePayloads == 0 {
				t.Log("whole payload UNISSUED; registration caller unknown")
			}
			// Issued-but-not-current remains a separate unresolved outcome;
			// these counts never establish a missing-recording diagnosis.
			if whole > 0 {
				assertOriginalNativeWriterCapability(t, work, facts, owner)
			}
			if eagerCurrent == 0 || whole == 0 {
				t.Fatal("original G4 eager/whole capability positive UNREACHED/incomplete", eagerCurrent, whole)
			}
			assertOriginalNativePopulationCapability(t, work)
		}, activeModuleCompleteAnalysis)
	}) {
		return
	}
}

func nativeWriter679FixtureSources(f *executableFixture) map[string]string {
	sources := make(map[string]string, len(f.files))
	for name, source := range f.files {
		sources[filepath.Join(f.root, name)] = source
	}
	return sources
}
