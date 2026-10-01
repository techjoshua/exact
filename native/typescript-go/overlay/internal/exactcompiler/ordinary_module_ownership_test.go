package exactcompiler

import (
	"strings"
	"testing"
)

func TestApplicationHelperModuleRetainsOpaqueBootstrapFacts(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			prefix := `import "@fixture/opaque-bootstrap";`
			request := Request{Kind: "compile", ID: "C:/virtual/bootstrap-helper.ts", Target: target,
				Source: prefix + `export class Counter { value=1; increment(){return ++this.value;} make(){return()=>this.increment();} }`}
			strict := NewSession().Execute(request)
			if !containsDiagnosticCode(strict.Diagnostics, "EXACT2101") {
				t.Fatalf("strict producer lost placement rejection: %#v", strict.Diagnostics)
			}
			request.PreserveOrdinaryModules = true
			application := NewSession().Execute(request)
			if application.Error != "" || len(application.Diagnostics) != 0 || !strings.Contains(application.Code, "@fixture/opaque-bootstrap") {
				t.Fatalf("host-owned bootstrap was rejected or removed: %#v", application)
			}
			unknown := false
			for _, callable := range application.Analysis.Callables {
				unknown = unknown || callable.Kind == "module-initializer" && callable.Effect == "unknown"
			}
			if !unknown {
				t.Fatal("helper compilation incorrectly claimed portable bootstrap effects")
			}
			request.Source = prefix + `export function renderBox(){ return <output>value</output>; }`
			request.ID = "C:/virtual/bootstrap-view.tsx"
			view := NewSession().Execute(request)
			if !containsDiagnosticCode(view.Diagnostics, "EXACT2101") {
				t.Fatalf("JSX producer lost placement rejection: %#v", view.Diagnostics)
			}
		})
	}
}
