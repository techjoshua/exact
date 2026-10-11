package exactcompiler

import (
	"strings"
	"testing"
)

func TestDynamicComponentHelperLowersOnlyClientCapability(t *testing.T) {
	source := `
		import {createDynamicComponent} from '@exactjs/core';
		function Panel() { return () => <p>ready</p>; }
		export function Page() {
			const Selected = createDynamicComponent(() => Panel);
			return () => <Selected label="client" />;
		}
	`
	client := NewSession().Execute(Request{
		ID: "dynamic-helper.tsx", Kind: "compile", Target: TargetClient, Source: source,
	})
	if client.Error != "" {
		t.Fatal(client.Error)
	}
	for _, expected := range []string{
		"@exactjs/core/runtime/dynamic-components",
		"createCompiledDynamicComponent",
		"source: Selected",
		`"dynamic-components"`,
	} {
		if !strings.Contains(client.Code, expected) {
			t.Fatalf("client dynamic helper output omitted %q:\n%s", expected, client.Code)
		}
	}
	if hasDiagnosticCode(client.Diagnostics, "EXACT2213") {
		t.Fatalf("typed dynamic helper produced an opaque-selection warning: %#v", client.Diagnostics)
	}

	server := NewSession().Execute(Request{
		ID: "dynamic-helper.tsx", Kind: "compile", Target: TargetServer, Source: source,
	})
	if server.Error != "" {
		t.Fatal(server.Error)
	}
	if !strings.Contains(server.Code, "createServerDynamicComponent") ||
		strings.Contains(server.Code, "createCompiledDynamicComponent") {
		t.Fatalf("server dynamic helper did not lower to its inert projection:\n%s", server.Code)
	}
	if !strings.Contains(server.Code, `classification: "synchronous"`) ||
		strings.Contains(server.Code, `classification: "dynamic"`) {
		t.Fatalf("inert direct server projection did not retain synchronous execution:\n%s", server.Code)
	}
}

func TestDynamicComponentAnnotationAcknowledgesOpaqueBinding(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "dynamic-annotated.tsx", Kind: "compile", Target: TargetClient,
		Source: `
			export function Page(props: { selected: any }) {
				/** @exact dynamic */
				const Selected = props.selected;
				return () => <Selected />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if hasDiagnosticCode(response.Diagnostics, "EXACT2213") ||
		hasDiagnosticCode(response.Diagnostics, "EXACT2214") {
		t.Fatalf("acknowledged dynamic binding produced diagnostics: %#v", response.Diagnostics)
	}
	if !strings.Contains(response.Code, "dynamicComponentValue") ||
		!strings.Contains(response.Code, "createCompiledDynamicComponent") {
		t.Fatalf("annotated binding omitted dynamic lowering:\n%s", response.Code)
	}
}

func TestDynamicComponentOpaqueBindingWarnsButStillLowers(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "dynamic-warning.tsx", Kind: "compile", Target: TargetClient,
		Source: `
			export function Page(props: { selected: any }) {
				const Selected = props.selected;
				return () => <Selected />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if !hasDiagnosticCode(response.Diagnostics, "EXACT2213") {
		t.Fatalf("opaque component selection omitted its warning: %#v", response.Diagnostics)
	}
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Code == "EXACT2213" &&
			(!strings.HasSuffix(diagnostic.FixText, "/** @exact dynamic */\n") || diagnostic.FixStart <= 0) {
			t.Fatalf("opaque component warning omitted its safe annotation edit: %#v", diagnostic)
		}
	}
	if !strings.Contains(response.Code, "createCompiledDynamicComponent") {
		t.Fatalf("warned opaque binding was not lowered:\n%s", response.Code)
	}
}

func TestDynamicComponentMisplacedAnnotationWarns(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "dynamic-misplaced.tsx", Kind: "analyze", Target: TargetClient,
		Source: `
			/** @exact dynamic */
			function StaticPanel() { return () => <p>static</p>; }
		`,
	})
	if !hasDiagnosticCode(response.Diagnostics, "EXACT2214") {
		t.Fatalf("misplaced annotation omitted its diagnostic: %#v", response.Diagnostics)
	}
}

func TestDynamicComponentAnnotationCannotMakeScalarValueExecutable(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "dynamic-invalid.tsx", Kind: "compile", Target: TargetClient,
		Source: `
			export function Page() {
				/** @exact dynamic */
				const Selected = 42;
				return () => <Selected />;
			}
		`,
	})
	if !hasDiagnosticCode(response.Diagnostics, "EXACT2215") {
		t.Fatalf("scalar dynamic component omitted its hard error: %#v", response.Diagnostics)
	}
	if strings.Contains(response.Code, "createCompiledDynamicComponent") {
		t.Fatalf("invalid scalar value was lowered as a dynamic component:\n%s", response.Code)
	}
}

func TestStaticComponentsDoNotImportDynamicRuntimeCapability(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "static-component.tsx", Kind: "compile", Target: TargetClient,
		Source: `
			function Panel() { return () => <p>static</p>; }
			export function Page() { return () => <Panel />; }
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if strings.Contains(response.Code, "runtime/dynamic-components") ||
		strings.Contains(response.Code, `"dynamic-components"`) {
		t.Fatalf("static component retained dynamic runtime capability:\n%s", response.Code)
	}
}

func hasDiagnosticCode(diagnostics []Diagnostic, code string) bool {
	for _, diagnostic := range diagnostics {
		if diagnostic.Code == code {
			return true
		}
	}
	return false
}

// Dynamic facade recognition follows the imported value, including ordinary controls.
func TestDynamicComponentFactoryImportIdentity(t *testing.T) {
	cases := []struct {
		name, prefix, factory string
		warning               bool
	}{
		{"direct", `import {createDynamicComponent} from '@exactjs/core';`, "createDynamicComponent", false},
		{"renamed", `import {createDynamicComponent as dynamic} from '@exactjs/core';`, "dynamic", false},
		{"namespace", `import * as Core from '@exactjs/core';`, "Core.createDynamicComponent", false},
		{"immutable alias", `import {createDynamicComponent} from '@exactjs/core';const dynamic=createDynamicComponent;`, "dynamic", false},
		{"ordinary same name", `function createDynamicComponent(resolve:()=>()=>unknown){return resolve();}`, "createDynamicComponent", true},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "dynamic-import-identity.tsx", Target: TargetClient, Source: item.prefix + `function Panel(){return()=> <p>ready</p>;}export function Page(){const Selected=` + item.factory + `(()=>Panel);return()=> <Selected/>;}`})
			if response.Error != "" || hasDiagnosticCode(response.Diagnostics, "EXACT2213") != item.warning {
				t.Fatalf("dynamic factory identity mismatch: %#v", response.Diagnostics)
			}
		})
	}
}
