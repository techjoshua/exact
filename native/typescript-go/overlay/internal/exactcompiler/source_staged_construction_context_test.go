package exactcompiler

import (
	"path/filepath"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Collect the unchanged original module/import prefix with the production
// dispatcher. Deferred bodies remain indexed and unready. The callback may
// demand an original passive source, never pretend that its body was collected.
func withOriginalCacheConstructionSources(t *testing.T, inspect func([]callableFacts, *callableEffectWork, *executableBodyOwner)) {
	t.Helper()
	fixture := newStagedOriginalCacheFixture(t)
	request := fixture.request("analyze", "component-abi/opaque-operation.ts")
	request.stagedReplacement = true
	sources := make(map[string]string, len(fixture.files))
	for name, source := range fixture.files {
		sources[filepath.Join(fixture.root, name)] = source
	}
	withActiveModuleSourceWork(t, request, sources, []string{filepath.Join(fixture.root, "component/contract-versions.ts")}, inspect)
}

func TestStagedConstructionContextualPremises(t *testing.T) {
	withOriginalCacheConstructionSources(t, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		var caller *ast.Node
		for _, fact := range facts {
			if fact.summary.Name == "domainOperationPrototype" {
				caller = fact.node
				if fact.staged.ready {
					t.Fatal("original deferred body already collected")
				}
			}
		}
		if caller == nil {
			t.Fatal("original receiver owner missing")
		}
		var site *ast.Node
		walkNode(caller, func(node *ast.Node) bool {
			if ast.IsNewExpression(node) {
				site = node
			}
			return true
		})
		if site == nil {
			t.Fatal("original stored allocation missing")
		}
		root, registered := work.registerStagedConstructionEffects(facts, work.memberNodes[caller], site, owner)
		if !registered {
			t.Fatal("original passive construction missing")
		}
		key := root.producer
		phase := work.operationRecipes[stagedConstructionRequest(root, "callee").producer]
		observation := work.constructionEffectsObserved[key]
		if observation == nil || observation.constructor != nil || observation.prototype != nil || phase.delta.extracted || owner.standardConstructions[site].selectionComplete {
			t.Fatal("preservation supplied complete construction selection")
		}
		if !validStagedConstructionEffectsRecipe(phase) || !work.constructionRequiredSourcesCurrent(phase) {
			t.Fatal("actual original callee snapshot refused contextual source premises")
		}
		var expected []sourceStagedOperationRequest
		methods := 0
		coverage := sourceStagedOperationRequest{}
		for _, recipe := range work.operationRecipes {
			if source := recipe.memberSource; source != nil && source.coverage != nil && sameOperationRequest(source.parent, root) && source.coverage.cut.operation == site.Expression() {
				coverage = source.request
			}
		}
		if coverage.producer.operation == nil {
			t.Fatal("original constructor Get C missing")
		}
		for _, recipe := range work.operationRecipes {
			if source := recipe.memberSource; source != nil && source.call != nil && len(source.call.standard) != 0 && (recipe.key.operation.Pos() == 1946 || recipe.key.operation.Pos() == 2003) {
				reading := stagedStandardMemberCallReading(source.request, coverage)
				if !work.acceptedStandardMemberCallReading(reading) || !validStagedConstructionRequired(reading, phase.constructionEffects) {
					t.Fatal("actual original method reader refused")
				}
				expected = append(expected, reading)
				methods++
			}
			if source := recipe.nativeGet; source != nil && recipe.key.operation.Pos() == 745 && recipe.key.selector == (sourceStagedOperationSelector{}) {
				expected = append(expected, source.request)
			}
		}
		expected = append(expected, coverage)
		if methods != 2 || len(expected) != 4 || len(phase.delta.required) != len(expected) {
			t.Fatal("original used premise/C population changed", methods, len(expected), len(phase.delta.required))
		}
		for _, request := range expected {
			found := false
			for _, actual := range phase.delta.required {
				found = found || sameOperationRequest(request, actual)
			}
			if !found {
				t.Fatal("construction lost exact original source requirement", request.producer.selector.field)
			}
		}
		if work.passiveConstructionEffectsReady(phase) || work.closedOperationDependencies()[work.operationIDs[key].index] {
			t.Fatal("retained source premises closed unknown construction")
		}
		for _, request := range expected {
			if request.producer.selector.field != "callee-alternatives" {
				continue
			}
			for _, change := range []func(*sourceStagedOperationRequest){
				func(r *sourceStagedOperationRequest) { r.edge += "wrong" },
				func(r *sourceStagedOperationRequest) { r.cut.initializing = site },
				func(r *sourceStagedOperationRequest) {
					r.cut = sourceRelativeCut{operation: r.use, use: r.use, reading: r.use}
				},
				func(r *sourceStagedOperationRequest) {
					r.cut = sourceRelativeCut{operation: r.use, use: r.use, reading: r.use}
					r.reading = sourceStagedOperationKey{}
				},
				func(r *sourceStagedOperationRequest) { r.reading.selector.association = site },
				func(r *sourceStagedOperationRequest) { r.producer.selector.field = "unmapped-effects" },
			} {
				wrong := request
				change(&wrong)
				copy := phase
				copy.delta = cloneOperationDelta(phase.delta)
				for i, old := range copy.delta.required {
					if sameOperationRequest(old, request) {
						copy.delta.required[i] = wrong
					}
				}
				if work.constructionRequiredSourcesCurrent(copy) {
					t.Fatal("malformed contextual reader gained construction authority")
				}
			}
			stamp := work.memberCoverageObserved[request.producer]
			delete(work.memberCoverageObserved, request.producer)
			if work.constructionRequiredSourcesCurrent(phase) {
				t.Fatal("missing current method observation accepted")
			}
			work.memberCoverageObserved[request.producer] = stamp
		}
		clones := make([]callableFacts, len(facts))
		for i := range facts {
			clones[i] = cloneProjectCallableFact(facts[i])
		}
		fresh := registerCallableEffectWork(clones)
		fresh.operationGeneration = work.operationGeneration
		if fresh.constructionRequiredSourcesCurrent(fresh.operationRecipes[phase.key]) {
			t.Fatal("cloned phase borrowed old method observations")
		}
	})
}
