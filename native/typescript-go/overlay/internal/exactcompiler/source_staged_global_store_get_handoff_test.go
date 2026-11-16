package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// A source-only Get may finish before its child Call can be adopted. Its actual
// proof pays an existing Get ticket, while absence of that ticket cannot create
// ordinary membership. Repeated real observations publish idempotently.
func TestStagedGlobalStoreSelectedGetExistingTicket(t *testing.T) {
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
		root, owned := stagedNativeInputOccurrenceRequest(&facts[caller], call)
		if !owned {
			t.Fatal("original native source request")
		}
		request := sourceStagedNativeRequest{algorithmKind: sourceNativeObjectFreeze, call: call, get: call.Expression(), request: root}
		first, visited := work.observeSelectedNativeGetSource(facts, caller, request, owner)
		if !visited || first.source == nil || first.callee == nil || !validStagedNativeCalleeEffects(*first.callee, first.source) {
			t.Fatal("actual original Get proof absent")
		}
		if len(work.operationIDs) != 0 {
			t.Fatal("source proof adopted an undemanded operation")
		}
		get := nativeRootDebtRequest(first.source, "callee-get")
		id, adopted := work.requireOperation(facts, get)
		if !adopted || work.operations[id.index].nativeCallee != nil {
			t.Fatal("Get description became observation before actual source")
		}
		second, visited := work.observeSelectedNativeGetSource(facts, caller, request, owner)
		state := &work.operations[id.index]
		if !visited || second.callee == nil || state.nativeCallee == nil || !state.delta.extracted || !validStagedNativeCalleeEffects(*state.nativeCallee, second.source) {
			t.Fatal("existing Get ticket did not receive its original fresh proof")
		}
		revision, proof := state.revision, state.nativeCallee
		third, visited := work.observeSelectedNativeGetSource(facts, caller, request, owner)
		if !visited || third.callee == nil || work.operations[id.index].revision != revision || work.operations[id.index].nativeCallee != proof {
			t.Fatal("same original proof republished a revision")
		}
		wrong := request
		wrong.request.cut.initializing = call
		if _, visited := work.observeSelectedNativeGetSource(facts, caller, wrong, owner); visited {
			t.Fatal("wrong source factory borrowed an adopted Get")
		}
		if _, adopted := work.operationIDs[root.producer]; adopted || len(facts[caller].staged.operationUses) != 0 || len(facts[caller].summary.Calls) != 0 {
			t.Fatal("Get receipt adopted a Call or entered a body")
		}
	})
}
