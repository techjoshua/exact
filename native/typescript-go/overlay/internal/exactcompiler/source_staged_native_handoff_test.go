package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Acquisition uses the existing source callee owner. These controls exercise the
// synchronous handoff only, not pre-recovery registration or algorithm coverage.
func TestStagedNativeSelectionSourceLifetime(t *testing.T) {
	withSourceCalleeWriteQuery(t, `export function invoke(){return Object.defineProperty({},'run',{value:()=>document.title})}`, func(query *sourceValueQuery, call *ast.Node) {
		view := query.receiverWriteCandidates(call, nil)
		var selected sourceValue
		for _, candidate := range view.candidates.values {
			if candidate.native != nil && candidate.native.kind == sourceNativeObjectDefineProperty {
				selected = candidate
				break
			}
		}
		if selected.native == nil {
			t.Fatal("existing source owner did not select standard alternative")
		}
		declaration := enclosingCallableNode(call)
		args := restrictedInvocationArguments(call.AsCallExpression())
		request := sourceStagedNativeRequest{
			request: sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: declaration, operation: call, kind: relativeDemandEffects}, consumer: declaration, use: call, cut: sourceRelativeCut{operation: call, use: call, reading: call}},
			call:    call, get: call.Expression(), descriptorGet: args[2],
		}
		vector := sourceStagedNativeInputs{operation: call, use: query.effectUse(), cut: query.relativeInputCut(call), known: true,
			actuals: []sourceRelativeEndpoint{{kind: relativeEndpointExpression, expression: args[0], projection: []string{"owned"}}}}
		outer, inner := 0, 0
		var delivered sourceStagedNativeSelection
		revokeOuter, ok := query.beginStagedNativeSelection(request, func(selection sourceStagedNativeSelection) {
			outer++
			delivered = selection
		})
		if !ok {
			t.Fatal("original source demand refused")
		}
		defer revokeOuter()
		outerBorrow := query.stagedNativeSelection
		revokeInner, ok := query.beginStagedNativeSelection(request, func(sourceStagedNativeSelection) { inner++ })
		if !ok {
			t.Fatal("nested source demand refused")
		}
		defer revokeInner()
		innerBorrow := query.stagedNativeSelection
		copied := *query
		if copied.publishStagedNativeSelection(call, selected, vector) || inner != 0 {
			t.Fatal("copied query inherited delivery authority")
		}
		unknownVector := vector
		unknownVector.known = false
		if query.publishStagedNativeSelection(call, selected, unknownVector) {
			t.Fatal("unknown vector became omitted arguments")
		}
		if query.publishStagedNativeSelection(args[0], selected, vector) {
			t.Fatal("different operation delivered")
		}
		originalReading := query.reading
		query.reading = declaration
		if query.publishStagedNativeSelection(call, selected, vector) {
			t.Fatal("changed observation cut delivered")
		}
		query.reading = originalReading
		if !query.publishStagedNativeSelection(call, selected, vector) || inner != 1 || outer != 0 {
			t.Fatal("selected alternative did not reach only the current issuer")
		}
		revokeInner()
		if query.stagedNativeSelection != outerBorrow || innerBorrow.deliver(query, call, selected, vector) {
			t.Fatal("nested expiry failed to restore prior issuer or revoke saved delivery")
		}
		if !query.publishStagedNativeSelection(call, selected, vector) || outer != 1 {
			t.Fatal("restored issuer did not deliver")
		}
		vector.actuals[0].projection[0] = "changed"
		if delivered.actuals[0].projection[0] != "owned" || delivered.request.use != call || delivered.request.cut != request.request.cut {
			t.Fatal("detached endpoints alias mutable vector or lost original graph cut")
		}
		revokeOuter()
		if query.stagedNativeSelection != nil || outerBorrow.deliver(query, call, selected, vector) || query.publishStagedNativeSelection(call, selected, vector) {
			t.Fatal("expired occurrence retained delivery authority")
		}
	})
}
