package exactcompiler

import (
	"os"
	"path/filepath"
	"testing"
)

// Framework value methods retain their portable declaration contract across source views.
func TestFrameworkReactiveValuePlacementSources(t *testing.T) {
	config := timeSemanticConfig(t)
	for _, c := range []struct{ name, module, setup, view, placement string }{
		{"direct", "", `const cell=this.reactive(()=>props.value);`, `cell.get()`, "isomorphic"},
		{"alias", "", `const cell=this.reactive(()=>props.value);const alias=cell;`, `alias.get()`, "isomorphic"},
		{"readonly", "", `const cell=this.reactive(()=>props.value);const alias:Readonly<typeof cell>=cell;`, `alias.get()`, "isomorphic"},
		{"literal", "", `const cell=this.reactive(()=>props.value);`, `cell["get"]()`, "isomorphic"},
		{"computed", "", `const cell=this.reactive(()=>props.value);const key="get" as const;`, `cell[key]()`, "isomorphic"},
		{"projection", "", `const cell=this.reactive(()=>props.value);`, `cell.toJSON()`, "isomorphic"},
		{"map-literal-this-argument", "", `const cell=this.reactive(()=>[props.value]["map"](value=>value,()=>document.title)[0]);`, `cell.get()`, "isomorphic"},
		{"map-computed-this-argument", "", `const key="map" as const;const cell=this.reactive(()=>[props.value][key](value=>value,()=>document.title)[0]);`, `cell.get()`, "isomorphic"},
		{"reduce-callable-seed", "", `const cell=this.reactive(()=>[1].reduce(accum=>accum,()=>document.title));`, `typeof cell.get()`, "isomorphic"},
		{"promise-rejection-callback", "", `const cell=this.reactive(()=>Promise.resolve(42).then(value=>value,()=>document.title));`, `typeof cell.get()`, "client"},
		{"map-callable-this-argument", "", `const cell=this.reactive(()=>[props.value].map(value=>value,()=>document.title)[0]);`, `cell.get()`, "isomorphic"},
		{"map-this-argument", "", `const cell=this.reactive(()=>[props.value].map(value=>value,props)[0]);`, `cell.get()`, "isomorphic"},
		{"nested-read", "", `const cell=this.reactive(()=>props.value);const next=this.reactive(()=>cell.get()+1);`, `next.get()`, "isomorphic"},
		{"computed-renamed-browser", `import {computed as calculate} from '@exactjs/core';`, `const cell=calculate(()=>document.title);`, `cell.get()`, "client"},
		{"computed-namespace-browser", `import * as core from '@exactjs/core';`, `const cell=core.computed(()=>document.title);`, `cell.get()`, "client"},
		{"computed-browser", "", `const cell=computed(()=>document.title);`, `cell.get()`, "client"},
		{"derived-browser", "", `const cell=createDerived(()=>document.title);`, `cell.get()`, "client"},
		{"browser-helper", "", `function read(){return document.title}const calculate=read;const cell=this.reactive(calculate);`, `cell.get()`, "client"},
		{"browser-compute", "", `const cell=this.reactive(()=>document.title);`, `cell.get()`, "client"},
		{"native-producer", "", `const cell=this.reactive(Math.random);`, `cell.get()`, "isomorphic"},
		{"member-producer-browser", "", `const table={read:()=>document.title};const cell=this.reactive(table['read']);`, `cell.get()`, "client"},
		{"member-producer-computed", "", `const table={read:()=>props.value};const key='read' as const;const cell=this.reactive(table[key]);`, `cell.get()`, "isomorphic"},
		{"member-producer-replaced", "", `const table={read:()=>props.value};table.read=()=>document.title.length;const cell=this.reactive(table['read']);`, `cell.get()`, "unknown"},
		{"opaque-producer-alias", "", `const calculate=props.calculate;const cell=this.reactive(calculate);`, `cell.get()`, "unknown"},
		{"opaque-producer-literal", "", `const cell=this.reactive(props["calculate"]);`, `cell.get()`, "unknown"},
		{"opaque-producer-computed", "", `const key="calculate" as const;const cell=this.reactive(props[key]);`, `cell.get()`, "unknown"},
		{"opaque-producer-nullish", "", `const cell=this.reactive(props.optional??(()=>42));`, `cell.get()`, "unknown"},
		{"returned-producer-proof", "", `function factory(){return()=>42}const cell=this.reactive(factory());`, `cell.get()`, "unknown"},
		{"opaque-producer", "", `const cell=this.reactive(props.calculate);`, `cell.get()`, "unknown"},
		{"lookalike", `type ReactiveValue<T>={get():T};declare const cell:ReactiveValue<number>;`, `void cell.get();`, `42`, "unknown"},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(c.name+"/"+string(target), func(t *testing.T) {
				response := NewSession().Execute(Request{Kind: "compile", ID: "framework-cell-placement.tsx", ConfigFile: config, Target: target, Diagnostics: "semantic", Source: c.module + `import {computed,createDerived,type Component} from '@exactjs/core';export function Page(this:Component<{}>,props:{value:number;calculate:()=>number;optional?:()=>number;cell:{get():number}}){` + c.setup + `return()=> <output>{` + c.view + `}</output>}`})
				if response.Error != "" || len(response.Diagnostics) != 0 {
					t.Fatalf("source or emission rejected: %s %#v", response.Error, response.Diagnostics)
				}
				if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != c.placement {
					t.Fatalf("wrong cell method contract: %#v", response.Analysis.Components)
				}
				if c.placement == "isomorphic" && !response.Analysis.Components[0].Surface.Reactivity {
					t.Fatalf("framework cell capability was lost: %#v", response.Analysis.Components[0].Surface)
				}
			})
		}
	}
}

// Imported producer bodies retain their own placement when a framework value is portable.
func TestFrameworkReactiveValueImportedProducer(t *testing.T) {
	config := timeSemanticConfig(t)
	for _, factory := range []string{"this.reactive", "computed", "createDerived", "array-map"} {
		for _, browser := range []bool{false, true} {
			for _, target := range []Target{TargetClient, TargetServer} {
				t.Run(factory+"/"+string(target)+map[bool]string{true: "/browser", false: "/portable"}[browser], func(t *testing.T) {
					root, err := os.Getwd()
					if err != nil {
						t.Fatal(err)
					}
					dependency := filepath.Join(root, "reactive-producer-control.ts")
					entry := filepath.Join(root, "reactive-producer-page.tsx")
					body := "42"
					placement := "isomorphic"
					if browser {
						body = "document.title"
						placement = "client"
					}
					construction := factory + "(calculate)"
					if factory == "array-map" {
						construction = "this.reactive(()=>[1].map(calculate).join())"
					}
					source := `import {read as calculate} from './reactive-producer-control.js';import {computed,createDerived,type Component} from '@exactjs/core';export function Page(this:Component<{}>){const cell=` + construction + `;return()=> <output>{cell.get()}</output>}`
					session := NewSession()
					prepared := session.Execute(Request{Kind: "synchronize", ConfigFile: config, Sources: []ProjectSource{{ID: dependency, Source: "export function read(){return " + body + ";}"}, {ID: entry, Source: source}}})
					if prepared.Error != "" {
						t.Fatal(prepared.Error)
					}
					response := session.Execute(Request{Kind: "compile", ID: entry, ConfigFile: config, Source: source, Target: target, Diagnostics: "semantic"})
					if response.Error != "" || len(response.Diagnostics) != 0 {
						t.Fatalf("source rejected: %s %#v", response.Error, response.Diagnostics)
					}
					if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != placement {
						t.Fatalf("lost producer placement: %#v", response.Analysis.Components)
					}
				})
			}
		}
	}
}
