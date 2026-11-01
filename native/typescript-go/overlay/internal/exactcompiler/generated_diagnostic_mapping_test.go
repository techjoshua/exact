package exactcompiler

import (
	"context"
	"github.com/microsoft/TypeScript/tsc/internal/bundled"
	"github.com/microsoft/TypeScript/tsc/internal/core"
	"github.com/microsoft/TypeScript/tsc/internal/tspath"
	"github.com/microsoft/TypeScript/tsc/internal/vfs/osvfs"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/sourcemap"
)

func TestGeneratedDiagnosticMappingRetainsAuthoredAndUnmappedBoundaries(t *testing.T) {
	authored := "// source\nconst label = '💫'; bad.value;"
	source := newNormalizedSource(authored)
	code := "// generated\nconst label = '💫'; bad.value; synthetic;"
	column := len("const label = '") + 2 + len("'; ")
	generatedStart := strings.Index(code, "bad")
	sourceStart := strings.Index(authored, "bad")
	mapping := &sourcemap.RawSourceMap{Mappings: ";" + encodeSourceMapSegment([]int{column, 0, 1, column}) + "," + encodeSourceMapSegment([]int{9, 0, 0, 9}) + "," + encodeSourceMapSegment([]int{2})}
	diagnostics := []Diagnostic{
		{FileName: "page.tsx.exact.generated.ts", Start: generatedStart, Length: len("bad.value")},
		{FileName: "page.tsx.exact.generated.ts", Start: strings.Index(code, "synthetic"), Length: 9},
		{FileName: "dependency.ts", Start: 5, Length: 2},
	}
	mapGeneratedDiagnostics(diagnostics, code, "page.tsx", mapping, source)
	if diagnostics[0].FileName != "page.tsx" || diagnostics[0].Start != sourceStart || diagnostics[0].Length != len("bad.value") {
		t.Fatalf("authored UTF-16 mapping lost its token: %#v", diagnostics[0])
	}
	if diagnostics[1].FileName != "page.tsx.exact.generated.ts" || diagnostics[2].FileName != "dependency.ts" || diagnostics[2].Start != 5 {
		t.Fatalf("unmapped diagnostic was attributed to authored source: %#v", diagnostics)
	}
}

func TestGeneratedIdentitySemanticDiagnosticBoundary(t *testing.T) {
	root := t.TempDir()
	entry := filepath.Join(root, "entry.tsx")
	dep := filepath.Join(root, "dependency.ts")
	config := filepath.Join(root, "tsconfig.json")
	first := `import {outside} from './dependency.js';`
	line := `export const label='💫'; export const value:string=`
	authored := first + "\n" + line + `'valid';`
	code := first + "\n" + line + "1;\nconst synthetic:string=2;"
	dependency := `export const label='💫'; export const outside:string=1;`
	options := `{"compilerOptions":{"strict":true,"target":"ES2022","module":"ESNext","moduleResolution":"Bundler","jsx":"preserve","skipLibCheck":true,"types":[]},"include":["*.ts","*.tsx"]}`
	for file, text := range map[string]string{entry: authored, dep: dependency, config: options} {
		if err := os.WriteFile(file, []byte(text), 0600); err != nil {
			t.Fatal(err)
		}
	}
	sources := newSourceOverlay(bundled.WrapFS(osvfs.FS()))
	sources.set(entry, authored)
	sources.set(dep, dependency)
	request := Request{ID: entry, Root: root, ConfigFile: config, Target: TargetClient, Diagnostics: "semantic", Source: code}
	diagnostics, err := validateGeneratedCode(request, entry, code, sources)
	if err != nil {
		t.Fatal(err)
	}
	project, configDiagnostics, err := newProjectStateWithSources(request, entry, sources.files)
	if err != nil || project == nil || len(configDiagnostics) != 0 {
		t.Fatalf("project: %v %#v", err, configDiagnostics)
	}
	generation, err := project.advance(context.Background(), entry, code)
	if err != nil {
		t.Fatal(err)
	}
	imported := []Diagnostic{}
	for _, d := range generation.checker.GetDiagnostics(context.Background(), generation.program.GetSourceFile(dep)) {
		imported = append(imported, projectDiagnostic(d))
	}
	generation.release()
	raw := append([]Diagnostic(nil), diagnostics...)
	raw = append(raw, imported...)
	mapped := append([]Diagnostic(nil), raw...)
	generator := sourcemap.NewGenerator("", "", root, tspath.ComparePathsOptions{CurrentDirectory: root, UseCaseSensitiveFileNames: true})
	index := generator.AddSource(entry)
	column := core.UTF16Offset(utf16Length(line[:strings.Index(line, "value")]))
	if err = generator.AddSourceMapping(1, column, index, 1, column); err != nil {
		t.Fatal(err)
	}
	if err = generator.AddSourceMapping(1, column+5, index, 1, column+5); err != nil {
		t.Fatal(err)
	}
	if err = generator.AddGeneratedMapping(2, 0); err != nil {
		t.Fatal(err)
	}
	mapping := generator.RawSourceMap()
	mapGeneratedDiagnostics(mapped, code, entry, mapping, newNormalizedSource(authored))
	if len(diagnostics) != 2 || len(imported) != 1 {
		t.Fatalf("semantic diagnostic qualification: %#v / %#v", diagnostics, imported)
	}
	if raw[0].FileName != entry+".exact.generated.ts" || raw[1].FileName != entry+".exact.generated.ts" {
		t.Fatalf("actual entry semantic relabel failed: %#v", raw)
	}
	if mapped[0].FileName != entry || mapped[0].Start != strings.Index(authored, "value:string") || mapped[0].Length != 5 {
		t.Fatalf("UTF16 map lost authored token: %#v", mapped[0])
	}
	if mapped[1].FileName != entry+".exact.generated.ts" {
		t.Fatalf("unmapped synthetic diagnostic lost origin: %#v", mapped[1])
	}
	if imported[0].FileName != dep || !reflect.DeepEqual(mapped[2], imported[0]) {
		t.Fatalf("imported real semantic diagnostic changed: %#v", mapped[2])
	}
}
