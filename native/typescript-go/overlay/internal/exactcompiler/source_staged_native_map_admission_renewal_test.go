package exactcompiler

import (
	"path/filepath"
	"testing"
)

// A real refined source protocol must survive later initial-description reuse.
// This passive API cannot renew any graph-local observation or capability.
func TestStagedNativeMapAdmissionDescriptionRetainsRefinement(t *testing.T) {
	f := newStagedGlobalStoreFixture(t)
	request := f.request("analyze", "component-abi/opaque-operation.ts")

	withActiveModuleSourceWork(t, request, nativeWriter679FixtureSources(f), []string{filepath.Join(f.root, "component/contract-versions.ts")}, func(facts []callableFacts, w *callableEffectWork, _ *executableBodyOwner) {
		found := false
		for key, prior := range w.operationRecipes {
			if prior.nativeGet == nil || prior.nativeGet.kind != sourceNativeObjectDefineProperties || prior.mapProtocol == nil || !prior.mapProtocol.entriesRegistered || !validStagedMapProtocolRecipe(prior) || key != prior.nativeGet.descriptorMap.protocol.producer {
				continue
			}
			id := w.operationIDs[key]
			if id.epoch != w.operationEpoch || id.index == 0 || !w.operations[id.index].delta.extracted || len(prior.delta.required) == 0 {
				continue
			}
			found = true
			revision := w.operations[id.index].revision
			observed := w.operations[id.index].mapSourceObserved
			description := sourceStagedOperationRecipe{key: key, nativeGet: prior.nativeGet}
			if w.registerOperationRecipe(facts, description) {
				t.Fatal("unrefined registration unexpectedly replaced sealed map protocol")
			}
			if !w.registerOperationSourcePrefix(facts, description) || !w.registerOperationSourcePrefix(facts, description) {
				t.Fatal("genuine original initial description could not reuse refined map protocol")
			}
			retained := w.operationRecipes[key]
			if retained.mapProtocol != prior.mapProtocol || !operationDeltaPrefix(prior.delta, retained.delta) || !operationDeltaPrefix(retained.delta, prior.delta) || w.operations[id.index].revision != revision || w.operations[id.index].mapSourceObserved != observed {
				t.Fatal("description reuse changed map source extraction, requirements or observation")
			}
			for _, r := range prior.delta.required {
				child := w.operationIDs[r.producer]
				if child.epoch != w.operationEpoch || child.index == 0 || w.operations[child.index].subscribers[sourceStagedOperationConsumer{r.consumer, r.edge}] == nil {
					t.Fatal("description reuse lost actual required child membership")
				}
			}
			source := *prior.nativeGet
			plan := *source.descriptorMap
			plan.protocol.edge += ":foreign"
			source.descriptorMap = &plan
			bad := description
			bad.nativeGet = &source
			if w.registerOperationSourcePrefix(facts, bad) {
				t.Fatal("foreign map factory reused refined source")
			}
			source = *prior.nativeGet
			source.request.cut = sourceRelativeCut{}
			if source.request.cut == prior.nativeGet.request.cut {
				t.Fatal("wrong map cut mutation was unchanged")
			}
			bad.nativeGet = &source
			if w.registerOperationSourcePrefix(facts, bad) {
				t.Fatal("wrong map source cut reused refined source")
			}
			t.Logf("actual refined map protocol retains %d ordered children and revision%d across description reuse", len(prior.delta.required), revision)
			break
		}
		if !found {
			t.Fatal("genuine refined original map protocol UNREACHED")
		}
	}, activeModuleCompleteAnalysis)
}
