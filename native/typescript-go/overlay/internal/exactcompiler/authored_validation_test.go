package exactcompiler

import (
	"os"
	"path/filepath"
	"testing"
)

func TestAuthoredValidationFollowsSourceAndDependencyGenerations(t *testing.T) {
	root := t.TempDir()
	dependency := filepath.Join(root, "input.ts")
	filename := filepath.Join(root, "Probe.tsx")
	config := filepath.Join(root, "tsconfig.json")
	source := `import { input } from "./input.js";
export function Probe(this: { state: { count: number } }) {
 this.state.count = 0;
 return () => <button onClick={() => this.state.count = input}>{this.state.count}</button>;
}`
	for name, text := range map[string]string{
		dependency: `export const input = 1;`, filename: source,
		config: `{"compilerOptions":{"jsx":"preserve","strict":true}}`,
	} {
		if err := os.WriteFile(name, []byte(text), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	session := NewSession()
	request := Request{ID: filename, Root: root, ConfigFile: config, Kind: "compile",
		Target: TargetClient, Diagnostics: "semantic", Source: source}
	assertAssignment := func(wantError bool) {
		t.Helper()
		response := session.Execute(request)
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		found := false
		for _, diagnostic := range response.Diagnostics {
			if diagnostic.Code == "TS2322" {
				found = true
			}
		}
		if found != wantError {
			t.Fatalf("assignment error = %v, want %v: %#v", found, wantError, response.Diagnostics)
		}
	}
	assertAssignment(false)
	request.Target = TargetServer
	assertAssignment(false)
	if len(session.authoredValidations) != 1 {
		t.Fatalf("expected one live program proof, got %d", len(session.authoredValidations))
	}
	for _, proofs := range session.authoredValidations {
		if len(proofs) != 1 {
			t.Fatalf("client and server should share their authored proof, got %d", len(proofs))
		}
	}
	changed := `export const input = "invalid";`
	if err := os.WriteFile(dependency, []byte(changed), 0o600); err != nil {
		t.Fatal(err)
	}
	synchronized := session.Execute(Request{Kind: "synchronize", Root: root, ConfigFile: config,
		Sources: []ProjectSource{{ID: filename, Source: source}, {ID: dependency, Source: changed}}})
	if synchronized.Error != "" {
		t.Fatal(synchronized.Error)
	}
	assertAssignment(true)
	request.Target = TargetClient
	assertAssignment(true)
	request.Source = `export function Probe(this: { state: { count: number } }) {
this.state.count = 0; return () => <button onClick={() => this.state.count = 2}>{this.state.count}</button>;
}`
	assertAssignment(false)
	if len(session.authoredValidations) != 1 {
		t.Fatal("obsolete program proofs retained after source replacement")
	}
	request.Source = `export const stable = 1;`
	assertAssignment(false)
	if len(session.authoredValidations) != 0 {
		t.Fatal("static source retained an obsolete program proof")
	}
	session.Execute(Request{Kind: "reset"})
	if len(session.authoredValidations) != 0 {
		t.Fatal("reset retained authored validation")
	}
}
