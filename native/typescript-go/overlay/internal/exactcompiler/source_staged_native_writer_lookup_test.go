package exactcompiler

import (
	"path/filepath"
	"testing"
)

// The real nested Freeze lookup is current although invoking Freeze on its
// nonliteral input needs independent algorithm capabilities and full Effects.
func TestStagedNativeWriterOriginalLookupRequirement(t *testing.T) {
	f := newStagedGlobalStoreFixture(t)
	request := f.request("analyze", "component-abi/opaque-operation.ts")

	withActiveModuleSourceWork(t, request, nativeWriter679FixtureSources(f), []string{filepath.Join(f.root, "component/contract-versions.ts")}, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		reached := false
		for _, recipe := range work.operationRecipes {
			native := recipe.nativeGet
			if native == nil || native.kind != sourceNativeObjectFreeze {
				continue
			}
			reading := nativeRootDebtRequest(native, "callee-get")
			if recipe.key != reading.producer || stagedNativeCallNoUserEntry(native, native.request.use) {
				continue
			}
			proof := work.currentNativeCalleeEffects(native)
			if !validNativeGetRecipe(recipe) || proof == nil || !proof.noUserEntry || !work.nativeWriterCapabilityApplied(reading) {
				continue
			}
			reached = true
			for _, role := range []string{"algorithm", "eager-inputs"} {
				adjacent := nativeRootDebtRequest(native, role)
				if sameOperationRequest(reading, adjacent) {
					t.Fatal("adjacent phase matched canonical lookup")
				}
			}
			if sameOperationRequest(reading, native.request) {
				t.Fatal("whole Call matched canonical lookup")
			}
			wrong := reading
			wrong.cut = sourceRelativeCut{}
			if wrong.cut == reading.cut {
				t.Fatal("lookup cut mutation did not change actual cut")
			}
			if sameOperationRequest(wrong, reading) || work.nativeWriterCapabilityApplied(wrong) {
				t.Fatal("wrong full lookup cut acquired delivered capability")
			}
			wrong = reading
			wrong.edge += ":foreign"
			if work.nativeWriterCapabilityApplied(wrong) {
				t.Fatal("foreign lookup request acquired delivered capability")
			}
			clones := make([]callableFacts, len(facts))
			for i := range facts {
				clones[i] = cloneProjectCallableFact(facts[i])
			}
			fresh := registerCallableEffectWork(clones)
			fresh.operationGeneration = owner.values.generation
			if fresh.currentNativeCalleeEffects(native) != nil || fresh.nativeWriterCapabilityApplied(reading) {
				t.Fatal("cloned lookup description inherited current capability")
			}
			t.Logf("genuine Get current/APPLIED independently of whole Call intrinsic law: operation=%d id=%+v", native.request.use.Pos(), work.operationIDs[reading.producer])
			break
		}
		if !reached {
			t.Fatal("original non-intrinsic Freeze lookup positive UNREACHED")
		}
	}, activeModuleCompleteAnalysis)
}
