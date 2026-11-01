package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/bundled"
	"github.com/microsoft/TypeScript/tsc/internal/core"
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
	check("export const virtualAnswer=virtualGlobal;")
	sources.set(filepath.Join(root, "virtual-global.d.ts"), "declare const virtualGlobal:number;")
	check("export const virtualAnswer=virtualGlobal;")
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
	sources.set(config, `{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","strict":true,"skipLibCheck":true}}`)
	check("export const callback=(value)=>value;")
	sources.set(config, `{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","strict":false,"skipLibCheck":true}}`)
	check("export const callback=(value)=>value;")
	sources.set(manifest, `{"name":"validation-fixture","type":"module","exports":"./number.ts"}`)
	check(packageCode)
	sources.set(manifest, `{"name":"validation-fixture","type":"module","exports":"./string.ts"}`)
	check(packageCode)
	delete(sources.files, sources.canonical(config))
	delete(sources.files, sources.canonical(manifest))
	check(packageCode)
	request.Target = TargetServer
	check(code)
	if len(cache) > 3 {
		t.Fatal("unbounded validation target cache")
	}
}

// Validation must preserve a private nominal brand across a circular type-only import.
func TestGeneratedValidationRetainsModuleBrandIdentity(t *testing.T) {
	root := t.TempDir()
	entry := filepath.Join(root, "brand.ts")
	dependency := filepath.Join(root, "types.ts")
	config := filepath.Join(root, "tsconfig.json")
	source := `import type {Manual} from './types.js';
const brand=Symbol('owned.brand');
export type Trusted=Readonly<{value:string;readonly[brand]:true}>;
export function unsafe(value:string):Trusted{return Object.freeze({value,[brand]:true as const});}
function valueOf(value:Trusted):string{return value.value;}
export function unwrap(result:Manual){const{html}=result;return html===undefined?undefined:valueOf(html);}`
	for file, text := range map[string]string{entry: source, dependency: `import type{Trusted}from'./brand.js';export type Manual={html?:Trusted};`, config: `{"compilerOptions":{"strict":true,"target":"ES2022","module":"ESNext","moduleResolution":"Bundler","skipLibCheck":true,"types":[]},"include":["*.ts"]}`} {
		if err := os.WriteFile(file, []byte(text), 0600); err != nil {
			t.Fatal(err)
		}
	}
	sources := newSourceOverlay(bundled.WrapFS(osvfs.FS()))
	sources.set(entry, source)
	for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
		request := Request{ID: entry, Root: root, ConfigFile: config, Target: target, Diagnostics: "semantic"}
		diagnostics, err := validateGeneratedCode(request, entry, source, sources)
		if err != nil || len(diagnostics) != 0 {
			t.Fatalf("%s valid private brand: %v %#v", target, err, diagnostics)
		}
		invalid := source + `export const invalid:Trusted={value:'unsigned'};`
		diagnostics, err = validateGeneratedCode(request, entry, invalid, sources)
		if err != nil || !hasDiagnosticCode(diagnostics, "TS2741") {
			t.Fatalf("%s unsigned value must remain invalid: %v %#v", target, err, diagnostics)
		}
	}
}

func TestGeneratedIdentitySemanticTsxRefresh(t *testing.T) {
	root := t.TempDir()
	entry := filepath.Join(root, "entry.tsx")
	config := filepath.Join(root, "tsconfig.json")
	authored := `export const authored:number=1;`
	configSource := `{"compilerOptions":{"strict":true,"target":"ES2022","module":"ESNext","moduleResolution":"Bundler","jsx":"preserve","skipLibCheck":true,"types":[]},"include":["*.tsx"]}`
	for file, text := range map[string]string{entry: authored, config: configSource} {
		if e := os.WriteFile(file, []byte(text), 0600); e != nil {
			t.Fatal(e)
		}
	}
	sources := newSourceOverlay(bundled.WrapFS(osvfs.FS()))
	sources.set(entry, authored)
	request := Request{ID: entry, Root: root, ConfigFile: config, Target: TargetClient, Diagnostics: "semantic"}
	cache := make(map[Target]*generatedValidationProject)
	type row struct {
		Name        string
		Code        string
		Diagnostics []Diagnostic
		Error       string
		ScriptKind  int
		EntryText   string
		Reused      bool
	}
	rows := []row{}
	var previous *projectState
	for i, code := range []string{`export const identity=<T>(value:T):T=>value;export const value:number=identity(1);`, `export const identity=<T>(value:T):T=>value;export const value:string=identity('updated');`, `export const identity=<T>(value:T):T=>value;export const value:string=identity('updated');`} {
		if i == 2 {
			sources.set(entry, `export const authored:string=1;`)
		}
		diagnostics, err := validateGeneratedCodeWithCache(request, entry, code, sources, cache)
		result := row{Name: []string{"initial-semantic-TSX-entry", "changed-retained-semantic-TSX-entry", "authored-entry-change-excluded-from-generated-overlay"}[i], Code: code, Diagnostics: diagnostics}
		if err != nil {
			result.Error = err.Error()
		}
		if cached := cache[TargetClient]; cached != nil {
			sf := cached.project.program.GetSourceFile(entry)
			if sf != nil {
				result.ScriptKind = int(sf.ScriptKind)
				result.EntryText = sf.Text()
			}
			result.Reused = previous == cached.project
			previous = cached.project
		}
		rows = append(rows, result)
	}
	for i, row := range rows {
		if row.Error != "" || len(row.Diagnostics) != 0 || row.ScriptKind != int(core.ScriptKindTS) || row.EntryText != row.Code {
			t.Fatalf("semantic parse row%d failed: %#v", i, row)
		}
		if i > 0 && !row.Reused {
			t.Fatalf("semantic entry refresh did not exercise retained project: %#v", row)
		}
	}
}
