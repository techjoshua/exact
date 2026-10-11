package exactcompiler

import (
	"os"
	"path/filepath"
	"testing"
)

// Standalone localization can prove native Temporal identity without changing a compiler
// project's selected libraries or sharing incompatible checker generations with that project.
func TestIntlStandaloneLibraryContextIsolation(t *testing.T) {
	root := t.TempDir()
	file := filepath.Join(root, "page.tsx")
	source := `export function Page(duration:Temporal.Duration){return()=> <p intl:message>{duration}</p>;}`
	session := NewSession()
	for _, kind := range []string{"extension", "diagnose", "extension", "diagnose"} {
		r := Request{Kind: kind, ID: file, Root: root, Source: source, Diagnostics: "semantic"}
		if kind == "extension" {
			r.Extension = &ExtensionRequest{Namespace: intlAnalyzeNamespace, Payload: map[string]any{"owner": "fixture", "sourceLocale": "en-US"}}
		}
		response := session.Execute(r)
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		if kind == "extension" {
			analysis := response.Extension.(intlAnalysis)
			if len(analysis.Descriptors) != 1 || analysis.Descriptors[0].Source[0].Formatter["kind"] != "duration" {
				t.Fatalf("native type unresolved: %#v", analysis)
			}
		} else if !containsDiagnosticCode(response.Diagnostics, "TS2503") {
			t.Fatalf("analysis context leaked native libraries into checking: %#v", response.Diagnostics)
		}
	}
	config := filepath.Join(root, "tsconfig.json")
	if err := os.WriteFile(config, []byte(`{"compilerOptions":{"target":"es2022","jsx":"preserve","lib":["es2022","dom"]},"include":["*.tsx"]}`), 0600); err != nil {
		t.Fatal(err)
	}
	response := session.Execute(Request{Kind: "extension", ID: file, Root: root, ConfigFile: config, Source: source, Extension: &ExtensionRequest{Namespace: intlAnalyzeNamespace, Payload: map[string]any{"owner": "fixture", "sourceLocale": "en-US"}}})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	analysis := response.Extension.(intlAnalysis)
	if len(analysis.Descriptors) != 1 || analysis.Descriptors[0].Source[0].Kind != "value" {
		t.Fatalf("configured library selection ignored: %#v", analysis)
	}
}
