package exactcompiler

import (
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
