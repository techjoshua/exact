package exactcompiler

import (
	"path/filepath"
	"testing"
)

// Inspect only genuine source requests produced by the maintained collector.
// The first resolve remains owned by this live callback; no task, observation,
// dependency, revision, subscriber or acknowledgement is installed by the test.
func TestStagedWriterPendingPrerequisiteOriginalSource(t *testing.T) {
	fixture := newStagedOriginalCacheFixture(t)
	request := fixture.request("analyze", "component-abi/opaque-operation.ts")
	request.stagedReplacement = true
	sources := make(map[string]string, len(fixture.files))
	for name, source := range fixture.files {
		sources[filepath.Join(fixture.root, name)] = source
	}
	imports := []string{filepath.Join(fixture.root, "component/contract-versions.ts")}
	withActiveModuleSourceWork(t, request, sources, imports, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		witnessed := false
		for key, recipe := range work.operationRecipes {
			if key.operation == nil || key.operation.Pos() != 2202 || !descriptorCalleeRequested(recipe) {
				continue
			}
			id := work.operationIDs[key]
			if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
				t.Fatal("original descriptor source adoption UNREACHED")
			}
			state := &work.operations[id.index]
			if state.writerSourceRevisions != nil || state.writerSourceRunning {
				continue
			}
			queued := false
			for _, task := range work.extractionQueue[work.extractionHead:] {
				queued = queued || task.operation == id && !task.operationDone && !task.delivery
			}
			if queued {
				continue
			}
			for _, dependency := range state.dependencies {
				if !work.writerSourcePendingDependencyOwned(id, dependency) {
					continue
				}
				if !work.writerSourceTaskOwned(id) || state.delta.extracted || work.descriptorCalleeCurrent(recipe) {
					t.Fatal("genuine unpaid continuation lost ownership or acquired callee coverage")
				}
				// These are detached request/ID descriptions. The real graph and source
				// publisher are unchanged throughout the refusal checks.
				wrong := dependency
				wrong.request.cut.operation = nil
				if work.writerSourcePendingDependencyOwned(id, wrong) {
					t.Fatal("foreign child cut supplied continuation ownership")
				}
				wrong = dependency
				wrong.producer.epoch = nil
				if work.writerSourcePendingDependencyOwned(id, wrong) {
					t.Fatal("foreign child epoch supplied continuation ownership")
				}
				wrong = dependency
				wrong.producer = id
				if work.writerSourcePendingDependencyOwned(id, wrong) {
					t.Fatal("self dependency supplied unobserved continuation ownership")
				}
				if work.writerSourcePendingDependencyOwned(id, sourceStagedOperationDependency{}) {
					t.Fatal("missing child supplied continuation ownership")
				}
				foreign := recipe
				foreign.memberSource = cloneStagedMemberSource(recipe.memberSource)
				foreign.memberSource.generation = nil
				if work.requestedWriterSourceSupported(foreign) || work.descriptorCalleeCurrent(foreign) {
					t.Fatal("foreign source generation supplied supported/current source")
				}
				witnessed = true
				break
			}
		}
		if !witnessed {
			t.Fatal("original unobserved source with unpaid child continuation UNREACHED")
		}
		t.Log("original unobserved continuation owned; source Get/current/closure remain independent")
	}, activeModuleBeforeResolution)
}
