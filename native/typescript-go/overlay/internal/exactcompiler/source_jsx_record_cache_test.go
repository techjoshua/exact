package exactcompiler

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Unchanged source must not reuse semantic admission from a different request
// mode after actual final language-owner disposal. No receipt is restamped.
func TestJSXRecordRetainedModeTransitions(t *testing.T) {
	root := t.TempDir()
	id := filepath.Join(root, "mode.tsx")
	const source = `/// <reference path="./jsx-types.d.ts" />
function select(value:number){return {value}}export function Panel(){return()=> <p>{select(1).value}</p>}`
	if err := os.WriteFile(filepath.Join(root, "jsx-types.d.ts"), []byte(`declare namespace JSX{interface Element{}interface IntrinsicElements{p:{children?:unknown}}}`), 0600); err != nil {
		t.Fatal(err)
	}
	session := NewSession()
	var prior *projectCallableCache
	for _, row := range []struct {
		name, kind                 string
		interop, provider, pending bool
	}{
		{name: "analyze", kind: "analyze", pending: true},
		{name: "compile-after-analyze", kind: "compile"},
		{name: "unchanged-native-reuse", kind: "compile"},
		{name: "interop", kind: "compile", interop: true, pending: true},
		{name: "native-after-interop", kind: "compile"},
		{name: "provider", kind: "compile", provider: true, pending: true},
		{name: "native-after-provider", kind: "compile"},
		{name: "analyze-after-native", kind: "analyze", pending: true},
		{name: "final-native", kind: "compile"},
	} {
		t.Run(row.name, func(t *testing.T) {
			request := Request{Kind: row.kind, ID: id, Root: root, Source: source, Target: TargetClient, PackageType: "application"}
			if row.interop {
				request.JSXInterop = &JSXInterop{AdapterModule: "@exactjs/react-compat", AdapterExport: "adaptReactComponent"}
			}
			if row.provider {
				request.PackageName = "@exactjs/core"
			}
			response := session.Execute(request)
			fresh := NewSession().Execute(request)
			if fresh.Error != response.Error || fresh.Code != response.Code || !reflect.DeepEqual(fresh.Diagnostics, response.Diagnostics) || !reflect.DeepEqual(fresh.Analysis.Components, response.Analysis.Components) {
				t.Fatal("retained/fresh mode result mismatch")
			}
			if row.pending {
				if !strings.Contains(response.Error, "required staged effect contribution") {
					t.Fatal("ineligible mode lost original pending contract", response.Error, response.Diagnostics)
				}
			} else if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal("canonical compile after mode change", response.Error, response.Diagnostics)
			}
			project := session.projects[nativeProjectKey(request, id)]
			if project == nil || project.callableCache == nil {
				t.Fatal("UNREACHED: actual retained source cache")
			}
			cache := project.callableCache
			file := project.program.GetSourceFile(id)
			context := cache.bySource[file].sourceContext
			if context == nil || (context.jsxConstruction == (sourceJSXConstructionKey{})) != row.pending {
				t.Fatal("cached source mode input stale or absent")
			}
			if row.name == "unchanged-native-reuse" && cache != prior {
				t.Fatal("unchanged native mode discarded cache")
			}
			if row.name != "unchanged-native-reuse" && prior != nil && cache == prior {
				t.Fatal("mode recollection reused retired publication owner")
			}
			if cache.owner.values.language != nil && !cache.owner.values.language.disposed {
				t.Fatal("Session retained live language publication namespace")
			}
			prior = cache
		})
	}
}

// A bootstrap with no JSX still owns a canonical compile request; an imported
// component uses its own source/pragma/component context, never the primary's.
func TestJSXRecordImportedModeTransitions(t *testing.T) {
	root := t.TempDir()
	entry := filepath.Join(root, "entry.ts")
	child := filepath.Join(root, "child.tsx")
	const source = "import{Child}from'./child.js';export const reference=Child;"
	const childSource = `/// <reference path="./jsx-types.d.ts" />
function select(value:number){return {value}}export function Child(){return()=> <p>{select(1).value}</p>}`
	for name, text := range map[string]string{child: childSource, filepath.Join(root, "jsx-types.d.ts"): `declare namespace JSX{interface Element{}interface IntrinsicElements{p:{children?:unknown}}}`} {
		if err := os.WriteFile(name, []byte(text), 0600); err != nil {
			t.Fatal(err)
		}
	}
	session := NewSession()
	for _, kind := range []string{"analyze", "compile", "analyze", "compile"} {
		request := Request{Kind: kind, ID: entry, Root: root, Source: source, Target: TargetClient, PackageType: "application"}
		response := session.Execute(request)
		if kind == "analyze" {
			if !strings.Contains(response.Error, "required staged effect contribution") {
				t.Fatal("analysis mode bypassed imported source debt", response.Error, response.Diagnostics)
			}
		} else if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatal("imported canonical source failed", response.Error, response.Diagnostics)
		}
		project := session.projects[nativeProjectKey(request, entry)]
		if project == nil || project.callableCache == nil {
			t.Fatal("UNREACHED: retained imported source cache")
		}
		file := project.program.GetSourceFile(child)
		if file == nil {
			t.Fatal("UNREACHED: actual imported child")
		}
		context := project.callableCache.bySource[file].sourceContext
		if context == nil || (context.jsxConstruction == (sourceJSXConstructionKey{})) != (kind == "analyze") {
			t.Fatal("imported source mode input was not renewed")
		}
		if kind == "compile" {
			mode := project.callableCache.owner.values.generation.sourceJSXConstruction
			if mode == nil {
				t.Fatal("UNREACHED: actual imported native profile")
			}
			observed := false
			for node, profile := range mode.profiles {
				observed = observed || profile && ast.GetSourceFileOfNode(node) == file
			}
			if !observed {
				t.Fatal("UNREACHED: imported Get construction profile")
			}
		}
	}
}
