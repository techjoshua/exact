package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/bundled"
	"github.com/microsoft/TypeScript/tsc/internal/vfs/osvfs"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// Compare retained validation with a fresh program after source, dependency, configuration and
// resolution changes. Checking a cache hit alone cannot establish that stale diagnostics are gone.
func TestGeneratedValidationReuseMatchesFreshDependencyProof(t *testing.T) {
	root := t.TempDir()
	config := filepath.Join(root, "tsconfig.json")
	entry := filepath.Join(root, "Page.tsx")
	dependency := filepath.Join(root, "value.ts")
	write := func(path, text string) {
		t.Helper()
		if err := os.WriteFile(path, []byte(text), 0600); err != nil {
			t.Fatal(err)
		}
	}
	write(config, `{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","strict":true,"skipLibCheck":true}}`)
	write(dependency, "export const value=1;")
	sources := newSourceOverlay(bundled.WrapFS(osvfs.FS()))
	sources.set(entry, "export {};")
	request := Request{ID: entry, Root: root, ConfigFile: config, Target: TargetClient, Diagnostics: "semantic"}
	cache := make(map[Target]*generatedValidationProject)
	check := func(code string) {
		t.Helper()
		got, err := validateGeneratedCodeWithCache(request, entry, code, sources, cache)
		want, wantErr := validateGeneratedCode(request, entry, code, sources)
		if err != nil || wantErr != nil || !reflect.DeepEqual(got, want) {
			t.Fatalf("retained/fresh proof differs: %v %v %#v %#v", err, wantErr, got, want)
		}
	}
	code := `import {value} from './value.js';export const answer:number=value;`
	check(code)
	first := cache[TargetClient].project
	check(code + "export const next=2;")
	if cache[TargetClient].project != first {
		t.Fatal("unchanged dependency validation did not reuse its program")
	}
	sources.set(dependency, "export const value='invalid';")
	check(code)
	sources.set(dependency, "export const value=3;")
	check(code)
	delete(sources.files, sources.canonical(dependency))
	write(dependency, "export const value='disk';")
	check(code)
	write(dependency, "export const value=4;")
	check(code)
	check(`import {value} from './missing.js';export const answer:number=value;`)
	write(filepath.Join(root, "missing.ts"), "export const value=5;")
	check(`import {value} from './missing.js';export const answer:number=value;`)
	check("export const callback=(value)=>value;")
	write(config, `{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","strict":false,"skipLibCheck":true}}`)
	check("export const callback=(value)=>value;")
	check("export const answer=addedGlobal;")
	write(filepath.Join(root, "globals.d.ts"), "declare const addedGlobal:number;")
	check("export const answer=addedGlobal;")
	packageRoot := filepath.Join(root, "node_modules", "validation-fixture")
	if err := os.MkdirAll(packageRoot, 0700); err != nil {
		t.Fatal(err)
	}
	write(filepath.Join(packageRoot, "number.ts"), "export const value=6;")
	write(filepath.Join(packageRoot, "string.ts"), "export const value='package';")
	manifest := filepath.Join(packageRoot, "package.json")
	write(manifest, `{"name":"validation-fixture","type":"module","exports":"./number.ts"}`)
	packageCode := `import {value} from 'validation-fixture';export const answer:number=value;`
	check(packageCode)
	write(manifest, `{"name":"validation-fixture","type":"module","exports":"./string.ts"}`)
	check(packageCode)
	request.Target = TargetServer
	check(code)
	if len(cache) > 3 {
		t.Fatal("unbounded validation target cache")
	}
}
