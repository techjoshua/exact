package exactcompiler

import (
	"path/filepath"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// This entry experiment observes the unchanged original collector. It does not
// schedule a source variant or manufacture a weak contribution, Get or receipt.
// The separate unchanged GenericGet control owns full preparation acceptance.
func TestConstructedSelectionPromotionOriginalFixture(t *testing.T) {
	fixture := newStagedOriginalCacheFixture(t)
	request := fixture.request("analyze", "component-abi/opaque-operation.ts")
	request.stagedReplacement = true
	sources := make(map[string]string, len(fixture.files))
	for name, source := range fixture.files {
		sources[filepath.Join(fixture.root, name)] = source
	}
	imports := []string{filepath.Join(fixture.root, "component/contract-versions.ts")}
	var weak *sourceStagedConstructedMember
	var epoch *sourceStagedOperationEpoch
	var generation *projectGeneration
	known := make(map[sourceStagedOperationKey]sourceStagedOperationDelta)
	withActiveModuleSourceWorkSetup(t, request, sources, imports, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		for _, publisher := range owner.pendingMemberPublishers {
			if publisher.workRegistrar == nil || publisher.workRegistrar.writerScopeSource == nil {
				continue
			}
			original := publisher.workRegistrar.writerScopeSource
			publisher.workRegistrar.writerScopeSource = func(q *sourceValueQuery, r *sourceWriterInputRequest) {
				original(q, r)
				if weak != nil || q == nil || q.effectOwner == nil || q.effectOwner.Name() == nil || q.effectOwner.Name().Text() != "domainOperationPrototype" {
					return
				}
				for _, recipe := range work.operationRecipes {
					source := recipe.constructed
					if source == nil || source.request.producer.operation == nil || source.request.producer.operation.Pos() != 2085 || recipe.key.selector.field != "own-writers" || source.construction.selectionComplete {
						continue
					}
					file := ast.GetSourceFileOfNode(source.request.producer.operation)
					if file == nil || file.FileName() != filepath.Join(fixture.root, "component-abi/opaque-operation.ts") {
						continue
					}
					if !validConstructedMemberRecipe(recipe) {
						t.Fatal("actual weak source prefix invalid")
					}
					copy := cloneConstructedMemberSource(*source)
					weak = &copy
					epoch, generation = work.operationEpoch, work.operationGeneration
					for key, prior := range work.operationRecipes {
						if prior.constructed != nil && sameOperationRequest(prior.constructed.request, source.request) && prior.constructed.construction == source.construction {
							known[key] = cloneOperationDelta(prior.delta)
						}
					}
					return
				}
			}
		}
	}, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		if weak == nil {
			t.Fatal("genuine original weak constructed prefix entry UNREACHED")
		}
		if epoch != nil && work.operationEpoch != epoch || work.operationGeneration != generation {
			t.Fatal("source promotion observation crossed graph/generation")
		}
		contribution := owner.standardConstructions[weak.construction.site]
		expected := cloneConstructedMemberSource(*weak)
		expected.construction = contribution
		if !sameConstructedSelectionPromotion(weak, &expected) {
			t.Fatal("genuine same-identity constructor completion UNREACHED")
		}
		for key, prior := range known {
			recipe, exists := work.operationRecipes[key]
			if !exists || recipe.constructed == nil || !sameConstructedMemberSource(recipe.constructed, &expected) || !validConstructedMemberRecipe(recipe) || !operationDeltaPrefix(prior, recipe.delta) || prior.extracted && !recipe.delta.extracted {
				t.Fatal("promotion lost source identity, known output or required debt", key.selector.field)
			}
		}
		root := work.operationRecipes[weak.request.producer]
		matched := false
		for i := range root.constructedGroup {
			matched = matched || sameConstructedMemberSource(&root.constructedGroup[i], &expected)
		}
		if !matched {
			t.Fatal("canonical group did not retain genuine promoted source")
		}
		if work.currentStandardMethodSource(weak, owner) {
			t.Fatal("old weak snapshot borrowed complete standard authority")
		}
		if !work.freshConstructedProtocolMember(expected) {
			t.Fatal("actual original promoted member Get coverage UNREACHED")
		}
		if !work.currentStandardMethodSource(&expected, owner) {
			t.Fatal("actual promoted standard source consumer UNREACHED")
		}
		// These are real canonical descriptions and live current-source predicates;
		// final DATA/current/APPLIED is still required by the unchanged entry control.
		_ = facts
	}, activeModuleCompleteAnalysis)
}
