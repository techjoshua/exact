package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const hoistedModuleSource = `export{};const box={current:0};write();write();function write(){box.current=box.current+1;return 0}`

// Constructor-level storage invariant only. This is not a source TDZ execution
// claim and has no finalized callable/body entry proof.
func TestHoistedModuleMarkerStorageInvariant(t *testing.T) {
	owner := newLanguageOwner()
	root := owner.root()
	cell := owner.cell(root.env, false)
	f := &languageCallable{id: owner.identity(), captures: root.env}
	marker := languageStorage{value: languageValue{callable: f}}
	if !moduleFunctionMarker(&marker, f) {
		t.Fatal("canonical marker shape")
	}
	for _, name := range []string{"cell", "object", "property-key", "descriptor", "initialized", "deleted", "extra-value"} {
		t.Run(name, func(t *testing.T) {
			bad := marker
			switch name {
			case "cell":
				bad.cell = cell
			case "object":
				bad.object = &languageObject{}
			case "property-key":
				bad.key = languageStringKey("x")
			case "descriptor":
				bad.descriptor.writable = true
			case "initialized":
				bad.initialized = true
			case "deleted":
				bad.deleted = true
			case "extra-value":
				bad.value.undefined = true
			}
			if moduleFunctionMarker(&bad, f) {
				t.Fatal("marker accepted lexical/property payload")
			}
		})
	}
	stored := owner.storageStep(root, marker)
	out := owner.initializeLocal(stored, cell, languageValue{undefined: true})
	if out.completion != languageNormal || !owner.readLocal(out.branch, cell).value.undefined {
		t.Fatal("non-cell marker obstructed ordinary initialization")
	}
	if owner.initializeLocal(out.branch, cell, languageValue{undefined: true}).completion != languageThrow {
		t.Fatal("duplicate lexical initialization guard weakened")
	}
	if owner.callableCaptureState(out.branch, f) {
		t.Fatal("storage marker minted callable proof")
	}
}

func TestHoistedModuleEmitted(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/hoisted-runtime.ts", Source: hoistedModuleSource, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			file := filepath.Join(t.TempDir(), "hoisted.mjs")
			if err := os.WriteFile(file, []byte(r.Code+`;if(box.current!==2)throw Error('hoisted module current state');console.log('PASS');`), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			out, err := exec.CommandContext(ctx, "node", file).CombinedOutput()
			if err != nil || strings.TrimSpace(string(out)) != "PASS" {
				t.Fatalf("runtime %v %s", err, out)
			}
		})
	}
}
