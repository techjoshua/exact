package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The original Set's prior writer Effects are required without acquiring its
// old DATA RHS. No analogous transfer is permitted for a value Get.
func TestStagedSetWriterSourceOriginalParent(t *testing.T) {
	withStagedAssignmentSource(t, `const target={slot:0};target.slot=1;export function invoke(){target.slot=2;return 2}`, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
		consumer := installationFactIndex(t, facts, q.effectOwner)
		work := newCallableEffectWork(facts)
		// Rebuild the independently adopted module producer through its normal
		// queue before asking the fresh function consumer to adopt its result.
		work.prepareOperationUses(facts, q.executable)
		if !work.stageAssignment(facts, consumer, operation, q.executable) {
			t.Fatal("original Set not adopted")
		}
		work.prepareOperationUses(facts, q.executable)
		closed := work.closedOperationDependencies()
		for _, state := range work.operations {
			if state.key.operation != nil && !closed[work.operationIDs[state.key].index] {
				if source := work.operationRecipes[state.key].memberSource; source != nil && source.candidate.operation != nil && source.candidate.origin != nil {
					t.Logf("candidate kind=%s pos=%d protocol=%v origin=%s", source.candidate.operation.Kind, source.candidate.operation.Pos(), source.candidate.protocol, source.candidate.origin.Kind)
				}
				t.Logf("pending operation=%s selector=%s extracted=%v required=%d", state.key.operation.Kind, state.key.selector.field, state.delta.extracted, len(state.delta.required))
			}
		}
		root := sourceStagedOperationKey{declaration: q.effectOwner, operation: operation, kind: relativeDemandEffects}
		if !closed[work.operationIDs[root].index] {
			t.Fatal("original Set parent still pending")
		}
		transferred, excluded := false, false
		for _, recipe := range work.operationRecipes {
			if recipe.memberSource != nil && recipe.memberSource.moduleExcluded != nil {
				excluded = true
				if recipe.delta.extracted || !work.passiveModuleWriterExclusionReady(recipe) {
					t.Fatal("original module receipt did not retain its immutable source envelope")
				}
				fresh := newCallableEffectWork(facts)
				fresh.operationGeneration = work.operationGeneration
				fresh.indexOperationSources(facts)
				if fresh.passiveModuleWriterExclusionReady(recipe) {
					t.Fatal("module disposition reused without this graph's original source observation")
				}
				generation := work.operationGeneration
				work.operationGeneration = &projectGeneration{}
				if work.passiveModuleWriterExclusionReady(recipe) {
					t.Fatal("expired module observation paid a source dependency")
				}
				work.operationGeneration = generation
			}
			if recipe.memberSource == nil || recipe.memberSource.protocolSource == nil || !recipe.memberSource.protocolSource.setEffects {
				continue
			}
			transferred = true
			if !validStagedSetWriterRecipe(recipe) {
				t.Fatal("original source transfer invalid")
			}
			bad := recipe
			source := *recipe.memberSource
			receipt := *source.extraction
			receipt.mode = accessorAcquire
			if source.candidate.protocol {
				source.candidate.operation = source.candidate.operation.Parent // whole assignment is not a reference Get
			} else {
				source.candidate.operation = source.candidate.operation.AsBinaryExpression().Right
			}
			source.extraction = &receipt
			bad.memberSource = &source
			if validStagedSetWriterRecipe(bad) {
				t.Fatal("unrelated operation admitted as original writer Effects")
			}
		}
		if !transferred || !excluded {
			t.Fatal("prior original writer transfer or module observation missing")
		}
	})
}
