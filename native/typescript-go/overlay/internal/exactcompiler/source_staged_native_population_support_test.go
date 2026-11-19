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
