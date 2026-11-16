package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Actual selected algorithms may attach their finite required sources before
// adoption. An empty graph is not a missing semantic prerequisite. Fresh Get
// receipts, exact requests and required closure remain independently necessary.
func TestStagedOperationSourceAttachmentBeforeAdoption(t *testing.T) {
	withSourceCalleeWriteQuery(t, `export function invoke(){return Object.defineProperty({},'run',{})}`, func(query *sourceValueQuery, call *ast.Node) {
		facts := installationSourceFacts(query)
		declaration := enclosingCallableNode(call)
		request := sourceStagedNativeRequest{call: call, get: call.Expression(), descriptorGet: restrictedInvocationArguments(call.AsCallExpression())[2], request: sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: declaration, operation: call, kind: relativeDemandEffects}, consumer: declaration, edge: "attach-before-adoption", use: call, cut: sourceRelativeCut{operation: call, use: call, reading: call}}}
		work := callableEffectWork{extracting: -1}
		observe := func() *sourceStagedNativeOccurrence {
			occurrence := &sourceStagedNativeOccurrence{}
			issued := request
			issued.occurrence = occurrence
			revoke, ok := query.beginStagedNativeGetSource(&work, facts, issued, consumeStagedNativeDescriptorAlgorithm)
			if !ok {
				t.Fatal("original source issuer refused")
			}
			query.receiverCandidates(call, nil)
			revoke()
			return occurrence
		}
		first := observe()
		if first.source == nil {
			t.Fatal("original selected source missing")
		}
		algorithm := work.operationRecipes[nativeRootDebtRequest(first.source, "algorithm").producer]
		if algorithm.nativeGet == nil || algorithm.nativeGet.descriptorGet != request.descriptorGet || len(algorithm.delta.required) != 6 {
			t.Fatal("source attachment required an adopted consumer")
		}
		if len(work.operationIDs) != 0 || len(facts[work.memberNodes[declaration]].staged.operationUses) != 0 {
			t.Fatal("passive source attachment activated consumer")
		}
		for _, field := range algorithm.delta.required {
			if _, exists := work.operationRecipes[field.producer]; !exists {
				t.Fatal("field source membership missing before adoption")
			}
		}
		// An unchanged source description can be re-observed without replacing its
		// refined envelope by empty debts. Only this new live Get supplies its receipt.
		second := observe()
		if first.callee == nil || second.callee == nil || first.callee == second.callee {
			t.Fatal("missing fresh original Get receipt")
		}
		if !work.adoptNativeInputOccurrence(facts, second) {
			t.Fatal("registered original source could not be adopted")
		}
		root := work.operationIDs[request.request.producer]
		if root.index == 0 || work.closedOperationDependencies()[root.index] {
			t.Fatal("adoption paid pending field obligations")
		}
	})
}
