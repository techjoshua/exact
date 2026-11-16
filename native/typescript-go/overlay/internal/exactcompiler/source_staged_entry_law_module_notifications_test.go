package exactcompiler

import (
	"path/filepath"
	"testing"
)

// The original module's authentic phase/import registration precedes normal
// propagation initialization. No test writes a producer revision, proof, ACK or
// membership to make that module current.
func TestStagedEntryLawModuleCurrentOriginal(t *testing.T) {
	f := newStagedGlobalStoreFixture(t)
	request := f.request("analyze", "component-abi/opaque-operation.ts")
	request.stagedReplacement = true
	withActiveModuleSourceWork(t, request, nativeWriter679FixtureSources(f), []string{filepath.Join(f.root, "component/contract-versions.ts")}, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		n := work.nativeCapabilityNotifications
		if n == nil {
			t.Fatal("original module law notification membership UNREACHED")
		}
		var original sourceStagedEntryLawModuleWatch
		found := false
		for _, watches := range n.entryLaws {
			for _, w := range watches {
				recipe := work.operationRecipes[w.law.producer]
				if recipe.entryLaw == nil || recipe.entryLaw.kind != stagedEntryLawMapGet || recipe.entryLaw.entry == nil || recipe.entryLaw.entry.member == nil || w.law.use.Pos() != 745 || recipe.entryLaw.entry.member.Pos() != 781 {
					continue
				}
				original = w
				found = true
			}
		}
		if !found || !work.entryLawModuleWatchCurrent(original) {
			t.Fatal("genuine original module-current law owner UNREACHED")
		}
		state := &work.operations[original.id.index]
		sub := state.subscribers[sourceStagedOperationConsumer{original.law.consumer, original.law.edge}]
		if !work.entryLawLocallyAccounted(work.operationRecipes[state.key], original.receipt) || !state.delta.extracted || state.revision == 0 || sub == nil || sub.blocked || sub.applied != state.revision {
			t.Fatalf("original module-current publication/ACK incomplete: rev=%d X=%v sub=%+v", state.revision, state.delta.extracted, sub)
		}
		revision := state.revision
		work.indexRegisteredEntryLawModules(original.id)
		work.indexRegisteredEntryLawModules(original.id)
		if !work.publishModuleCurrentEntryLaw(original) || state.revision != revision {
			t.Fatal("already-current registration changed law semantic revision")
		}
		wrong := original
		copyReceipt := *original.receipt
		wrong.receipt = &copyReceipt
		if work.publishModuleCurrentEntryLaw(wrong) {
			t.Fatal("copied module-law receipt gained publication")
		}
		wrong = original
		wrong.law.edge += ":foreign"
		if work.publishModuleCurrentEntryLaw(wrong) {
			t.Fatal("wrong module-law factory gained publication")
		}
		wrong = original
		wrong.availability.cut = sourceRelativeCut{}
		if wrong.availability.cut == original.availability.cut {
			t.Fatal("wrong module-law cut did not change")
		}
		if work.publishModuleCurrentEntryLaw(wrong) {
			t.Fatal("wrong module-law source cut gained publication")
		}
		wrong = original
		wrong.module.producer++
		if work.publishModuleCurrentEntryLaw(wrong) {
			t.Fatal("wrong module producer gained law publication")
		}
		wrong = original
		wrong.id.epoch = new(sourceStagedOperationEpoch)
		if work.publishModuleCurrentEntryLaw(wrong) {
			t.Fatal("expired module-law watcher gained publication")
		}
		if !work.entryLawModuleWatchCurrent(original) || state.revision != revision {
			t.Fatal("module-law refusal controls lost genuine current owner")
		}
		clones := make([]callableFacts, len(facts))
		for i := range facts {
			clones[i] = cloneProjectCallableFact(facts[i])
		}
		fresh := registerCallableEffectWork(clones)
		fresh.operationGeneration = work.operationGeneration
		if fresh.nativeCapabilityNotifications != nil || fresh.publishModuleCurrentEntryLaw(original) {
			t.Fatal("cloned module-law description inherited publication authority")
		}
		t.Logf("original registered-before-init module law CURRENT/revision=%d/APPLIED=%d; repeated current registration idempotent, exact source/receipt/factory/epoch/clone refusals reached", revision, sub.applied)
	}, activeModuleCompleteAnalysis)
}
