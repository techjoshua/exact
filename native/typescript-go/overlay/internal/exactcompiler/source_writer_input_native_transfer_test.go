package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Supplied scoped transfers protect this consumer's lifetime and atomic proof
// retention. Actual native receipt authority is exercised by the original cache
// composition and native-result source controls, not inferred by this test.
func TestWriterInputNativeTransferLifetime(t *testing.T) {
	for _, fixture := range []struct {
		argument string
		complete bool
	}{{`{}`, true}, {`value`, false}} {
		withWriterInputGraph(t, `export function invoke(value:object){return Object.assign(Object.create(null),`+fixture.argument+`)}`, func(parent *sourceValueQuery, _ *ast.Node, graph *sourceWriterInputGraph) {
			var call *ast.Node
			walkNode(parent.effectOwner.Body(), func(node *ast.Node) bool {
				if ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.Expression()) && node.Expression().Name().Text() == "assign" {
					call = node
				}
				return true
			})
			q := newSourceDependencyQuery(call, parent.owner.checker, parent.executable, parent.effectOwner)
			request := sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: q.effectOwner, operation: call, kind: relativeDemandEffects}, consumer: q.effectOwner, use: call, edge: "native-input-exposure", cut: sourceRelativeCut{operation: call, use: call, reading: call}}
			revoke, installed := q.beginStagedMemberSource(request, func(sourceStagedMemberCandidate) bool { return true }, func(sourceStagedMemberDisposition) bool { return true })
			if !installed {
				t.Fatal("source consumer interval")
			}
			defer revoke()
			get := &sourceGetInputs{operation: call}
			cut := &sourceMemberWriterReadCut{operation: call, use: call}
			leave := q.enterStagedMemberSource(get, cut, nil)
			defer leave()
			borrow := q.stagedMember
			input := call.AsCallExpression().Arguments.Nodes[0]
			required := sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: q.effectOwner, operation: input, kind: relativeDemandEffects}, consumer: q.effectOwner, use: input, edge: "actual-native-input", cut: sourceRelativeCut{operation: input, use: input, reading: input}}
			calls := 0
			borrow.returnResult = func(expression *ast.Node, _ sourceCallResultInterest) sourceStagedCallResultTransfer {
				calls++
				if q.transferStagedCallReturn(expression, sourceCallResultInterest{purpose: resultCallableExposure}).accepted {
					t.Fatal("reentry inherited the transfer interval")
				}
				if expression != input {
					return sourceStagedCallResultTransfer{}
				}
				return sourceStagedCallResultTransfer{accepted: true, noncallable: true, required: required}
			}
			r := q.registerWriterInputRequest(call)
			if r == nil || r.graph != graph {
				t.Fatal("original argument request")
			}
			defer r.revoke()
			copied := *q
			if r.excludeDiscovery(&copied, nil) || len(borrow.selectionRequired) != 0 {
				t.Fatal("copied query borrowed argument authority")
			}
			q.initializing = input
			if r.excludeDiscovery(q, nil) || calls != 0 || len(borrow.selectionRequired) != 0 {
				t.Fatal("wrong physical cut borrowed argument authority")
			}
			q.initializing = nil
			if excluded := r.excludeDiscovery(q, nil); excluded != fixture.complete {
				t.Fatal("conditional noncallable argument disposition", excluded)
			}
			if fixture.complete {
				if len(borrow.selectionRequired) != 1 || !sameOperationRequest(borrow.selectionRequired[0], required) {
					t.Fatal("successful exclusion lost its exact full Effects root")
				}
			} else if len(borrow.selectionRequired) != 0 || calls != 2 {
				t.Fatal("later pending component leaked a successful-used selection premise")
			}
			// Accepted registration without a noncallable law is still pending.
			borrow.selectionRequired = nil
			borrow.returnResult = func(_ *ast.Node, _ sourceCallResultInterest) sourceStagedCallResultTransfer {
				return sourceStagedCallResultTransfer{accepted: true}
			}
			if r.excludeDiscovery(q, nil) || len(borrow.selectionRequired) != 0 {
				t.Fatal("registration became a category proof")
			}
			revoke()
			if r.excludeDiscovery(q, nil) {
				t.Fatal("revoked source interval retained a transfer")
			}
			r.revoke()
			if r.excludeDiscovery(q, nil) || r.issuer != nil {
				t.Fatal("expired argument request retained authority")
			}
		})
	}
}
