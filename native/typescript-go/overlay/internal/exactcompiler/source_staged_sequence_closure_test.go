package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

func TestStagedSequenceSourceClosure(t *testing.T) {
	withSourceCalleeWriteQuery(t, stagedReturnedInstalledWitness, func(query *sourceValueQuery, reader *ast.Node) {
		facts := installationSourceFacts(query)
		work := callableEffectWork{extracting: -1}
		var writer *ast.Node
		walkNode(enclosingCallableNode(reader).Body(), func(node *ast.Node) bool {
			if writer == nil && ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.Expression()) && callableNameText(node.Expression().Name()) == "defineProperty" {
				writer = node
			}
			return !ast.IsFunctionLike(node)
		})
		registerInstallationSource(t, &work, facts, query, writer)
		registerInstallationSource(t, &work, facts, query, reader)
		work.prepareOperationUses(facts, query.executable)
		closed := work.closedOperationDependencies()
		count := 0
		for i := 1; i < len(work.operations); i++ {
			state := &work.operations[i]
			if closed[i] {
				continue
			}
			count++
			blocked := 0
			for _, sub := range state.subscribers {
				if sub.blocked {
					blocked++
				}
			}
			t.Logf("pending op=%d field=%q kind=%d extracted=%t rev=%d req=%d getters=%d valuesReady=%v blocked=%d", state.key.operation.Pos(), state.key.selector.field, state.key.kind, state.delta.extracted, state.revision, len(state.dependencies), len(state.getters), state.fieldValueReady, blocked)
		}
		if count != 0 {
			t.Fatalf("%d source producers remain pending", count)
		}
		cloned := make([]callableFacts, len(facts))
		for i := range facts {
			cloned[i] = cloneProjectCallableFact(facts[i])
		}
		fresh := callableEffectWork{extracting: -1}
		fresh.prepareOperationUses(cloned, query.executable)
		if fresh.operationEpoch == work.operationEpoch {
			t.Fatal("cloned work retained graph authority")
		}
		for i, ready := range fresh.closedOperationDependencies() {
			if i != 0 && !ready {
				t.Fatalf("clone required source %d did not rebuild its disposition", i)
			}
		}
		for i := 1; i < len(fresh.operations); i++ {
			state := &fresh.operations[i]
			if state.nativeTarget == nil {
				continue
			}
			if state.nativeTarget == work.operations[work.operationIDs[state.key].index].nativeTarget {
				t.Fatal("clone reused source target receipt")
			}
			saved := *state.nativeTarget
			expired := saved
			expired.generation = &projectGeneration{}
			state.nativeTarget = &expired
			if fresh.closedOperationDependencies()[i] {
				t.Fatal("expired target generation granted closure")
			}
			state.nativeTarget = &saved
		}

	})
}
