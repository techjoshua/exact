package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
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
	// Execution roots require isolated proof even for a static source with no writes.
	if len(session.authoredValidations) != 1 {
		t.Fatal("static synchronized source lost its isolated program proof")
	}
	session.Execute(Request{Kind: "reset"})
	if len(session.authoredValidations) != 0 {
		t.Fatal("reset retained authored validation")
	}
}

// Fatal executable admission precedes the shared neutral type proof. Public
// checks keep their own admission, even after a private proof has been cached.
func TestAuthoredValidationRespectsTargetAdmission(t *testing.T) {
	const source = `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{'':number;trace:string}>){this.state.trace='';const run=async(task:TaskContext=TaskContext.server().blocking())=>{this.state['']='invalid';this.state.trace=String(this.state['']);};void run();return()=> <output>{this.state.trace}</output>;}`
	for _, first := range []Target{TargetClient, TargetServer} {
		t.Run(string(first), func(t *testing.T) {
			session := NewSession()
			other := TargetClient
			if first == TargetClient {
				other = TargetServer
			}
			for _, target := range []Target{first, other, TargetServer} {
				response := session.Execute(Request{Kind: "compile", ID: "admission.tsx", Source: source, Target: target, Diagnostics: "semantic"})
				if response.Error != "" || len(response.Diagnostics) != 1 {
					t.Fatalf("%s: %s %#v", target, response.Error, response.Diagnostics)
				}
				diagnostic := response.Diagnostics[0]
				if target == TargetClient {
					if diagnostic.Code != "EXACT2001" || response.Code != "" {
						t.Fatalf("fatal transport admission changed: %#v", response)
					}
				} else if diagnostic.Code != "TS2322" || diagnostic.Start != strings.Index(source, "this.state['']") || diagnostic.Length != len("this.state['']") {
					t.Fatalf("authored assignment diagnostic changed: %#v", diagnostic)
				}
			}
			if len(session.authoredValidations) != 1 {
				t.Fatalf("expected one live neutral proof owner, got %d", len(session.authoredValidations))
			}
			for _, proofs := range session.authoredValidations {
				if len(proofs) != 1 {
					t.Fatalf("expected one target-independent proof, got %d", len(proofs))
				}
			}
			response := session.Execute(Request{Kind: "check", ID: "admission.tsx", Source: source, Diagnostics: "semantic"})
			if response.Error != "" || len(response.Diagnostics) != 1 || response.Diagnostics[0].Code != "EXACT2001" || response.Code != "" {
				t.Fatalf("public neutral check admission changed: %#v", response)
			}
		})
	}
	session := NewSession()
	response := session.Execute(Request{Kind: "compile", ID: "admission.tsx", Source: source, Target: TargetServer, Diagnostics: "syntax"})
	if response.Error != "" || len(response.Diagnostics) != 0 || response.Code == "" || len(session.authoredValidations) != 0 {
		t.Fatalf("nonsemantic compile acquired an authored proof: %#v", response)
	}
}

func TestAuthoredValidationContinuesAfterWarnings(t *testing.T) {
	response := NewSession().Execute(Request{Kind: "compile", ID: "warning-types.tsx", Target: TargetServer, Diagnostics: "semantic", Source: `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;const run=async(task:TaskContext=TaskContext.server().detached().blocking())=>{this.state.value='invalid';};void run();return()=> <output>{this.state.value}</output>;}`})
	if response.Error != "" || !hasDiagnosticCode(response.Diagnostics, "EXACT2004") || !hasDiagnosticCode(response.Diagnostics, "TS2322") {
		t.Fatalf("warning prevented ordinary type checking: %s %#v", response.Error, response.Diagnostics)
	}
}
