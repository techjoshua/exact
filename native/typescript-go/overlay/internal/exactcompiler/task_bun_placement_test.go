package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Read the installed Bun declarations so the normal resolver and checker select
// the same lexical bindings that a component library using Bun would see.
func TestBunRuntimeModuleTaskPlacement(t *testing.T) {
	for _, row := range []struct {
		name, helper, invocation, policy, want string
	}{
		{"sqlite", `import {Database as Driver} from "bun:sqlite"; function label(){return typeof Driver}`, "label()", "latest", "server"},
		{"ffi", `import {suffix as librarySuffix} from "bun:ffi"; function label(){return librarySuffix}`, "label()", "latest", "server"},
		{"client-conflict", `import {suffix as librarySuffix} from "bun:ffi"; function label(){return librarySuffix}`, "label()", "client", "refused"},
		{"type-only", `import type {Database} from "bun:sqlite"; function label(db?:Database){return "ready"}`, "label()", "client", "client"},
		{"type-only-specifier", `import {type Database} from "bun:sqlite"; function label(db?:Database){return "ready"}`, "label()", "client", "client"},
		{"shadow", `import {suffix} from "bun:ffi"; function label(suffix:string){return suffix}`, `label("ready")`, "client", "client"},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `import {TaskContext,type Component} from "@exactjs/core";
` + row.helper + `
export function Page(this:Component<{value:string}>){
	this.state.value = "";
	const run = (task:TaskContext=TaskContext.` + row.policy + `()) => {this.state.value = ` + row.invocation + `;};
	return () => <button onClick={()=>run()}>{this.state.value}</button>;
}`
			f := newExecutableFixture(t, map[string]string{"entry.tsx": source})
			configureBunPlacementFixture(t, f)
			request := f.request("compile", "entry.tsx")
			request.Target = TargetClient
			if row.want == "server" {
				request.Target = TargetServer
			}
			r := f.session.Execute(request)
			if row.want == "refused" {
				for _, diagnostic := range r.Diagnostics {
					if diagnostic.Severity == "error" && strings.Contains(diagnostic.Message, "task requests client placement but references server-only imports") && r.Code == "" && r.SourceMap == nil && r.Error == "" {
						return
					}
				}
				t.Fatalf("missing client placement refusal: %s %#v", r.Error, r.Diagnostics)
			}
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" || len(r.Analysis.Tasks) != 1 {
				t.Fatalf("component task did not compile: %s %#v tasks=%d", r.Error, r.Diagnostics, len(r.Analysis.Tasks))
			}
			task := r.Analysis.Tasks[0]
			if task.Placement != row.want || task.ServerEffects != (row.want == "server") {
				t.Fatalf("wrong runtime import placement: %#v", task)
			}
		})
	}
}

func configureBunPlacementFixture(t *testing.T, f *executableFixture) {
	t.Helper()
	config := `{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","target":"ES2022","strict":true,"skipLibCheck":true,"jsx":"react-jsx","jsxImportSource":"@exactjs/jsx","types":["bun"]},"files":["entry.tsx"]}`
	if err := os.WriteFile(filepath.Join(f.root, "tsconfig.json"), []byte(config), 0600); err != nil {
		t.Fatal(err)
	}
}

// Before the checker runs, setup normalization must still distinguish actual
// platform reads from component-local initializers using the same spellings.
func TestPlatformSetupBindingPlacement(t *testing.T) {
	for _, row := range []struct {
		name, imports, setup, target string
		reactive                     bool
	}{
		{"bun-shadow", `import {suffix} from "bun:ffi";`, `const suffix="local"; this.state.value=suffix;`, "client", false},
		{"bun", `import {suffix} from "bun:ffi";`, `this.state.value=suffix;`, "server", true},
		{"node", `import {version as suffix} from "node:process";`, `this.state.value=suffix;`, "server", true},
		{"node-type", `import type {PathLike as suffix} from "node:fs";`, `const suffix="local"; this.state.value=suffix;`, "client", false},
		{"browser", "", `this.state.value=document.title;`, "client", true},
		{"browser-shadow", "", `const document={title:"local"}; this.state.value=document.title;`, "client", false},
	} {
		t.Run(row.name, func(t *testing.T) {
			f := newExecutableFixture(t, map[string]string{"entry.tsx": row.imports + `
import type {Component} from "@exactjs/core";
export function Page(this:Component<{value:string}>){
	` + row.setup + `
	return()=> <output>{this.state.value}</output>;
}`})
			configureBunPlacementFixture(t, f)
			request := f.request("compile", "entry.tsx")
			request.Target = Target(row.target)
			r := f.session.Execute(request)
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatalf("setup failed to compile: %s %#v", r.Error, r.Diagnostics)
			}
			if row.reactive {
				if len(r.Analysis.Tasks) != 1 || !r.Analysis.Tasks[0].CompilerComputation || r.Analysis.Tasks[0].Placement != row.target {
					t.Fatalf("missing platform setup computation: %#v", r.Analysis.Tasks)
				}
			} else if len(r.Analysis.Tasks) != 0 {
				t.Fatalf("local state initializer acquired a platform task: %#v", r.Analysis.Tasks)
			}
		})
	}
}
