package exactcompiler

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// A dependency edit must refresh retained consumers even when their authored source is unchanged.
func TestWatchDiagnosticsRefreshSiblingProjectConsumers(t *testing.T) {
	root := t.TempDir()
	app := filepath.Join(root, "app")
	kit := filepath.Join(root, "kit")
	for _, directory := range []string{app, kit} {
		if err := os.MkdirAll(directory, 0700); err != nil {
			t.Fatal(err)
		}
	}
	source := `import {value} from "../kit/index.js";export const observed:number=value;`
	file := filepath.Join(app, "consumer.ts")
	dependency := filepath.Join(kit, "index.d.ts")
	for name, text := range map[string]string{
		file:                                source,
		dependency:                          `export declare const value:number;`,
		filepath.Join(app, "tsconfig.json"): `{"compilerOptions":{"strict":true,"skipLibCheck":true,"module":"ESNext","moduleResolution":"Bundler","target":"ES2022"},"include":["*.ts"]}`,
		filepath.Join(kit, "tsconfig.json"): `{"compilerOptions":{"skipLibCheck":true,"module":"ESNext","target":"ES2022"},"include":["*.ts"]}`,
	} {
		if err := os.WriteFile(name, []byte(text), 0600); err != nil {
			t.Fatal(err)
		}
	}
	session := NewSession()
	request := Request{Kind: "compile", Root: app, ConfigFile: filepath.Join(app, "tsconfig.json"), ID: file, Source: source, Target: "client", Diagnostics: "semantic"}
	before := session.Execute(request)
	if before.Error != "" || len(before.Diagnostics) != 0 {
		t.Fatalf("initial consumer failed: %s %#v", before.Error, before.Diagnostics)
	}
	changed := `export declare const value:string;`
	if err := os.WriteFile(dependency, []byte(changed), 0600); err != nil {
		t.Fatal(err)
	}
	watched := session.Execute(Request{Kind: "diagnose", ID: dependency, Source: changed, Diagnostics: "semantic"})
	after := session.Execute(request)
	seen := false
	for _, diagnostic := range after.Diagnostics {
		if diagnostic.Code == "TS2322" {
			seen = true
		}
	}
	if !seen {
		t.Fatalf("retained consumer missed declaration change: watch=%#v compile=%#v error=%s", watched.Diagnostics, after.Diagnostics, after.Error)
	}
}

// A watch edit replaces authored bytes while the retaining project keeps its own catalog.
func TestWatchDependencyRetainsConsumerPreparation(t *testing.T) {
	root := t.TempDir()
	file := filepath.Join(root, "model.d.ts")
	initial := `export interface Model {value:string}`
	if err := os.WriteFile(file, []byte(initial), 0600); err != nil {
		t.Fatal(err)
	}
	session := NewSession()
	suffix := `;export declare const consumerCatalog:string;`
	request := Request{Kind: "analyze", Root: root, ID: file, Source: initial + suffix, PackageEnhancementBoundary: utf16Length(initial)}
	before := session.Execute(request)
	if before.Error != "" || len(before.Diagnostics) != 0 {
		t.Fatalf("initial preparation failed: %s %#v", before.Error, before.Diagnostics)
	}
	project := session.projects[nativeProjectKey(request, file)]
	changed := `export interface Model {value:readonly string[]}`
	session.Execute(Request{Kind: "diagnose", ID: file, Source: changed})
	prepared := project.program.GetSourceFile(file).Text()
	if !strings.HasPrefix(prepared, changed) || !strings.HasSuffix(prepared, suffix) {
		t.Fatalf("watch lost consumer preparation: %s", prepared)
	}
}

// Watch inputs include erased imports and ambient roots without connecting unrelated modules.
func TestWatchFilesTrackTypeDependenciesAndReset(t *testing.T) {
	root := t.TempDir()
	files := map[string]string{
		"tsconfig.json":   `{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","skipLibCheck":true},"include":["*.ts"]}`,
		"entry.ts":        `import type {Model} from "./model.js";import type {Missing} from "./missing.js";export const value=1;`,
		"model.ts":        `import type {Nested} from "./nested.js";export interface Model {value:Nested}`,
		"nested.ts":       `export interface Nested {label:string}`,
		"ambient.d.ts":    `declare const ambient:string;`,
		"globals.ts":      `declare const standalone:string;`,
		"augmentation.ts": `export {};declare global {const augmented:string;}`,
		"unrelated.ts":    `export const unrelated=1;`,
	}
	for name, text := range files {
		if err := os.WriteFile(filepath.Join(root, name), []byte(text), 0600); err != nil {
			t.Fatal(err)
		}
	}
	session := NewSession()
	if len(session.Execute(Request{Kind: "watch-files"}).ProjectFiles) != 0 {
		t.Fatal("empty session returned watch inputs")
	}
	file := filepath.Join(root, "entry.ts")
	response := session.Execute(Request{Kind: "analyze", Root: root, ID: file, Source: files["entry.ts"]})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("syntax analysis failed: %s %#v", response.Error, response.Diagnostics)
	}
	watched := session.Execute(Request{Kind: "watch-files", ID: file}).ProjectFiles
	for _, name := range []string{"model.ts", "nested.ts", "ambient.d.ts", "globals.ts", "augmentation.ts"} {
		if !slices.Contains(watched, filepath.Join(root, name)) {
			t.Fatalf("missing %s in %#v", name, watched)
		}
	}
	if slices.Contains(watched, file) || slices.Contains(watched, filepath.Join(root, "unrelated.ts")) {
		t.Fatalf("watch scope included unrelated or current module: %#v", watched)
	}
	if len(session.Execute(Request{Kind: "watch-files", ID: filepath.Join(root, "unknown.ts")}).ProjectFiles) != 0 {
		t.Fatal("unknown source acquired other projects' watch inputs")
	}
	session.Execute(Request{Kind: "reset"})
	if len(session.Execute(Request{Kind: "watch-files"}).ProjectFiles) != 0 {
		t.Fatal("reset retained watch inputs")
	}
}

func TestWatchSiblingDeclarationKeepsWarmLoweringEquivalent(t *testing.T) {
	for _, variant := range []struct {
		target    string
		linked    bool
		extension string
		bare      bool
	}{{"client", false, ".d.ts", false}, {"server", false, ".d.ts", false}, {"client", false, ".ts", false}, {"server", false, ".ts", false}, {"client", true, ".d.ts", false}, {"server", true, ".d.ts", false}, {"client", false, ".ts", true}, {"server", false, ".ts", true}} {
		target := variant.target
		t.Run(fmt.Sprintf("%s/%s/linked=%t/bare=%t", target, variant.extension, variant.linked, variant.bare), func(t *testing.T) {
			root := t.TempDir()
			app := filepath.Join(root, "app")
			kit := filepath.Join(root, "kit")
			for _, directory := range []string{app, kit} {
				if err := os.MkdirAll(directory, 0700); err != nil {
					t.Fatal(err)
				}
			}
			importPath := "../kit/index.js"
			if variant.linked {
				if err := os.Symlink(kit, filepath.Join(root, "linked")); err != nil {
					t.Fatal(err)
				}
				importPath = "../linked/index.js"
			}
			if variant.bare {
				packageDirectory := filepath.Join(app, "node_modules", "@fixture")
				if err := os.MkdirAll(packageDirectory, 0700); err != nil {
					t.Fatal(err)
				}
				if err := os.Symlink(kit, filepath.Join(packageDirectory, "kit")); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(filepath.Join(kit, "package.json"), []byte(`{"name":"@fixture/kit","exports":"./index.ts"}`), 0600); err != nil {
					t.Fatal(err)
				}
				importPath = "@fixture/kit"
			}
			source := `import type {Model} from "` + importPath + `";export function View(props:Model){return()=> <p>{props.value}</p>;}`
			file := filepath.Join(app, "View.tsx")
			dependency := filepath.Join(kit, "index"+variant.extension)
			for name, text := range map[string]string{
				file:                                source,
				dependency:                          `export interface Model {value:string}`,
				filepath.Join(app, "tsconfig.json"): `{"compilerOptions":{"strict":true,"preserveSymlinks":true,"skipLibCheck":true,"jsx":"preserve","module":"ESNext","moduleResolution":"Bundler","target":"ES2022"},"include":["*.tsx"]}`,
				filepath.Join(kit, "tsconfig.json"): `{"compilerOptions":{"skipLibCheck":true,"module":"ESNext","target":"ES2022"},"include":["*.ts"]}`,
			} {
				if err := os.WriteFile(name, []byte(text), 0600); err != nil {
					t.Fatal(err)
				}
			}
			session := NewSession()
			request := Request{Kind: "compile", Root: app, ConfigFile: filepath.Join(app, "tsconfig.json"), ID: file, Source: source, Target: Target(target), Diagnostics: "syntax"}
			before := session.Execute(request)
			if before.Error != "" || len(before.Diagnostics) != 0 {
				t.Fatalf("initial lowering failed: %s (%d diagnostics)", before.Error, len(before.Diagnostics))
			}
			watchedFiles := session.Execute(Request{Kind: "watch-files"}).ProjectFiles
			if !slices.Contains(watchedFiles, file) || len(watchedFiles) != 2 {
				t.Fatalf("watch inputs lost consumer or type dependency, or included bundled libraries: %#v", watchedFiles)
			}
			project := session.projects[nativeProjectKey(request, file)]
			for _, changed := range []string{`export interface Model {value:readonly string[]}`, `export interface Model {value:string}`} {
				if err := os.WriteFile(dependency, []byte(changed), 0600); err != nil {
					t.Fatal(err)
				}
				watched := session.Execute(Request{Kind: "diagnose", ID: dependency, Source: changed, Diagnostics: "semantic"})
				if watched.Error != "" || len(watched.Diagnostics) != 0 {
					t.Fatalf("dependency watch failed: %s %#v", watched.Error, watched.Diagnostics)
				}
				warm := session.Execute(request)
				fresh := NewSession().Execute(request)
				if fresh.Error != "" || len(fresh.Diagnostics) != 0 {
					t.Fatalf("fresh lowering failed: %s %#v", fresh.Error, fresh.Diagnostics)
				}
				if warm.Error != "" || len(warm.Diagnostics) != 0 || warm.Code != fresh.Code {
					t.Fatalf("retained %s lowering differs from fresh after %s", target, changed)
				}
				rebuilds := project.counters.ProgramRebuilds
				session.Execute(Request{Kind: "diagnose", ID: dependency, Source: changed, Diagnostics: "semantic"})
				if project.counters.ProgramRebuilds != rebuilds {
					t.Fatal("unchanged notification rebuilt consumer")
				}
			}

		})
	}
}
