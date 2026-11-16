package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// A real original binding DATA use must reach its invocation-effect consumer.
// Reuse the existing source/runtime fixture: no graph state or receipt is injected.
func TestCallEffectBindingOperationOriginalSource(t *testing.T) {
	analysis, file := collectComponentCallProjection(t, "call-effect-binding-operation.ts", stagedBindingInvocationSource)
	var caller *callableFacts
	for i := range analysis.facts {
		if analysis.facts[i].summary.Name == "direct" {
			caller = &analysis.facts[i]
		}
	}
	if caller == nil {
		t.Fatal("original binding caller UNREACHED")
	}
	var call *ast.Node
	walkNode(caller.node.Body(), func(node *ast.Node) bool {
		if ast.IsCallExpression(node) && ast.IsIdentifier(node.Expression()) && node.Expression().Text() == "fn" {
			if call != nil {
				t.Fatal("ambiguous original invocation")
			}
			call = node
		}
		return true
	})
	if call == nil {
		t.Fatal("original fn Call UNREACHED")
	}
	reached := false
	for _, use := range caller.staged.operationUses {
		reached = reached || use.request.producer.operation == call.Expression() && use.request.consumer == caller.node
	}
	if !reached || caller.staged.operationsPending {
		t.Fatal("real binding use/current source closure UNREACHED", reached, caller.staged.operationsPending)
	}
	edges := 0
	for _, edge := range caller.summary.Calls {
		if caller.fieldEdgeOperations[edge.ID] == call && edge.Resolved {
			edges++
		}
	}
	if edges != 1 {
		t.Fatal("one authenticated binding invocation effect association UNREACHED", edges)
	}
	before := callableAnalysisFingerprint(analysis)
	view, found := callableEffectForCall(analysis, file, call.Pos())
	browser, unknown := false, false
	for _, effect := range view.EffectSources {
		browser = browser || effect.Environment == "browser" && effect.Description == "window"
		unknown = unknown || effect.Environment == "unknown"
	}
	if !found || !browser || unknown || view.Effect != "browser" {
		t.Fatal("original binding consumer lost canonical body contribution", found, view)
	}
	if before != callableAnalysisFingerprint(analysis) {
		t.Fatal("descriptive binding projection changed canonical graph")
	}
}
