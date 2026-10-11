package exactcompiler

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestHostSubsystemDirectoryImportInvalidation(t *testing.T) {
	for _, specifier := range []string{"./child", "./child/index.js", "./barrel.js"} {
		t.Run(specifier, func(t *testing.T) {
			root := t.TempDir()
			if err := os.Mkdir(filepath.Join(root, "child"), 0o700); err != nil {
				t.Fatal(err)
			}
			child := filepath.Join(root, "child/index.tsx")
			page := filepath.Join(root, "Page.tsx")
			config := filepath.Join(root, "tsconfig.json")
			initial := `export function Child() { return () => <span>child</span>; }`
			pageSource := `import { Child } from "` + specifier + `"; export function Page() { return () => <main><Child /></main>; }`
			for path, source := range map[string]string{config: `{"compilerOptions":{"jsx":"preserve","moduleResolution":"bundler","module":"esnext"}}`, child: initial, page: pageSource, filepath.Join(root, "barrel.ts"): `export { Child } from "./child";`} {
				if err := os.WriteFile(path, []byte(source), 0o600); err != nil {
					t.Fatal(err)
				}
			}
			session := NewSession()
			request := Request{ID: page, Root: root, ConfigFile: config, Kind: "compile", Source: pageSource}
			before := session.Execute(request)
			if before.Error != "" {
				t.Fatal(before.Error)
			}
			changed := `export function Child() { window.name = "client"; return () => <span>changed</span>; }`
			if err := os.WriteFile(child, []byte(changed), 0o600); err != nil {
				t.Fatal(err)
			}
			updated := session.Execute(Request{ID: child, Root: root, ConfigFile: config, Kind: "compile", Source: changed})
			if updated.Error != "" {
				t.Fatal(updated.Error)
			}
			incremental, fresh := session.Execute(request), NewSession().Execute(request)
			if incremental.Error != "" || fresh.Error != "" {
				t.Fatalf("incremental %q fresh %q", incremental.Error, fresh.Error)
			}
			if !reflect.DeepEqual(incremental.Analysis.Components, fresh.Analysis.Components) || incremental.Code != fresh.Code {
				t.Fatal("retained importer differs from fresh compilation after child placement changes")
			}
		})
	}
}

func TestHostSubsystemEmptySynchronizedRoot(t *testing.T) {
	root := t.TempDir()
	config := filepath.Join(root, "tsconfig.json")
	if err := os.WriteFile(config, []byte(`{"files":[]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	first, second := filepath.Join(root, "first.ts"), filepath.Join(root, "second.ts")
	session := NewSession()
	response := session.Execute(Request{Kind: "synchronize", Root: root, ConfigFile: config, Sources: []ProjectSource{{ID: first, Source: "export {};"}, {ID: second, Source: ""}}})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	response = session.Execute(Request{Kind: "compile", Root: root, ConfigFile: config, ID: second, Source: ""})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if !response.CacheHit {
		t.Fatal("empty synchronized source was not installed in the project generation")
	}
}

func TestHostSubsystemSingleSynchronizedRoot(t *testing.T) {
	for _, source := range []string{"", "export const value=1;"} {
		root := t.TempDir()
		config := filepath.Join(root, "tsconfig.json")
		if err := os.WriteFile(config, []byte(`{"files":[]}`), 0o600); err != nil {
			t.Fatal(err)
		}
		file := filepath.Join(root, "single.ts")
		session := NewSession()
		for range 2 {
			response := session.Execute(Request{Kind: "synchronize", Root: root, ConfigFile: config, Sources: []ProjectSource{{ID: file, Source: source}}})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			response = session.Execute(Request{Kind: "compile", Root: root, ConfigFile: config, ID: file, Source: source})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if !response.CacheHit {
				t.Fatal("single synchronized root was not published as a reusable generation")
			}
		}
	}
}

func TestHostSubsystemConservativeInvalidation(t *testing.T) {
	for name, options := range map[string]string{
		"base-url":  `"baseUrl":"."`,
		"root-dirs": `"rootDirs":[".","generated"]`,
		"paths":     `"paths":{"alias":["./Child.tsx"]}`,
		"global":    ``,
		"dynamic":   ``,
	} {
		t.Run(name, func(t *testing.T) {
			root := t.TempDir()
			child := filepath.Join(root, "Child.tsx")
			page := filepath.Join(root, "Page.tsx")
			config := filepath.Join(root, "tsconfig.json")
			configSource := `{"compilerOptions":{"jsx":"preserve","module":"esnext","moduleResolution":"bundler"`
			if options != "" {
				configSource += "," + options
			}
			configSource += `}}`
			initial := `export function Child(){return ()=> <p/>;}`
			pageSource := `import {Child} from "./Child.js"; export function Page(){return ()=> <Child/>;}`
			if name == "global" {
				pageSource += ` declare global {var hostFlag:number;}`
			}
			if name == "dynamic" {
				pageSource += ` export function load(name:string){return import(name);}`
			}
			for path, source := range map[string]string{config: configSource, child: initial, page: pageSource} {
				if err := os.WriteFile(path, []byte(source), 0o600); err != nil {
					t.Fatal(err)
				}
			}
			session := NewSession()
			request := Request{Kind: "compile", Root: root, ConfigFile: config, ID: page, Source: pageSource}
			before := session.Execute(request)
			if before.Error != "" {
				t.Fatal(before.Error)
			}
			changed := `export function Child(){window.name="client";return ()=> <p/>;}`
			if err := os.WriteFile(child, []byte(changed), 0o600); err != nil {
				t.Fatal(err)
			}
			updated := session.Execute(Request{Kind: "compile", Root: root, ConfigFile: config, ID: child, Source: changed})
			if updated.Error != "" {
				t.Fatal(updated.Error)
			}
			if updated.Counters.FullInvalidations != 1 {
				t.Fatalf("open dependency environment retained stale caches: %#v", updated.Counters)
			}
			incremental, fresh := session.Execute(request), NewSession().Execute(request)
			if !reflect.DeepEqual(incremental.Analysis.Components, fresh.Analysis.Components) || incremental.Code != fresh.Code {
				t.Fatal("conservative invalidation diverged from fresh compilation")
			}
		})
	}
}

func TestHostSubsystemNestedVirtualSources(t *testing.T) {
	root := t.TempDir()
	config := filepath.Join(root, "tsconfig.json")
	if err := os.WriteFile(config, []byte(`{"include":["generated/**/*.ts"]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	session := NewSession()
	first, second := filepath.Join(root, "generated/deep/first.ts"), filepath.Join(root, "generated/other/second.ts")
	response := session.Execute(Request{Kind: "synchronize", Root: root, ConfigFile: config, Sources: []ProjectSource{{ID: first, Source: `export const value=7;`}, {ID: second, Source: `import {value} from "../deep/first.js";export const next=value;`}}})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	response = session.Execute(Request{Kind: "check", Root: root, ConfigFile: config, ID: second, Source: `import {value} from "../deep/first.js";export const next=value;`, Diagnostics: "semantic"})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Severity == "error" {
			t.Fatalf("virtual nested module was not resolved: %#v", diagnostic)
		}
	}
}

func TestHostSubsystemVirtualDependencyTypeTransitions(t *testing.T) {
	for _, foreign := range []bool{false, true} {
		root := t.TempDir()
		config := filepath.Join(root, "tsconfig.json")
		if err := os.WriteFile(config, []byte(`{"compilerOptions":{"strict":true,"moduleResolution":"bundler","module":"esnext"},"files":["generated/entry.ts"]}`), 0o600); err != nil {
			t.Fatal(err)
		}
		dependency, entry := filepath.Join(root, "generated/dependency.ts"), filepath.Join(root, "generated/entry.ts")
		source := `import {value} from "./dependency.js";export const result:number=value;`
		if foreign {
			source = `/** @jsxImportSource react */ ` + source
		}
		session := NewSession()
		for _, value := range []string{"7", `"invalid"`, "9"} {
			prepared := session.Execute(Request{Kind: "synchronize", Root: root, ConfigFile: config, Sources: []ProjectSource{{ID: dependency, Source: "export const value=" + value + ";"}, {ID: entry, Source: source}}})
			if prepared.Error != "" {
				t.Fatal(prepared.Error)
			}
			for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
				response := session.Execute(Request{Kind: "compile", Root: root, ConfigFile: config, ID: entry, Source: source, Target: target, Diagnostics: "semantic"})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				invalid := false
				for _, diagnostic := range response.Diagnostics {
					if diagnostic.Code == "TS2307" {
						t.Fatalf("prepared module was lost in validation: %#v", diagnostic)
					}
					invalid = invalid || diagnostic.Code == "TS2322"
				}
				if invalid != (value == `"invalid"`) {
					t.Fatalf("validation did not observe dependency type transition %s: %#v", value, response.Diagnostics)
				}
			}
		}
	}
}
