package exactcompiler

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// Synchronization can introduce virtual ambient roots without a disk directory change.
// Both authored and generated proofs must see the new root and its later type changes.
func TestGeneratedValidationSeesSynchronizedAmbientRoots(t *testing.T) {
	root, err := os.MkdirTemp(".", ".validation-roots-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(root) })
	root, err = filepath.Abs(root)
	if err != nil {
		t.Fatal(err)
	}
	config := filepath.Join(root, "tsconfig.json")
	if err := os.WriteFile(config, []byte(`{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","jsx":"preserve","strict":true,"skipLibCheck":true}}`), 0600); err != nil {
		t.Fatal(err)
	}
	for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
		session := NewSession()
		entry := filepath.Join(root, "Page.tsx")
		request := Request{Kind: "compile", ID: entry, Root: root, ConfigFile: config, Target: target, Diagnostics: "semantic", Source: `export function Page(){return()=> <p>ready</p>;}`}
		first := session.Execute(request)
		if first.Error != "" || len(first.Diagnostics) != 0 {
			t.Fatalf("warmup failed: %s %#v", first.Error, first.Diagnostics)
		}
		request.Source = `export function Page(){const value:number=virtualGlobal;return()=> <p>{value}</p>;}`
		for _, declaration := range []string{"number", "string", "number"} {
			synchronized := session.Execute(Request{Kind: "synchronize", Root: root, ConfigFile: config, Sources: []ProjectSource{
				{ID: entry, Source: request.Source},
				{ID: filepath.Join(root, "virtual.d.ts"), Source: "declare const virtualGlobal:" + declaration + ";"},
			}})
			if synchronized.Error != "" || len(synchronized.Diagnostics) != 0 {
				t.Fatalf("synchronization failed: %s %#v", synchronized.Error, synchronized.Diagnostics)
			}
			response := session.Execute(request)
			if response.Error != "" || hasDiagnosticCode(response.Diagnostics, "TS2322") != (declaration == "string") {
				t.Fatalf("%s/%s lost ambient type proof: %s %#v", target, declaration, response.Error, response.Diagnostics)
			}
			if declaration == "number" && (len(response.Diagnostics) != 0 || response.Code == "") {
				t.Fatalf("%s did not compile the valid virtual root", target)
			}
		}
	}
}

// Relocated ordinary dependencies keep the original module's nominal types during artifact checking.
func TestGeneratedValidationRetainsRelocatedOrdinaryImports(t *testing.T) {
	// A leading dot in the folder name is not itself a relative-module prefix.
	root := filepath.Join(t.TempDir(), ".owner")
	if err := os.Mkdir(root, 0700); err != nil {
		t.Fatal(err)
	}
	config := filepath.Join(root, "tsconfig.json")
	if err := os.WriteFile(config, []byte(`{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","strict":true,"skipLibCheck":true},"files":["entry.ts"]}`), 0600); err != nil {
		t.Fatal(err)
	}
	helper := `export class Value { private brand=0; value=7; } export default function read(){return new Value();}`
	if err := os.WriteFile(filepath.Join(root, "helper.ts"), []byte(helper), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "model.ts"), []byte(`export class Model { private brand=0; value=7; }`), 0600); err != nil {
		t.Fatal(err)
	}
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, control := range []struct{ name, source, diagnostic string }{
			{"transitive-type", `import read from './helper.js';export type Model=import("./model.js").Model;export const value=read();`, ""},
			{"invalid-transitive-type", `import read from './helper.js';export const value:import("./model.js").Model={value:7};`, "TS2741"},
			{"nominal", `import read,{Value} from './helper.js';export const value:Value=read();`, ""},
			{"invalid", `import read from './helper.js';export const value:string=read();`, "TS2322"},
			{"unresolved", `import read from './missing.js';export const value=read();`, "TS2307"},
		} {
			t.Run(string(target)+"/"+control.name, func(t *testing.T) {
				entry := filepath.Join(root, "entry.ts")
				if err := os.WriteFile(entry, []byte(control.source), 0600); err != nil {
					t.Fatal(err)
				}
				session := NewSession()
				request := Request{Kind: "compile", ID: entry, Root: root, ConfigFile: config, Target: target, Diagnostics: "semantic", Source: control.source, ModuleRewrite: &ModuleRewrite{ModuleAliases: map[string]string{"./helper.js": "../helper.js", "./missing.js": "../missing.js", "./model.js": "../model.js"}}}
				response := session.Execute(request)
				raw, err := json.Marshal(struct {
					Request  Request
					Response Response
				}{request, response})
				if err != nil {
					t.Fatal(err)
				}
				t.Log(string(raw))
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				if control.diagnostic == "" {
					if len(response.Diagnostics) != 0 || response.Code == "" {
						t.Fatalf("valid nominal import rejected: %#v\n%s", response.Diagnostics, response.Code)
					}
				} else if !hasDiagnosticCode(response.Diagnostics, control.diagnostic) {
					t.Fatalf("missing %s: %#v\n%s", control.diagnostic, response.Diagnostics, response.Code)
				}
			})
		}
	}
}
