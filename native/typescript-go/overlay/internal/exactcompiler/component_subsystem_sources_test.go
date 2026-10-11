package exactcompiler

import (
	"strings"
	"testing"
)

// Only source-proven inert document regions may publish their head before blocking settlement.
func TestComponentDocumentHeadSourceBoundaries(t *testing.T) {
	for _, source := range []struct {
		name, root, head, body string
		streaming              bool
	}{
		{"literal-values", "", "<title>{'Ready'}{2}{true}{false}{null}</title>", "<main>{this.state.value}</main>", true},
		{"empty-expression", "", "{/*empty*/}<title>Ready</title>", "{/*empty*/}<main>{this.state.value}</main>", true},
		{"literal-attribute", `lang="en"`, "<title>Ready</title>", "<main>{this.state.value}</main>", true},
		{"spread-root", `{...{lang:'en'}}`, "<title>Ready</title>", "<main>{this.state.value}</main>", false},
		{"dynamic-root", `lang={'en'}`, "<title>Ready</title>", "<main>{this.state.value}</main>", false},
		{"body-event", "", "<title>Ready</title>", "<main onClick={()=>{}}>{this.state.value}</main>", false},
		{"body-spread", "", "<title>Ready</title>", "<main {...{title:'Ready'}}>{this.state.value}</main>", false},
		{"body-condition", "", "<title>Ready</title>", "<main>{this.state.value ? <span/> : null}</main>", false},
	} {
		t.Run(source.name, func(t *testing.T) {
			response := NewSession().Execute(Request{
				Kind: "compile", ID: "document-head-source.tsx", Target: TargetServer, Diagnostics: "semantic",
				Source: `import {TaskContext,type Component} from '@exactjs/core';
				export function Document(this:Component<{value:string}>) {
				 this.state.value='pending';
				 function load(task:TaskContext=TaskContext.server().blocking()){this.state.value='ready'}
				 load();return()=> <html ` + source.root + `><head>` + source.head + `</head><body>` + source.body + `</body></html>;
				}`,
			})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("valid document source rejected: %s %#v", response.Error, response.Diagnostics)
			}
			if strings.Contains(response.Code, "streamingDocument: true") != source.streaming {
				t.Fatalf("document publication proof changed: %s", response.Code)
			}
			if strings.Contains(response.Code, "host: this") != source.streaming {
				t.Fatalf("deferred body ownership changed: %s", response.Code)
			}
		})
	}
}

// Nested collection shapes must select the same observation lane across equivalent type views.
func TestComponentNestedCollectionTypeViews(t *testing.T) {
	for _, shape := range []struct {
		name, valueType, initial string
		collections              bool
	}{
		{"scalar-object", "{value:number}", "{value:1}", false},
		{"nested-map", "{value:Map<string,number>}", "{value:new Map()}", true},
		{"aliased-map", "{value:Lookup}", "{value:new Map()}", true},
		{"readonly-map", "{value:ReadonlyMap<string,number>}", "{value:new Map()}", true},
		{"nested-set", "{value:Set<number>}", "{value:new Set()}", true},
		{"indexed-object", "{value:{[key:string]:number}}", "{value:{a:1}}", true},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(shape.name+"/"+string(target), func(t *testing.T) {
				response := NewSession().Execute(Request{
					Kind: "compile", ID: "component-collection-shape.tsx", Target: target, Diagnostics: "semantic",
					Source: `import {type Component} from '@exactjs/core';type Lookup=Map<string,number>;
					export function Page(this:Component<{data:` + shape.valueType + `}>) {
					 this.state.data=` + shape.initial + `;
					 return()=> <output>{String(this.state.data.value)}</output>;
					}`,
				})
				if response.Error != "" || len(response.Diagnostics) != 0 {
					t.Fatalf("valid collection shape rejected: %s %#v", response.Error, response.Diagnostics)
				}
				if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Collections != shape.collections {
					t.Fatalf("type view changed collection observation: %#v", response.Analysis.Components)
				}
				if target == TargetClient && strings.Contains(response.Code, `"collections"`) != shape.collections {
					t.Fatalf("analysis collection proof was lost in lowering: %s", response.Code)
				}
			})
		}
	}
}

// Finite nested props publish positional metadata while opaque alternatives retain named values.
func TestComponentPropsSerializationSourceShapes(t *testing.T) {
	for _, shape := range []struct {
		name, declaration, props string
		positional, projector    bool
	}{
		{"primitive", "", "{value:string}", false, false},
		{"empty", "", "{}", false, false},
		{"unknown", "", "{value:unknown}", false, false},
		{"callable", "", "{value:()=>number}", false, false},
		{"indexed", "", "{value:{[key:string]:number}}", false, false},
		{"nullable", "", "{value:{name:string}|null|undefined}", true, false},
		{"alternatives", "", "{value:{name:string}|{count:number}}", false, false},
		{"nullish", "", "{value:null|undefined}", false, false},
		{"recursive", "interface Tree{label:string;next?:Tree}", "{value:Tree}", true, false},
		{"primitive-array", "", "{value:number[]}", true, false},
		{"small-record-array", "", "{value:{a:number;b:string}[]}", true, false},
		{"repeated-record", "", "{value:{a:number;b:string;c:boolean;d:{name:string}}[]}", true, true},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(shape.name+"/"+string(target), func(t *testing.T) {
				response := NewSession().Execute(Request{Kind: "compile", ID: "component-props-shape.tsx", Target: target, Diagnostics: "semantic", Source: `import{type Component}from'@exactjs/core';` + shape.declaration + `export function Page(this:Component<{}>,props:` + shape.props + `){return()=> <p title={String(props)}>Ready</p>}`})
				if response.Error != "" || len(response.Diagnostics) != 0 {
					t.Fatalf("valid props rejected: %s %#v", response.Error, response.Diagnostics)
				}
				if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "isomorphic" {
					t.Fatalf("props shape changed placement: %#v", response.Analysis.Components)
				}
				if (response.Analysis.Components[0].PropsSerialization != nil) != shape.positional {
					t.Fatalf("wrong positional shape: %#v", response.Analysis.Components[0].PropsSerialization)
				}
				if strings.Contains(response.Code, "serialization:") != shape.positional {
					t.Fatalf("serialization proof lost at emission: %s", response.Code)
				}
				if strings.Contains(response.Code, "registerPositionalProjector") != (shape.projector && target == TargetServer) {
					t.Fatalf("wrong repeated record lane: %s", response.Code)
				}
			})
		}
	}
}

// Setup environment summaries preserve known browser/server constraints even with opaque neighbors.
func TestComponentSetupEnvironmentBoundaries(t *testing.T) {
	for _, scenario := range []struct{ name, prelude, setup, effect string }{
		{"browser", "", "const value=window.innerWidth;", "browser"},
		{"server", "import{readFileSync}from'node:fs';", "const value=readFileSync('/tmp/exact-probe','utf8');", "server"},
		{"mixed", "import{readFileSync}from'node:fs';", "const value=window.innerWidth+readFileSync('/tmp/exact-probe','utf8');", "mixed"},
		{"opaque-browser", "declare function opaque():number;", "const value=window.innerWidth+opaque();", "browser"},
		{"opaque-server", "import{readFileSync}from'node:fs';declare function opaque():number;", "const value=readFileSync('/tmp/exact-probe','utf8')+opaque();", "server"},
		{"opaque-mixed", "import{readFileSync}from'node:fs';declare function opaque():number;", "const value=window.innerWidth+readFileSync('/tmp/exact-probe','utf8')+opaque();", "mixed"},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(scenario.name+"/"+string(target), func(t *testing.T) {
				response := NewSession().Execute(Request{Kind: "compile", ID: "setup-environment-boundaries.tsx", Target: target, Source: scenario.prelude + `export function Page(){` + scenario.setup + `return()=> <p>{value}</p>}`})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].EnvironmentEffect != scenario.effect {
					t.Fatalf("setup effects lost: %#v", response.Analysis.Components)
				}
				if scenario.effect == "mixed" && !strings.Contains(strings.Join(response.Analysis.Components[0].Diagnostics, " "), "mixed placement") {
					t.Fatalf("mixed setup accepted: %#v", response.Diagnostics)
				}
				if scenario.effect == "browser" && target == TargetServer && strings.Contains(response.Code, "window.innerWidth") {
					t.Fatalf("browser setup leaked to server: %s", response.Code)
				}
				if scenario.effect == "server" && target == TargetClient && strings.Contains(response.Code, "readFileSync('/tmp") {
					t.Fatalf("server setup leaked to client: %s", response.Code)
				}
			})
		}
	}
}

// A component spanning its entire module must resolve to the callable rather than the source file.
func TestWholeModuleComponentSourceOwnership(t *testing.T) {
	for _, prefix := range []string{"", "export "} {
		for _, target := range []Target{TargetClient, TargetServer} {
			response := NewSession().Execute(Request{Kind: "compile", ID: "whole-module-component.tsx", Target: target, Diagnostics: "semantic", Source: prefix + `function Clock(this:import('@exactjs/core').Component<{}>){this.onMount(()=>undefined);return()=> <time/>}`})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("whole-module component rejected: %s %#v", response.Error, response.Diagnostics)
			}
			if response.Analysis.Components[0].Placement != "isomorphic" {
				t.Fatalf("whole-module placement changed: %#v", response.Analysis.Components)
			}
			if target == TargetClient && (!strings.Contains(response.Code, "registerComponentLifecycleHandler") || strings.Contains(response.Code, "this.onMount(")) {
				t.Fatalf("component source owner lost: %s", response.Code)
			}
			if target == TargetServer && strings.Contains(response.Code, "this.onMount(") {
				t.Fatalf("client callback retained by server: %s", response.Code)
			}
		}
	}
}
