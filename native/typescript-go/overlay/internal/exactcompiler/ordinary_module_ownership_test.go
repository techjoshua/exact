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

func TestRunnerOwnsOpaqueInitializersBesideComponentDefinitions(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		request := Request{Kind: "compile", ID: "C:/virtual/counter.test.tsx", Target: target,
			PreserveOrdinaryModules: true,
			Source:                  `import {describe} from "vitest"; export function Counter(this:{state:{count:number}}){this.state.count=0;return()=> <button>{this.state.count}</button>;} describe("Counter",()=>{});`}
		response := NewSession().Execute(request)
		if response.Error != "" || len(response.Diagnostics) != 0 || !strings.Contains(response.Code, "describe(") || len(response.Analysis.Components) != 1 {
			t.Fatalf("runner-owned initialization rejected or component lost: %#v", response)
		}
		request.PreserveOrdinaryModules = false
		if strict := NewSession().Execute(request); !containsDiagnosticCode(strict.Diagnostics, "EXACT2101") {
			t.Fatalf("strict test producer lost initializer validation: %#v", strict.Diagnostics)
		}
		request.PreserveOrdinaryModules = true
		request.ID = "C:/virtual/counter.tsx"
		if production := NewSession().Execute(request); !containsDiagnosticCode(production.Diagnostics, "EXACT2101") {
			t.Fatalf("production component lost initializer validation: %#v", production.Diagnostics)
		}
	}
}

func TestHostOwnedTestFilenameContract(t *testing.T) {
	for _, filename := range []string{"Counter.test.tsx", "/src/Counter.spec.mts", `C:\src\Counter.jest.cts`, "/src/COUNTER.TEST.JSX"} {
		if !hostOwnedTestFilename(filename) {
			t.Errorf("test filename was not recognized: %s", filename)
		}
	}
	for _, filename := range []string{"/src/Counter.tsx", "/src/test/Counter.tsx", "/src/Counter.test.tsx.backup", "/src/Counter.test.d.ts"} {
		if hostOwnedTestFilename(filename) {
			t.Errorf("ordinary filename was treated as a test: %s", filename)
		}
	}
}
