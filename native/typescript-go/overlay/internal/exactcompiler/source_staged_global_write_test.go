package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The positive owns an original Set traversal. Cloned descriptions below never
// replay that traversal or turn a published cache into a live source issuer.
func TestStagedGlobalWriteOriginalEvent(t *testing.T) {
	for _, row := range []struct {
		name, source string
		external     bool
	}{
		{"global", `export function invoke(){const scope=globalThis as Record<PropertyKey,unknown>;scope['probe']=1;return 2}`, true},
		{"local", `export function invoke(){const scope={probe:0};scope.probe=1;return 2}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			withStagedAssignmentSource(t, row.source, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
				consumer := installationFactIndex(t, facts, q.effectOwner)
				work := newCallableEffectWork(facts)
				if !work.stageAssignment(facts, consumer, operation, q.executable) {
					t.Fatal("original Set source not represented")
				}
				work.prepareOperationUses(facts, q.executable)
				found := false
				for key, recipe := range work.operationRecipes {
					if recipe.memberSource == nil || recipe.memberSource.globalWrite == nil {
						continue
					}
					found = true
					if !validStagedGlobalWriteRecipe(recipe) || !work.currentStagedGlobalWrite(recipe) {
						t.Fatal("original external Set event did not publish current typed Effects", key)
					}
					// A later source-set attachment retains the already published event;
					// its unextracted description must not downgrade that disposition.
					revision := work.operations[work.operationIDs[key].index].revision
					if !work.attachOperationSource(facts, recipe) || !work.currentStagedGlobalWrite(recipe) || work.operations[work.operationIDs[key].index].revision != revision {
						t.Fatal("current original event lost during source-set attachment")
					}
					if len(recipe.delta.residuals) != 0 || !recipe.delta.effects[0].Opaque || recipe.delta.effects[0].provenanceIncomplete {
						t.Fatal("runtime Set encoded coverage debt")
					}
					if work.recordStagedGlobalWrite(facts, nil, key) {
						t.Fatal("missing live event stamped current Effects")
					}
					bad := recipe
					source := *recipe.memberSource
					description := *source.globalWrite
					source.globalWrite = &description
					bad.memberSource = &source
					description.mode = accessorRead
					if validStagedGlobalWriteRecipe(bad) || work.currentStagedGlobalWrite(bad) {
						t.Fatal("read event borrowed Set authority")
					}
					description = *recipe.memberSource.globalWrite
					description.cut.reading = nil
					if validStagedGlobalWriteRecipe(bad) || work.currentStagedGlobalWrite(bad) {
						t.Fatal("wrong physical cut borrowed Set authority")
					}
					generation := work.operationGeneration
					work.operationGeneration = &projectGeneration{}
					if work.currentStagedGlobalWrite(recipe) || work.publishStagedGlobalWrite(work.operationIDs[key]) {
						t.Fatal("event crossed generation")
					}
					work.operationGeneration = generation
					clones := append([]callableFacts(nil), facts...)
					for i := range clones {
						clones[i].staged = cloneCallableExtraction(clones[i].staged)
					}
					fresh := newCallableEffectWork(clones)
					fresh.operationGeneration = generation
					fresh.indexOperationSources(clones)
					if !fresh.registerOperationUse(clones, sourceStagedOperationUse{request: recipe.memberSource.request}) {
						t.Fatal("clone lost descriptive factory")
					}
					id := fresh.operationIDs[key]
					if fresh.currentStagedGlobalWrite(fresh.operationRecipes[key]) || fresh.publishStagedGlobalWrite(id) || fresh.recordStagedGlobalWrite(clones, nil, key) {
						t.Fatal("clone description minted a current event")
					}
					if fresh.operations[id.index].delta.extracted {
						t.Fatal("unissued clone source completed")
					}
					// Re-enroll the clone's real source publisher, then use the same
					// production Set entry. The typed child is already adopted here.
					restore := registerWriterInputFacts(q.executable, clones)
					defer restore()
					if !fresh.stageAssignment(clones, consumer, operation, q.executable) {
						t.Fatal("adopted clone did not receive fresh original Set and source-set finish")
					}
					fresh.prepareOperationUses(clones, q.executable)
					current := fresh.operationRecipes[key]
					if !fresh.currentStagedGlobalWrite(current) || current.memberSource.extraction == nil || fresh.operations[id.index].invalid {
						t.Fatal("clone original event/C attachment lost current noninvalid Effects")
					}
					coverage := stagedMemberCoverageRequest(current.memberSource.parent, current.memberSource.candidate.origin, current.memberSource.candidate.cut)
					if fresh.memberCoverageObserved[coverage.producer] != fresh.operationGeneration {
						t.Fatal("fresh source-set finish absent after adopted event")
					}
				}
				if found != row.external {
					t.Fatalf("typed global Set factory found=%v expected=%v", found, row.external)
				}
			})
		})
	}
}
