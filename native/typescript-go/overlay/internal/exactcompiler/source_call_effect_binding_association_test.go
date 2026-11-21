package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The per-call effect view used by component consumers retains the invoked
// callback body after the factory result is stored in a local binding.
func TestCallEffectBindingOperationOriginalSource(t *testing.T) {
	analysis, file := collectComponentCallProjection(t, "call-effect-binding-operation.tsx", stagedBindingInvocationSource+`export function Page(){return()=> <button onClick={()=>direct()}>read</button>}`)
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
	before := callableAnalysisFingerprint(analysis)
	view, found := callableEffectForCall(analysis, file, call.Pos())
	browser, server := false, false
	for _, effect := range view.EffectSources {
		browser = browser || effect.Environment == "browser" && effect.Description == "window"
		server = server || effect.Environment == "server"
	}
	if !found || !browser || server {
		t.Fatal("original binding consumer lost canonical body contribution", found, view)
	}
	if before != callableAnalysisFingerprint(analysis) {
		t.Fatal("descriptive binding projection changed canonical graph")
	}
}
