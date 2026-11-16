package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Readiness inspection must not create required work or make cloned source
// metadata into a current owner receipt.
func TestStagedOperationPassiveAdoptionCurrentSource(t *testing.T) {
	withStagedAssignmentSource(t, `export function invoke(){const target={slot:0};target.slot=1;return 2}`, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
		consumer := installationFactIndex(t, facts, q.effectOwner)
		work := newCallableEffectWork(facts)
		if !work.stageAssignment(facts, consumer, operation, q.executable) {
			t.Fatal("original Set did not adopt")
		}
		work.prepareOperationUses(facts, q.executable)
		key := sourceStagedOperationKey{declaration: q.effectOwner, operation: operation, kind: relativeDemandEffects}
		recipe := work.operationRecipes[key]
		root := recipe.assignment.root
		count, queue := len(work.operationIDs), len(work.extractionQueue)
		noLocal := func(sourceStagedOperationKey) (bool, bool) { return false, false }
		if !work.operationSourceRequirementsReady([]sourceStagedOperationRequest{root}, noLocal) {
			t.Fatal("current closed original producer refused")
		}
		if len(work.operationIDs) != count || len(work.extractionQueue) != queue {
			t.Fatal("readiness inspection adopted work")
		}
		changed := root
		changed.edge += ":copied"
		if work.operationSourceRequirementsReady([]sourceStagedOperationRequest{changed}, noLocal) {
			t.Fatal("unissued request reused original producer readiness")
		}
		cloned := append([]callableFacts(nil), facts...)
		for i := range cloned {
			cloned[i].staged = cloneCallableExtraction(cloned[i].staged)
		}
		fresh := newCallableEffectWork(cloned)
		fresh.operationGeneration = q.owner.generation
		fresh.indexOperationSources(cloned)
		local := func(candidate sourceStagedOperationKey) (bool, bool) {
			for _, phase := range append([]string{""}, stagedAssignmentPhases[:]...) {
				if candidate == stagedAssignmentRequest(root, phase).producer {
					return true, true
				}
			}
			return false, false
		}
		if fresh.operationSourceRequirementsReady([]sourceStagedOperationRequest{root}, local) {
			t.Fatal("fresh graph accepted cached source coverage")
		}
		if len(fresh.operationIDs) != 0 {
			t.Fatal("passive refusal issued operation IDs")
		}
	})
}

// The same conjunction engine handles source and delivery graphs. A represented
// cycle is complete only when every exit also has a positive disposition.
func TestStagedOperationSourceConjunction(t *testing.T) {
	for _, exit := range []bool{false, true} {
		result := closeOperationConjunction([]bool{true, true, exit}, [][]int{{1}, {0}, {1}})
		if result[0] != exit || result[1] != exit || result[2] != exit {
			t.Fatal("source SCC lost its required exit", result)
		}
	}
}

// An early source request cannot consume canonical definition work. The same
// FIFO owner must still visit every definition, including dormant stored bodies.
func TestStagedOperationPreparationPreservesCanonicalQueue(t *testing.T) {
	withStagedAssignmentSource(t, `export function invoke(){const target={slot:()=>document.title};target.slot=()=>window.name;return 2}`, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
		work := registerCallableEffectWork(facts)
		work.prepareOperationUses(facts, q.executable)
		if work.extractionHead != 0 {
			t.Fatal("operation preparation consumed queued definitions")
		}
		consumer := installationFactIndex(t, facts, q.effectOwner)
		dispatched := false
		for index := range facts {
			task, exists := work.nextExtraction()
			if !exists || task.operation.index != 0 || task.callable != index {
				t.Fatal("canonical definition FIFO changed", index, task)
			}
			if index == consumer && !work.stageAssignment(facts, consumer, operation, q.executable) {
				t.Fatal("original local Set did not publish operation work")
			}
			head := work.extractionHead
			work.prepareOperationUses(facts, q.executable)
			if work.extracting != index {
				t.Fatal("source callback changed canonical extraction context")
			}
			for next := head; next < len(work.extractionQueue); next++ {
				pending := work.extractionQueue[next]
				if pending.operation.index != 0 {
					if !pending.operationDone {
						t.Fatal("issued operation work did not dispatch")
					}
					dispatched = true
				}
			}
			work.finishExtraction(facts, index)
		}
		if !dispatched {
			t.Fatal("test did not traverse interleaved operation work")
		}
		if _, more := work.nextExtraction(); more {
			t.Fatal("completed operation task was executed twice")
		}
	})
}
