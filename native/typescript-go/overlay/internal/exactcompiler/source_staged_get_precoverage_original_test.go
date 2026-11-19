package exactcompiler

import (
	"path/filepath"
	"testing"
)

// This uses the unchanged original source and maintained live collector. A
// registration-only path cannot pass: source currency, the new reader's actual
// delivery and the original Get preparation must all precede the refusals.
func TestStagedGetPrecoverageModuleSourceOriginal(t *testing.T) {
	fixture := newStagedOriginalCacheFixture(t)
	request := fixture.request("analyze", "component-abi/opaque-operation.ts")

	sources := make(map[string]string, len(fixture.files))
	for name, source := range fixture.files {
		sources[filepath.Join(fixture.root, name)] = source
	}
	imports := []string{filepath.Join(fixture.root, "component/contract-versions.ts")}
	withActiveModuleSourceWork(t, request, sources, imports, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		reached := false
		for _, recipe := range work.operationRecipes {
			if !validStagedGetPreparationRecipe(recipe) || !recipe.memberSource.getPreparation.plain || recipe.memberSource.parent.producer.operation.Pos() != 2187 {
				continue
			}
			for i, entry := range recipe.memberSource.getPreparation.readings {
				if entry.source.producer.operation.Pos() != 730 {
					continue
				}
				reached = true
				if entry.source.producer.declaration == entry.reading.consumer || !runtimeModuleEvaluation(entry.source.producer.declaration) || entry.source.producer != entry.reading.producer || entry.reading.reading != recipe.key {
					t.Fatal("original module source was retargeted to its Get reader")
				}
				if !work.getPreparationSourceReadingCurrent(entry.reading) || !work.getPreparationReadingCurrent(recipe.memberSource.request) {
					t.Fatal("original module source/reader/preparation CURRENT and APPLIED UNREACHED")
				}
				get := work.operationRecipes[recipe.memberSource.parent.producer]
				if !validStagedMemberExternalGetRecipe(get) || !sameOperationRequest(get.memberSource.protocolSource.get.preparation, recipe.memberSource.request) || !operationContainsRequest(get.delta.required, recipe.memberSource.request) {
					t.Fatal("original Get omitted its named preparation sibling")
				}
				missing := get
				missing.delta = cloneOperationDelta(get.delta)
				missing.delta.required = missing.delta.required[:1]
				if validStagedMemberExternalGetRecipe(missing) {
					t.Fatal("Get publication dropped its preparation debt")
				}
				id := work.operationIDs[recipe.key]
				observation := work.operations[id.index].getPreparationObserved
				if observation == nil || !operationContainsRequest(observation.required, entry.reading) {
					t.Fatal("original Get observation omitted its source reader")
				}
				copied := *observation
				if work.getPreparationObservedCurrent(id, &copied) {
					t.Fatal("copied observation became a new original Get")
				}
				bad := recipe
				bad.memberSource = cloneStagedMemberSource(recipe.memberSource)
				if &bad.memberSource.getPreparation.readings[i] == &recipe.memberSource.getPreparation.readings[i] {
					t.Fatal("clone retained mutable source-reading metadata")
				}
				bad.memberSource.getPreparation.readings[i].context.initializing = entry.source.producer.operation
				if validStagedGetPreparationRecipe(bad) {
					t.Fatal("foreign initialization context accepted")
				}
				bad = recipe
				bad.memberSource = cloneStagedMemberSource(recipe.memberSource)
				bad.memberSource.getPreparation.readings[i].source.consumer = entry.reading.consumer
				if validStagedGetPreparationRecipe(bad) {
					t.Fatal("module source consumer replaced by reader consumer")
				}
				foreign := entry.reading
				foreign.consumer = entry.source.consumer
				if work.acceptedGetPreparationSourceReading(foreign) {
					t.Fatal("foreign reader accepted")
				}
				foreign = entry.reading
				foreign.reading = sourceStagedOperationKey{}
				if work.acceptedGetPreparationSourceReading(foreign) {
					t.Fatal("source reader accepted without its preparation owner")
				}
			}
		}
		if !reached {
			t.Fatal("original module730 to Get2187 preparation connection UNREACHED")
		}
	})
}
