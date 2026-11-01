package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Partitioning must preserve deferred definitions and remove eagerly unavailable captured values.
func TestModuleDefinitionAndExecutionBoundaries(t *testing.T) {
	for _, test := range []struct {
		name, source, retained string
		absent                 bool
	}{
		{"private helper", `function read(){return document.title;}export class Reader{read(){return read();}}`, "function read", false},
		{"exported function", `export function read(value=window.innerWidth){return value;}`, "function read", false},
		{"arrow", `export const read=()=>document.title;`, "const read", false},
		{"function expression", `export const read=function(){return document.title;};`, "const read", false},
		{"method", `export const reader={read(){return document.title;}};`, "const reader", false},
		{"instance field", `export class Reader{value=document.title;}`, "class Reader", false},
		{"captured module input", `const browser=window.innerWidth;export function read(){return browser;}export const stable=1;`, "function read", true},
		{"static field", `export class Reader{static value=document.title;}export const stable=1;`, "class Reader", true},
		{"computed method", `export const reader={[document.title](){return 1;}};export const stable=1;`, "const reader", true},
		{"implicit construction", `class Reader{value=document.title;}export const reader=new Reader();export const stable=1;`, "const reader", true},
		{"explicit construction", `class Reader{value:string;constructor(){this.value=document.title;}}export const reader=new Reader();export const stable=1;`, "const reader", true},
		{"inherited construction", `class Base{value=document.title;}class Reader extends Base{}export const reader=new Reader();export const stable=1;`, "const reader", true},
		{"anonymous construction", `export const reader=new class{value=document.title;}();export const stable=1;`, "const reader", true},
		{"class factory", `export function createReader(){return class Reader{read(){return document.title;}};}export const Reader=createReader();export const stable=1;`, "const Reader", false},
		{"function factory", `export function createReader(){return ()=>document.title;}export const read=createReader();export const stable=1;`, "const read", false},
		{"eager call", `function read(){return document.title;}export const title=read();export const stable=1;`, "const title", true},
		{"eager call member", `function read(){return document.title;}export const title=read.call(null);export const stable=1;`, "const title", true},
		{"present optional argument", `function read(v:string){return v}function choose(){return read}const selected=choose();export const value=selected?.call(undefined,document.title)??"skipped";`, "const value", true},
		{"absent receiver effect", `function choose():((v:string)=>string)|undefined{document.title;return undefined}const selected=choose();export const value=selected?.call(undefined,document.title)??"skipped";`, "const value", true},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{ID: "/virtual/definitions.ts", Kind: "compile", Target: TargetServer, Diagnostics: "semantic", Source: test.source})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatalf("invalid retained definitions: %s %#v", response.Error, response.Diagnostics)
			}
			if strings.Contains(response.Code, test.retained) == test.absent {
				t.Fatalf("incorrect creation boundary:\n%s", response.Code)
			}
		})
	}
}

// Browser names in erased annotations must not change a component's environment availability.
func TestBrowserTypesRemainErasedAtIslandBoundary(t *testing.T) {
	for _, annotation := range []string{"HTMLElement", "HTMLElement|SVGElement", "typeof HTMLElement"} {
		source := `declare class Component{refs:{root<T>():unknown}}export function Page(this:Component){const root=this.refs.root<` + annotation + `>();return()=> <p>ok</p>;}`
		response := NewSession().Execute(Request{ID: "browser-types.tsx", Kind: "compile", Target: TargetServer, Source: source})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatalf("erased type rejected: %s %#v", response.Error, response.Diagnostics)
		}
		if findComponent(t, response.Analysis.Components, "Page").Placement != "isomorphic" {
			t.Fatalf("type changed placement: %#v", response.Analysis.Components)
		}
	}
	for _, test := range []struct{ setup, constraint string }{{`import type * as fs from 'node:fs';`, "typeof fs"}, {`import type {Stats} from 'node:fs';`, "Stats"}} {
		response := NewSession().Execute(Request{ID: "server-types.tsx", Kind: "compile", Target: TargetClient, Source: test.setup + `export function Page(){return()=> <button onClick={<T extends ` + test.constraint + `>()=>{}}>ok</button>;}`})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatalf("erased server import rejected: %s %#v", response.Error, response.Diagnostics)
		}
	}
	response := NewSession().Execute(Request{ID: "browser-value.tsx", Kind: "compile", Target: TargetServer, Source: `export function Page(){const value=HTMLElement;return()=> <p>{String(value)}</p>;}`})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || findComponent(t, response.Analysis.Components, "Page").Placement != "client" {
		t.Fatalf("runtime constructor lost its client ownership: %#v", response)
	}
}

// A known absent optional callee does not evaluate its browser-only argument.
func TestModuleOptionalAbsentInvocationRetainsFallback(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			root := t.TempDir()
			config := filepath.Join(root, "tsconfig.json")
			if err := os.WriteFile(config, []byte(`{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","target":"es2022","skipLibCheck":true},"include":["*.ts"]}`), 0600); err != nil {
				t.Fatal(err)
			}
			session := NewSession()
			for _, file := range []struct{ name, source string }{
				{"helper.ts", `export function read(v:string){return v}export function choose():typeof read|undefined{return undefined}`},
				{"entry.ts", `import {read,choose} from './helper.js';const nothing=choose();export const value=nothing?.call(undefined,document.title)??'skipped';`},
			} {
				id := filepath.Join(root, file.name)
				if err := os.WriteFile(id, []byte(file.source), 0600); err != nil {
					t.Fatal(err)
				}
				response := session.Execute(Request{ID: id, Root: root, ConfigFile: config, Kind: "compile", Target: target, Diagnostics: "semantic", Source: file.source})
				if response.Error != "" || len(response.Diagnostics) != 0 {
					t.Fatalf("%s: %#v", file.name, response)
				}
				if file.name == "entry.ts" && !strings.Contains(response.Code, "export const value") {
					t.Fatalf("lost absent-call fallback: %s", response.Code)
				}
			}
		})
	}
}
