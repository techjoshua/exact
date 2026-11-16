package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

func TestStagedNativePopulationCountZeroUnchanged(t *testing.T) {
	withReflectiveRelevanceSource(t, `export function invoke(){return Object.freeze({})}`, func(owner *executableBodyOwner, file *ast.SourceFile) {
		var call *ast.Node
		walkNode(file.AsNode(), func(n *ast.Node) bool {
			if ast.IsCallExpression(n) {
				call = n
			}
			return true
		})
		facts := stagedReturnSourceFacts(file)
		work := registerCallableEffectWork(facts)
		restore := registerWriterInputFacts(owner, facts)
		defer restore()
		caller := work.memberNodes[enclosingCallableNode(call)]
		root, ok := stagedNativeInputOccurrenceRequest(&facts[caller], call)
		if !ok {
			t.Fatal("original source request")
		}
		occurrence, visited := work.observeSelectedNativeGetSource(facts, caller, sourceStagedNativeRequest{algorithmKind: sourceNativeObjectFreeze, call: call, get: call.Expression(), request: root}, owner)
		if !visited || occurrence.source == nil {
			t.Fatal("original Get source absent")
		}
		algorithm := work.operationRecipes[nativeRootDebtRequest(occurrence.source, "algorithm").producer].nativeGet
		if algorithm == nil || nativeMemberCallRequirementCount(algorithm) != 0 || !stagedNativeOrdinaryInputResult(algorithm) || !work.currentNativeOrdinaryInputResult(algorithm) || len(work.operationIDs) != 0 {
			t.Fatal("old count-zero source domain gained a new observation requirement")
		}
	})
}

// Only the actual Session's publication is inspected here. Cache descriptions
// cannot be re-entered to reconstruct a current Get or a canonical Call edge.
func assertGlobalStoreSessionNativePopulation(t *testing.T, session *Session) {
	t.Helper()
	found := false
	for _, project := range session.projects {
		cache := project.callableCache
		if cache == nil {
			continue
		}
		work := registerCallableEffectWork(cache.merged.facts)
		for _, recipe := range work.operationRecipes {
			source := recipe.nativeGet
			if source == nil || recipe.key.operation.Pos() != 745 || recipe.key.declaration != sourceStagedModuleOwner(recipe.key.operation) || source.kind != sourceNativeObjectDefineProperties || recipe.key != nativeRootDebtRequest(source, "algorithm").producer {
				continue
			}
			// The original root can retain a population while this immutable
			// algorithm remains count zero. Compare this snapshot's exact factory
			// requirements; cached metadata cannot create current authority.
			expected, represented := work.nativeAlgorithmEntryDependencies(source)
			law, _ := stagedEntryLawRequest(nativeRootDebtRequest(source, "algorithm"), stagedEntryLawNativeAlgorithm)
			entry := work.operationRecipes[law.producer]
			if !represented || !validStagedEntryLawRecipe(entry) || !operationPrefix(expected, entry.delta.required, sameOperationRequest) || !operationPrefix(entry.delta.required, expected, sameOperationRequest) {
				t.Fatalf("actual Session native population not represented: algorithmCount=%d sourceKey=%+v represented=%v expected=%d lawRequired=%d", nativeMemberCallRequirementCount(source), recipe.key, represented, len(expected), len(entry.delta.required))
			}
			published := false
			for _, fact := range cache.merged.facts {
				if fact.node == source.request.consumer {
					published = fact.staged.settled && !fact.staged.operationsPending
					if !published {
						t.Logf("original publication owner id=%q node=%v@%d/%p sourceConsumer=%p producerDeclaration=%p originalModule=%p sourceFileCurrent=%v cacheProgramCurrent=%v cacheGenerationCurrent=%v ready=%v settled=%v operationsPending=%v pendingCount=%d", fact.summary.ID, fact.node.Kind, fact.node.Pos(), fact.node, source.request.consumer, source.request.producer.declaration, sourceStagedModuleOwner(source.request.use), project.program.GetSourceFile(fact.sourceFile.FileName()) == fact.sourceFile, cache.program == project.program, cache.owner.values.generation == project.activeGeneration, fact.staged.ready, fact.staged.settled, fact.staged.operationsPending, len(fact.staged.pending))
					}
				}
			}
			if !published {
				t.Fatal("actual Session native population owner has not published")
			}
			found = true
		}
	}
	if !found {
		t.Fatal("actual original Session algorithm source absent")
	}
}
