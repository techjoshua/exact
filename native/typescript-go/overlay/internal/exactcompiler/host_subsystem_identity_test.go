package exactcompiler

import (
	"strings"
	"testing"
)

func TestHostSubsystemShadowedModuleCalls(t *testing.T) {
	for _, source := range []string{
		`export function run(require: (name: string) => any) { return require("original").value; }`,
		`export function run(require: (name: string) => any) { const { value } = require("original"); return value; }`,
		`export function run(require: (name: string) => any) { return require("original")["value"]; }`,
	} {
		response := NewSession().Execute(Request{ID: "/virtual/shadowed.ts", Kind: "compile", Source: source,
			ModuleRewrite: &ModuleRewrite{ModuleAliases: map[string]string{"original": "aliased"}, Replacements: []ModuleExportReplacement{{SourceModule: "original", SourceExport: "value", TargetModule: "replacement", TargetExport: "next"}}},
		})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		if !strings.Contains(response.Code, `require("original")`) || strings.Contains(response.Code, `"replacement"`) || strings.Contains(response.Code, `"aliased"`) {
			t.Fatalf("local callback was rewritten as a module loader:\n%s", response.Code)
		}
	}
}

func TestHostSubsystemTypeOnlyRuntimeExports(t *testing.T) {
	for _, source := range []string{
		`class Hidden {} export type { Hidden }; export const visible = 1;`,
		`class Hidden {} export { type Hidden }; export const visible = 1;`,
	} {
		response := NewSession().Execute(Request{ID: "/virtual/exports.ts", Kind: "analyze", Source: source})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		for _, exported := range response.Analysis.Exports {
			if exported.Name == "Hidden" {
				t.Fatalf("type-only class published as runtime export: %#v", response.Analysis.Exports)
			}
		}
		if len(response.Analysis.Exports) != 1 || response.Analysis.Exports[0].Name != "visible" {
			t.Fatalf("runtime control lost: %#v", response.Analysis.Exports)
		}
	}
}

func TestHostSubsystemNamespaceImportShadowing(t *testing.T) {
	response := NewSession().Execute(Request{ID: "/virtual/imports.ts", Kind: "analyze", Source: `
		import * as browser from "browser-only" with { exact: "client" };
		export function compute(browser: { value(): number }) { return browser.value(); }
	`})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, callable := range response.Analysis.Callables {
		if callable.Name == "compute" && callable.Effect == "browser" {
			t.Fatalf("local namespace receiver inherited imported placement: %#v", callable)
		}
	}
}

func TestHostSubsystemShadowedServerRenderer(t *testing.T) {
	for _, source := range []string{
		`import { renderToString } from "@exactjs/ssr"; function Page(){ return () => <p>page</p>; } export function run(renderToString: (value: any) => string) { return renderToString(<Page />); }`,
		`import * as ssr from "@exactjs/ssr"; function Page(){ return () => <p>page</p>; } export function run(ssr: { renderToString(value: any): string }) { return ssr.renderToString(<Page />); }`,
	} {
		response := NewSession().Execute(Request{ID: "/virtual/renderer.tsx", Kind: "compile", Target: TargetServer, Source: source})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		if strings.Contains(response.Code, "__exactRenderClosedSsr(") {
			t.Fatalf("local renderer was replaced by framework SSR:\n%s", response.Code)
		}
	}
}

func TestHostSubsystemShadowedClientRenderer(t *testing.T) {
	for _, source := range []string{
		`import { render } from "@exactjs/dom"; function Page(){ return () => <p>page</p>; } export function run(render: (value: any, root: any) => string, root:any) { return render(<Page />, root); }`,
		`import * as core from "@exactjs/dom"; function Page(){ return () => <p>page</p>; } export function run(core: { render(value: any, root: any): string }, root:any) { return core.render(<Page />, root); }`,
	} {
		response := NewSession().Execute(Request{ID: "/virtual/renderer.tsx", Kind: "compile", Target: TargetClient, Source: source})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		if strings.Contains(response.Code, "__exactRenderCompiledRoot(") {
			t.Fatalf("local client renderer was replaced by framework entry:\n%s", response.Code)
		}
	}
}

func TestHostSubsystemModuleReplacementNames(t *testing.T) {
	for _, source := range []string{
		`import {value} from "original"; export {value};`,
		`export {value} from "original";`,
		`export const value=require("original").value;`,
		`export const value=require("original")["value"];`,
		`const {value}=require("original");export {value};`,
		`import * as original from "original"; export const value=original.value;`,
	} {
		response := NewSession().Execute(Request{ID: "/virtual/quoted.ts", Kind: "compile", Source: source, ModuleRewrite: &ModuleRewrite{Replacements: []ModuleExportReplacement{{SourceModule: "original", SourceExport: "value", TargetModule: "target", TargetExport: "next-value"}}}})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		for _, diagnostic := range response.Diagnostics {
			if diagnostic.Severity == "error" {
				t.Fatalf("valid string export replacement generated invalid code: %#v\n%s", diagnostic, response.Code)
			}
		}
	}
}

func TestHostSubsystemCommonJSKeyIdentity(t *testing.T) {
	for _, source := range []string{
		"export const value=require(`original`).value;",
		`const { ["other"]: value }=require("original");export {value};`,
	} {
		response := NewSession().Execute(Request{ID: "/virtual/commonjs.ts", Kind: "compile", Source: source, ModuleRewrite: &ModuleRewrite{Replacements: []ModuleExportReplacement{{SourceModule: "original", SourceExport: "value", TargetModule: "target", TargetExport: "next"}}}})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		if strings.Contains(source, "[\"other\"]") {
			if strings.Contains(response.Code, `"target"`) {
				t.Fatalf("computed property was matched by its local binding name: %s", response.Code)
			}
		} else if !strings.Contains(response.Code, `require("target").next`) {
			t.Fatalf("literal template module request was not rewritten: %s", response.Code)
		}
	}
}

func TestHostSubsystemAmbientModuleLoader(t *testing.T) {
	response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/ambient.ts", Source: `declare function require(name:string):{value:number};export const result=require("original").value;`, ModuleRewrite: &ModuleRewrite{ModuleAliases: map[string]string{"original": "aliased"}}})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if !strings.Contains(response.Code, `require("aliased")`) {
		t.Fatalf("ambient native loader was not rewritten: %s", response.Code)
	}
}

func TestHostSubsystemOptionalModuleReplacement(t *testing.T) {
	for _, target := range []string{"next", "next-value"} {
		for _, access := range []string{`.value`, `["value"]`} {
			for _, optional := range []string{"", "?."} {
				for _, call := range []string{`require("original")`, `require?.("original")`} {
					member := access
					if optional != "" {
						member = optional + strings.TrimPrefix(access, ".")
					}
					response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/optional.ts", Source: `export const result=` + call + member + `;`, ModuleRewrite: &ModuleRewrite{Replacements: []ModuleExportReplacement{{SourceModule: "original", SourceExport: "value", TargetModule: "target", TargetExport: target}}}})
					if response.Error != "" {
						t.Fatal(response.Error)
					}
					if !strings.Contains(strings.ReplaceAll(response.Code, "?.", ""), `require("target")`) || strings.Contains(response.Code, `require?.`) != strings.Contains(call, `require?.`) || strings.Contains(response.Code, `)?.`) != (optional != "") {
						t.Fatalf("replacement changed optional member access: %s", response.Code)
					}
				}
			}
		}
	}
}
