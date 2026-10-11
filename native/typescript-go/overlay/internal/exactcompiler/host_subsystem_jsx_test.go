package exactcompiler

import (
	"strings"
	"testing"
)

func TestHostSubsystemWrappedComponentValues(t *testing.T) {
	for _, expression := range []string{"(Child)", "Child as typeof Child", "Child satisfies typeof Child", "Child!", "true ? Child : Other"} {
		t.Run(expression, func(t *testing.T) {
			source := `function Child(props:{label:string}){return ()=> <p>{props.label}</p>;} function Other(props:{label:string}){return ()=> <aside>{props.label}</aside>;} export function Page(){const Selected=` + expression + `;return ()=> <Selected label="chosen"><b>one</b><i>two</i></Selected>;}`
			for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
				response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/components.tsx", Target: target, Source: source})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				for _, diagnostic := range response.Diagnostics {
					if diagnostic.Severity == "error" {
						t.Fatalf("supported component selection rejected: %#v", diagnostic)
					}
				}
				if strings.Contains(response.Code, "<Selected") || strings.Contains(response.Code, "<b>one</b><i>two</i></Selected>") {
					t.Fatalf("authored JSX survived: %s", response.Code)
				}
			}
		})
	}
}

func TestHostSubsystemJSXAssemblyControls(t *testing.T) {
	for name, source := range map[string]string{
		"directives-only":            `"use strict"; "use client";`,
		"no-module-work":             `export function Page(){return ()=> <p/>;}`,
		"fragment-expression":        `export function Page(props:{value:string}){return ()=> <> before {props.value} {/*empty*/}<b>after</b></>;}`,
		"micro-one-child":            `function Inline(props:{children?:unknown}){return <p>{props.children}</p>;} export function Page(){return ()=> <Inline><b>one</b></Inline>;}`,
		"micro-many-children":        `function Inline(props:{children?:unknown}){return <p>{props.children}</p>;} export function Page(){return ()=> <Inline><b>one</b><i>two</i></Inline>;}`,
		"transparent-target":         `export function Page(){return ()=> <_><_target title="target"/></_>;}`,
		"local-alias":                `function Child(){return ()=> <p/>;} export function Page(){const Alias=Child; const Selected=Alias; return ()=> <Selected/>;}`,
		"nonidentifier-siblings":     `const Children={First:()=> <p/>,Second:()=> <i/>};export function Page(){return ()=> <div><Children.First/><Children.Second/></div>;}`,
		"invalid-function-render":    `export function Page(props:{value:string}){return function render(){return props.value;};}`,
		"invalid-block-arrow-render": `export function Page(props:{value:string}){return ()=> {return props.value;};}`,
		"render-name-collision":      `const __exactComponentReceipt=1; const __exactPrepareRenderProgram=2; export function Page(){return ()=> <p>{__exactComponentReceipt+__exactPrepareRenderProgram}</p>;}`,
	} {
		t.Run(name, func(t *testing.T) {
			for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
				response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/assembly.tsx", Target: target, Source: source, SourceMap: true})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				for _, diagnostic := range response.Diagnostics {
					if diagnostic.Severity == "error" && !strings.HasPrefix(name, "invalid-") {
						t.Fatalf("JSX assembly rejected %s: %#v", name, diagnostic)
					}
				}
				if strings.HasPrefix(name, "invalid-") {
					if len(response.Diagnostics) == 0 {
						t.Fatal("unsupported render source lost its diagnostic")
					}
					continue
				}
				if response.SourceMap == nil {
					t.Fatal("assembly lost source-map contract")
				}
			}
		})
	}
}

func TestHostSubsystemDirectivesRejection(t *testing.T) {
	for _, directive := range []string{"unknown", "keep", "keep=unknown", "track=value", "own=value"} {
		response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/directives.ts", Source: "/** @exact " + directive + " */ export const value=1;"})
		found := false
		for _, diagnostic := range response.Diagnostics {
			found = found || diagnostic.Code == "EXACT1001"
		}
		if !found {
			t.Fatalf("invalid directive accepted: %s %#v", directive, response.Diagnostics)
		}
	}
}

func TestHostSubsystemModuleRewriteControls(t *testing.T) {
	for name, source := range map[string]string{
		"default-to-named":     `import original from "source"; export {original};`,
		"all-named":            `import {value} from "source"; export {value};`,
		"default-and-retained": `import original, {kept} from "source"; export {original,kept};`,
		"retained-only":        `import {kept} from "source"; export {kept};`,
		"side-effect":          `import "source";`,
		"export-all":           `export * from "source";`,
		"export-namespace":     `export * as namespace from "source";`,
		"export-all-replaced":  `export {value} from "source";`,
		"export-retained":      `export {kept} from "source";`,
		"namespace-default":    `"use strict"; import * as namespace from "source"; export const value=namespace.default;`,
		"namespace-other":      `import * as namespace from "source"; export const value=namespace["kept"];`,
		"require-dynamic":      `export function run(name:string){return require(name).value;}`,
		"require-template":     "export const value=require(`source`).value;",
		"require-rest":         `const {value,...rest}=require("source");export {value,rest};`,
		"dynamic-template":     "export const value=import(`source`);",
		"dynamic-expression":   `export function run(name:string){return import(name);}`,
		"type-import":          `export type Value=import("unrelated").Value;`,
	} {
		t.Run(name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/rewrite.ts", Source: source, ModuleRewrite: &ModuleRewrite{Replacements: []ModuleExportReplacement{{SourceModule: "source", SourceExport: "default", TargetModule: "target", TargetExport: "named"}, {SourceModule: "source", SourceExport: "value", TargetModule: "target", TargetExport: "default"}}, ModuleAliases: map[string]string{"unrelated": "other"}}})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			for _, diagnostic := range response.Diagnostics {
				if diagnostic.Severity == "error" {
					t.Fatalf("module rewrite generated invalid syntax: %#v", diagnostic)
				}
			}
			if response.Code == "" {
				t.Fatal("module rewrite lost executable output")
			}
		})
	}
}

func TestHostSubsystemServerRendererOptions(t *testing.T) {
	for options, closed := range map[string]bool{
		"":                                 true,
		", {markers:false}":                true,
		", {markers:true}":                 true,
		", {reactMarkup:false}":            true,
		", {reactMarkup:true}":             false,
		", {outputExtensions:[]}":          true,
		", {outputExtensions:[extension]}": false,
		", {reactMarkup}":                  false,
		", {outputExtensions}":             false,
		", {markers}":                      true,
		", {extra}":                        true,
		", {[key]:false}":                  false,
		", {...settings}":                  false,
		", settings":                       false,
		", {}, {}":                         false,
	} {
		for _, renderer := range []string{"renderToString", "renderToHydratableString"} {
			source := `import {` + renderer + `} from "@exactjs/ssr";declare const extension:unknown,reactMarkup:boolean,outputExtensions:unknown[],markers:boolean,extra:number,key:string,settings:object;function Page(){return ()=> <p>page</p>;}export const output=` + renderer + `(<Page/>` + options + `);`
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/renderer-options.tsx", Source: source, Target: TargetServer})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			for _, diagnostic := range response.Diagnostics {
				if diagnostic.Severity == "error" {
					t.Fatalf("renderer options produced invalid artifact: %#v", diagnostic)
				}
			}
			redirected := strings.Contains(response.Code, "__exactRenderClosed")
			if redirected != closed {
				t.Fatalf("renderer option proof changed %s%s: closed=%t\n%s", renderer, options, redirected, response.Code)
			}
		}
	}
}

func TestHostSubsystemSemanticGraphTypeEdges(t *testing.T) {
	source := `import type Default from "types";import {type Shape,value} from "types";
export interface Contract {value:number};export type Alias=Shape;
export const Named=class NamedClass{};export const local=value;
export {local};export {local as renamed};export {type Shape};export type {Default};
export type {local as TypeAlias};export {type local as SpecifierAlias};
export * from "types";export * as namespace from "types";`
	response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/graph.ts", Source: source})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	graph := response.Analysis.SemanticGraph
	for _, exported := range []string{"TypeAlias", "SpecifierAlias"} {
		found := false
		for _, reference := range graph.References {
			if reference.ExportedName == exported {
				found = true
				if !reference.TypeOnly {
					t.Fatalf("type export reference retained runtime ownership: %#v", reference)
				}
			}
		}
		if !found {
			t.Fatalf("missing source export reference: %s %#v", exported, graph.References)
		}
	}
	for _, name := range []string{"Default", "Shape", "Alias", "Contract"} {
		found := false
		for _, declaration := range graph.Declarations {
			if declaration.Name == name {
				found = true
				if !declaration.TypeOnly {
					t.Fatalf("type declaration acquired runtime identity: %#v", declaration)
				}
			}
		}
		if !found {
			t.Fatalf("missing authored declaration %s", name)
		}
	}
	for _, name := range []string{"Default", "Shape"} {
		found := false
		for _, exported := range graph.Exports {
			if exported.ExportedName == name {
				found = true
				if !exported.TypeOnly {
					t.Fatalf("type export acquired runtime identity: %#v", exported)
				}
			}
		}
		if !found {
			t.Fatalf("missing type export %s", name)
		}
	}
}

func TestHostSubsystemLowercaseNamespaceTags(t *testing.T) {
	for _, namespace := range []string{"core", "Core"} {
		for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
			source := `import * as ` + namespace + ` from "@exactjs/core";export function Page(){return ()=> <` + namespace + `.Fragment><p>ok</p></` + namespace + `.Fragment>;}`
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/namespace.tsx", Source: source, Target: target})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if strings.Contains(response.Code, "createServerDynamicComponent") || strings.Contains(response.Code, "createDynamicComponentBoundary") {
				t.Fatalf("structural namespace became an open dynamic component: %s", response.Code)
			}
			if strings.Contains(response.Code, "<"+namespace+".Fragment") {
				t.Fatalf("namespace value became a literal host tag: %s", response.Code)
			}
			for _, element := range response.Analysis.JSX {
				if element.Tag == namespace+".Fragment" && element.Intrinsic {
					t.Fatalf("member expression was classified as intrinsic: %#v", element)
				}
			}
		}
	}
}
