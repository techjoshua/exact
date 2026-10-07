package exactcompiler

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// Parsed authored JSX must never cross the executable emitter's completed-tree boundary.
func TestNeverEvaluatedExecutableFence(t *testing.T) {
	for _, source := range []string{"const value=<div/>;", "const value=<><p/></>;", "const value=<p>text</p>;"} {
		func() {
			defer func() {
				if value := recover(); value != "executable artifact retained JSX after lowering" {
					t.Errorf("unexpected executable fence result for %s: %v", source, value)
				}
			}()
			assertExecutableTree(parseNormalizationSource(filepath.ToSlash(filepath.Join(t.TempDir(), "fence.tsx")), source).AsNode())
		}()
	}
	assertExecutableTree(parseNormalizationSource(filepath.ToSlash(filepath.Join(t.TempDir(), "complete.ts")), "const value=1;").AsNode())
}

// A deleted process working directory produces a compiler error rather than a panic or bogus root.
// This nonparallel test restores cwd before any later test can begin.
func TestNeverEvaluatedUnavailableWorkingDirectory(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows prevents deleting the current working directory")
	}
	original, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	root, err := os.MkdirTemp("", "exact-missing-cwd-")
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := os.Chdir(original); err != nil {
			t.Fatal(err)
		}
		_ = os.RemoveAll(root)
	}()
	if err := os.Chdir(root); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(root); err != nil {
		t.Fatal(err)
	}
	response := NewSession().Execute(Request{Kind: "project-files", ConfigFile: "tsconfig.json"})
	if response.Error == "" {
		t.Fatal("missing cwd was accepted for project file selection")
	}
	if _, err := normalizeFileName("entry.tsx", "relative-root"); err == nil {
		t.Fatal("relative root resolved against missing cwd")
	}
}

// Static context option types carry the same residency as inline and immutable literal options.
func TestNeverEvaluatedContextOptionType(t *testing.T) {
	root, config := neverEvaluatedFixture(t)
	source := `import {createContext} from '@exactjs/core';declare const options:{scope:'request'};export const Private=createContext('private',options);`
	entry := filepath.Join(root, "Context.tsx")
	if err := os.WriteFile(entry, []byte(source), 0600); err != nil {
		t.Fatal(err)
	}
	response := NewSession().Execute(Request{ID: entry, Kind: "analyze", Source: source, ConfigFile: config})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, subject := range response.Analysis.Policy.Subjects {
		if subject.Name == "Private" && subject.Policy.Residency == "server" {
			return
		}
	}
	t.Fatalf("request context lost server residency: %#v", response.Analysis.Policy.Subjects)
}

// Unsupported nested props are rejected during source normalization before target lowering.
func TestNeverEvaluatedNestedPropsRejection(t *testing.T) {
	source := `export function Page({settings:{label}}:{settings:{label:string}}){return()=> <_target title={label}/>}`
	response := NewSession().Execute(Request{ID: filepath.Join(t.TempDir(), "Page.tsx"), Kind: "compile", Target: TargetClient, Source: source})
	if !strings.Contains(response.Error, "Nested, rest, and computed bindings require a named props parameter") {
		t.Fatalf("nested props reached target lowering: %s %#v", response.Error, response.Diagnostics)
	}
}

// Authored analysis recognizes compiler-supplied task status types before lowering exists.
func TestNeverEvaluatedAuthoredTaskStatus(t *testing.T) {
	root, config := neverEvaluatedFixture(t)
	source := `import {TaskContext} from '@exactjs/core';export function Page(){const run=(task:TaskContext=TaskContext.client())=>1;run();return()=> <button>{run.pending}</button>}`
	entry := filepath.Join(root, "Page.tsx")
	if err := os.WriteFile(entry, []byte(source), 0600); err != nil {
		t.Fatal(err)
	}
	response := NewSession().Execute(Request{ID: entry, Kind: "analyze", Source: source, ConfigFile: config, Diagnostics: "semantic"})
	unexpected := []Diagnostic{}
	for _, diagnostic := range response.Diagnostics {
		// Analysis checks authored TSX before JSX emission. Host names are syntax-only here.
		if diagnostic.Code != "TS2304" || !strings.Contains(diagnostic.Message, "button") {
			unexpected = append(unexpected, diagnostic)
		}
	}
	if response.Error != "" || len(unexpected) != 0 {
		t.Fatalf("task status rejected: %s %#v", response.Error, response.Diagnostics)
	}
}
