package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Making a value and invoking it have separate environment contracts. Both must
// follow the selected source, including aliases and constructors, before emission.
func TestExecutableSelectionValueDefinitions(t *testing.T) {
	for _, route := range []string{"direct", "named", "local", "star"} {
		for _, browser := range []bool{false, true} {
			t.Run(route+map[bool]string{false: "/neutral", true: "/browser"}[browser], func(t *testing.T) {
				typed, selected := `return document.title;`, `return "host";`
				want := "isomorphic"
				if browser {
					typed, selected = selected, typed
					want = "client"
				}
				files := map[string]string{
					"entry.ts":  `import {read,Box} from './helper.js';export const value=read();export const box=new Box();export const deferred=()=>read();`,
					"helper.ts": `export function read(){` + typed + `}export class Box{value=read();}`,
					"helper.js": `export function read(){` + selected + `}export class Box{value=read();}`,
				}
				edges := []ExecutableEdge{{"entry.ts", 0, "./helper.js", "import", "helper.js"}}
				if route != "direct" {
					files["entry.ts"] = `import {read,Box} from './barrel.js';export const value=read();export const box=new Box();export const deferred=()=>read();`
					barrel := `export {read,Box} from './helper.js';`
					if route == "star" {
						barrel = `export * from './helper.js';`
					}
					if route == "local" {
						barrel = `import {read,Box} from './helper.js';export {read,Box};`
					}
					files["barrel.ts"], files["barrel.js"] = barrel, barrel
					edges = []ExecutableEdge{{"entry.ts", 0, "./barrel.js", "import", "barrel.js"}, {"barrel.js", 0, "./helper.js", "import", "helper.js"}}
				}
				f := newExecutableFixture(t, files)
				if r := f.synchronize(edges); r.Error != "" {
					t.Fatal(r.Error)
				}
				r := f.session.Execute(f.request("analyze", "entry.ts"))
				if r.Error != "" || len(r.Diagnostics) != 0 {
					t.Fatalf("%s %#v", r.Error, r.Diagnostics)
				}
				for _, export := range r.Analysis.Exports {
					expected := want
					if export.Name == "deferred" {
						expected = "isomorphic"
					}
					if export.Placement != expected {
						t.Fatalf("%s placement %s want %s", export.Name, export.Placement, expected)
					}
				}
				// An opaque execution edge cannot inherit placement from a typed body.
				edges[0].Selected = ""
				if r := f.synchronize(edges); r.Error != "" {
					t.Fatal(r.Error)
				}
				r = f.session.Execute(f.request("analyze", "entry.ts"))
				for _, export := range r.Analysis.Exports {
					if export.Name == "value" && export.Placement != "unknown" {
						t.Fatalf("opaque value: %#v", export)
					}
				}
			})
		}
	}
}

// Local binding stability cannot prove an exported CJS slot, or choose among
// multiple executable declarations. Uncertainty must never become finite authority.
func TestExecutableSelectionCommonJSAuthority(t *testing.T) {
	for name, body := range map[string]string{
		"shadowed-wrapper":           `function module(){}function apply(s){s.a=1;}module.exports={apply};`,
		"renamed":                    `function apply(s){s.a=1;}function other(s){s.b=2;}module.exports={apply:other};`,
		"indexed-export":             `function apply(s){s.b=2;}module["exports"]={apply};`,
		"deferred-shorthand-wrapper": `function apply(s){const access={module};access.module.exports.apply=other;s.a=1;}function other(s){s.b=2;}module.exports={apply};`,
		"cache-property":             `function apply(s){s.a=1;}function other(s){s.b=2;}module.exports={apply};require.cache[__filename].exports.apply=other;`,
		"cache-whole":                `function apply(s){s.a=1;}function other(s){s.b=2;}module.exports={apply};require.cache[__filename].exports={apply:other};`,
		"cache-indexed":              `function apply(s){s.a=1;}function other(s){s.b=2;}module.exports={apply};require.cache[__filename]["exports"].apply=other;`,
		"cache-alias":                `function apply(s){s.a=1;}function other(s){s.b=2;}module.exports={apply};const current=require.cache[__filename];current.exports.apply=other;`,
		"cache-read":                 `function apply(s){s.b=2;}module.exports={apply};const current=require.cache[__filename].exports;`,
		"opaque-call":                `function apply(s){s.b=2;}module.exports={apply};opaque();`,
		"imported-call":              `function apply(s){s.b=2;}module.exports={apply};require('./mutator.cjs')();`,
		"deferred-wrapper":           `function apply(s){module.exports.apply=other;s.a=1;}function other(s){s.b=2;}module.exports={apply};`,
		"deferred-loader":            `function apply(s){require('./mutator.cjs')();s.b=2;}module.exports={apply};`,
		"stable-chain":               `function write(s){s.b=2;}function apply(s){write(s);}module.exports={apply};`,
		"stable":                     `function apply(s){s.b=2;}module.exports={apply};`,
		"replace":                    `function apply(s){s.a=1;}function other(s){s.b=2;}module.exports={apply};module.exports={apply:other};`,
		"property":                   `function apply(s){s.a=1;}module.exports={apply};module.exports.apply=function(s){s.b=2;};`,
		"conditional":                `function apply(s){s.a=1;}function other(s){s.b=2;}module.exports={apply};if(true)module.exports={apply:other};`,
		"alias":                      `function apply(s){s.a=1;}function other(s){s.b=2;}const obj={apply};module.exports=obj;obj.apply=other;`,
		"duplicate":                  `function apply(s){s.a=1;}function apply(s){s.b=2;}module.exports={apply};`,
		"spread":                     `function apply(s){s.a=1;}function other(s){s.b=2;}const obj={apply:other};module.exports={apply,...obj};`,
	} {
		t.Run(name, func(t *testing.T) {
			f := newExecutableFixture(t, map[string]string{
				"entry.ts":   `import {TaskContext,type Component} from '@exactjs/core';import {apply} from './helper.cjs';export function run(s:{a:number,b:number}){apply(s);}export function Page(this:Component<{a:number,b:number}>){this.state.a=0;this.state.b=0;function save(task:TaskContext=TaskContext.server().blocking()){run(this.state);}save();return()=>this.state.b;}`,
				"helper.cts": `export function apply(s:{a:number,b:number}){s.a=0;}`, "helper.cjs": body,
			})
			if r := f.synchronize([]ExecutableEdge{{"entry.ts", 1, "./helper.cjs", "import", "helper.cjs"}}); r.Error != "" {
				t.Fatal(r.Error)
			}
			r := f.session.Execute(f.request("analyze", "entry.ts"))
			summary := executableSummary(t, r, "run")
			if name == "stable" || name == "stable-chain" {
				assertExecutablePaths(t, r, "run", "b")
			} else {
				if summary.Effect != "unknown" || len(summary.StateWrites) != 0 {
					t.Fatalf("false authority: %#v", summary)
				}
				for _, continuation := range r.Analysis.Continuations {
					if len(continuation.Effects.StateWrites) != 0 {
						t.Fatalf("false continuation authority: %#v", continuation.Effects)
					}
				}
			}
			if len(r.Diagnostics) != 0 {
				t.Fatalf("valid source rejected: %#v", r.Diagnostics)
			}
		})
	}
	// Overload declarations are type contracts. One implementation still owns execution.
	f := newExecutableFixture(t, map[string]string{"entry.ts": `import {apply} from './helper.js';export function run(s:{a:number,b:number}){apply(s);}export function Page(){const state={a:0,b:0};run(state);return ()=>state.b}`, "helper.ts": `export function apply(s:{a:number,b:number}){s.a=0;}`, "selected.ts": `export function apply(s:{a:number,b:number}):void;export function apply(s:{a:number,b:number}){s.b=2;}`})
	if r := f.synchronize([]ExecutableEdge{{"entry.ts", 0, "./helper.js", "import", "selected.ts"}}); r.Error != "" {
		t.Fatal(r.Error)
	}
	assertExecutablePaths(t, f.session.Execute(f.request("analyze", "entry.ts")), "run", "b")
}

// Synchronization may add analysis roots, but must preserve authored JS checking policy.
func TestExecutableSelectionJavaScriptDiagnostics(t *testing.T) {
	for _, ext := range []string{"js", "mjs", "cjs"} {
		for _, mode := range []string{"unchecked", "checked", "nocheck"} {
			t.Run(ext+"/"+mode, func(t *testing.T) {
				file := "entry." + ext
				source := `export function identity(value){return value;}`
				if ext == "cjs" {
					source = `exports.identity=function(value){return value;};`
				}
				if mode == "nocheck" {
					source = "// @ts-nocheck\n" + source
				}
				f := newExecutableFixture(t, map[string]string{file: source, "augment.ts": `export {};declare global {var executionOnly:number;}`})
				checked := "false"
				if mode == "checked" {
					checked = "true"
				}
				config := `{"compilerOptions":{"strict":true,"allowJs":true,"checkJs":` + checked + `,"module":"ESNext","moduleResolution":"Bundler","target":"ES2022","skipLibCheck":true},"files":["` + file + `"]}`
				if err := os.WriteFile(filepath.Join(f.root, "tsconfig.json"), []byte(config), 0600); err != nil {
					t.Fatal(err)
				}
				before := f.session.Execute(f.request("analyze", file))
				request := f.request("synchronize", file)
				for name, source := range f.files {
					request.Sources = append(request.Sources, ProjectSource{ID: filepath.Join(f.root, name), Source: source})
				}
				if r := f.session.Execute(request); r.Error != "" {
					t.Fatal(r.Error)
				}
				for i := 0; i < 2; i++ {
					after := f.session.Execute(f.request("analyze", file))
					want := mode == "checked"
					if hasDiagnosticCode(before.Diagnostics, "TS7006") != want || hasDiagnosticCode(after.Diagnostics, "TS7006") != want || len(before.Diagnostics) != len(after.Diagnostics) {
						t.Fatalf("checking policy changed before=%#v after=%#v", before.Diagnostics, after.Diagnostics)
					}
				}
			})
		}
	}
}

// Parameter-bound getter execution follows the actual helper body. Constructing
// the argument alone does not read a getter, and an opaque callee proves neither case.
func TestExecutableSelectionAccessorArguments(t *testing.T) {
	for _, reads := range []bool{false, true} {
		t.Run(map[bool]string{false: "neutral", true: "browser"}[reads], func(t *testing.T) {
			typed, selected := `return input.value;`, `return "host";`
			want := "neutral"
			if reads {
				typed, selected = selected, typed
				want = "browser"
			}
			f := newExecutableFixture(t, map[string]string{
				"entry.ts":  `import {read} from './helper.js';export function run(){return read({get value(){return document.title;}});}export function Page(){return ()=>run()}`,
				"helper.ts": `export function read(input:{value:string}){` + typed + `}`,
				"helper.js": `export function read(input){` + selected + `}`,
			})
			edge := ExecutableEdge{"entry.ts", 0, "./helper.js", "import", "helper.js"}
			if r := f.synchronize([]ExecutableEdge{edge}); r.Error != "" {
				t.Fatal(r.Error)
			}
			summary := executableSummary(t, f.session.Execute(f.request("analyze", "entry.ts")), "run")
			if summary.Effect != want {
				t.Fatalf("%s want %s", summary.Effect, want)
			}
			edge.Selected = ""
			if r := f.synchronize([]ExecutableEdge{edge}); r.Error != "" {
				t.Fatal(r.Error)
			}
			summary = executableSummary(t, f.session.Execute(f.request("analyze", "entry.ts")), "run")
			if summary.Effect != "unknown" {
				t.Fatalf("opaque accessor: %#v", summary)
			}
		})
	}
}

// Returned accessor provenance belongs to the selected factory, including the
// absence of an accessor. Checker property declarations cannot add a stale getter.
func TestExecutableSelectionReturnedAccessors(t *testing.T) {
	for _, browser := range []bool{false, true} {
		t.Run(map[bool]string{false: "neutral", true: "browser"}[browser], func(t *testing.T) {
			typed, selected := `return document.title;`, `return "host";`
			want := "neutral"
			if browser {
				typed, selected = selected, typed
				want = "browser"
			}
			f := newExecutableFixture(t, map[string]string{
				"entry.ts":  `import {make} from './helper.js';export function run(){return make().value;}export function Page(){return ()=>run()}`,
				"helper.ts": `export function make(){return {get value(){` + typed + `}}}`,
				"helper.js": `export function make(){return {get value(){` + selected + `}}}`,
			})
			edge := ExecutableEdge{"entry.ts", 0, "./helper.js", "import", "helper.js"}
			if r := f.synchronize([]ExecutableEdge{edge}); r.Error != "" {
				t.Fatal(r.Error)
			}
			summary := executableSummary(t, f.session.Execute(f.request("analyze", "entry.ts")), "run")
			if summary.Effect != want {
				t.Fatalf("%s want %s", summary.Effect, want)
			}
			if !browser {
				f.files["helper.js"] = `export function make(){return {value:"plain"}}`
				if r := f.synchronize([]ExecutableEdge{edge}); r.Error != "" {
					t.Fatal(r.Error)
				}
				summary = executableSummary(t, f.session.Execute(f.request("analyze", "entry.ts")), "run")
				if summary.Effect != "neutral" {
					t.Fatalf("stale typed getter: %#v", summary)
				}
			}
		})
	}
}

// An eager member read executes its getter. Construction and deferred reads do not.
// Selected and ordinary sources share the accessor owner and argument-substitution limits.
func TestExecutableSelectionEagerAccessors(t *testing.T) {
	for _, selected := range []bool{false, true} {
		for _, test := range []struct{ name, entry, typed, runtime, want string }{
			{"captured", `make({get value(){return document.title;}}).value`, `export function make(input:{value:string}){return {value:"typed"}}`, `export function make(input){return {get value(){return input.value}}}`, "client"},
			{"captured-reverse", `make({get value(){return document.title;}}).value`, `export function make(input:{value:string}){return {get value(){return input.value}}}`, `export function make(input){return {value:"host"}}`, "isomorphic"},
			{"captured-alias", `make({get value(){return document.title;}}).value`, `export function make(input:{value:string}){return {value:"typed"}}`, `export function make(input){const alias=input;return {get value(){return alias.value}}}`, "client"},
			{"returned", `make().value`, `export function make(){return {get value(){return "typed";}}}`, `export function make(){return {get value(){return document.title;}}}`, "client"},
			{"returned-reverse", `make().value`, `export function make(){return {get value(){return document.title;}}}`, `export function make(){return {get value(){return "host";}}}`, "isomorphic"},
			{"spread", `({...make()}).value`, `export function make(){return {value:"typed"}}`, `export function make(){return {get value(){return document.title;}}}`, "client"},
			{"values", `Object.values(make())`, `export function make(){return {value:"typed"}}`, `export function make(){return {get value(){return document.title;}}}`, "client"},
			{"keys", `Object.keys(make())`, `export function make(){return {value:"typed"}}`, `export function make(){return {get value(){return document.title;}}}`, "isomorphic"},
			{"argument-spread", `read({get value(){return document.title;}})`, `export function read(input:{value:string}){return "typed";}`, `export function read(input){return {...input}.value;}`, "client"},
			{"indexed", `make()["value"]`, `export function make(){return {value:"typed"}}`, `export function make(){return {get value(){return document.title;}}}`, "client"},
			{"plain", `make().value`, `export function make(){return {get value(){return document.title;}}}`, `export function make(){return {value:"host"}}`, "isomorphic"},
			{"argument", `read({get value(){return document.title;}})`, `export function read(input:{value:string}){return "typed";}`, `export function read(input){return input.value;}`, "client"},
			{"argument-ignored", `read({get value(){return document.title;}})`, `export function read(input:{value:string}){return input.value;}`, `export function read(input){return "host";}`, "isomorphic"},
			{"mixed-invocations", `read({value:"plain"})+read({get value(){return document.title;}})`, `export function read(input:{value:string}){return "typed";}`, `export function read(input){return input.value;}`, "client"},
			{"constructed", `make()`, `export function make(){return {value:"typed"}}`, `export function make(){return {get value(){return document.title;}}}`, "isomorphic"},
			{"deferred", `()=>make().value`, `export function make(){return {value:"typed"}}`, `export function make(){return {get value(){return document.title;}}}`, "isomorphic"},
		} {
			t.Run(test.name+map[bool]string{false: "/ordinary", true: "/selected"}[selected], func(t *testing.T) {
				var entry string
				// Use direct named slots so both ordinary and selected cases exercise supported provenance.
				name := "make"
				if strings.Contains(test.entry, "read(") {
					name = "read"
				}
				entry = `import {` + name + `} from './helper.js';export const value=` + test.entry + `;`
				if !selected {
					entry = strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(test.runtime, "export ", ""), "read(input)", "read(input:{value:string})"), "make(input)", "make(input:{value:string})") + `export const value=` + test.entry + `;`
				}
				f := newExecutableFixture(t, map[string]string{"entry.ts": entry, "helper.ts": test.typed, "helper.js": test.runtime})
				if selected {
					if r := f.synchronize([]ExecutableEdge{{"entry.ts", 0, "./helper.js", "import", "helper.js"}}); r.Error != "" {
						t.Fatal(r.Error)
					}
				}
				check := func(want string) {
					r := f.session.Execute(f.request("analyze", "entry.ts"))
					if r.Error != "" {
						t.Fatal(r.Error)
					}
					for _, export := range r.Analysis.Exports {
						if export.Name == "value" {
							if export.Placement != want {
								t.Fatalf("placement %s want %s", export.Placement, want)
							}
							return
						}
					}
					t.Fatal("missing value export")
				}
				check(test.want)
				if selected && test.name == "returned" {
					if r := f.synchronize([]ExecutableEdge{{"entry.ts", 0, "./helper.js", "import", ""}}); r.Error != "" {
						t.Fatal(r.Error)
					}
					check("unknown")
				}
			})
		}
	}
}

// Binding operations and omitted argument defaults are eager consumers too.
func TestModuleDefinitionAccessorEvaluation(t *testing.T) {
	for _, test := range []struct{ name, source, want string }{
		{"direct", `export const value=({get value(){return document.title}}).value;`, "client"},
		{"owner", `export const value={get value(){return document.title}};`, "isomorphic"},
		{"assignment", `export const value=({get x(){return document.title},set x(value:string){}}).x="ok";`, "isomorphic"},
		{"delete", `export const value=delete ({get x(){return document.title}} as {x?:string}).x;`, "isomorphic"},
		{"destructure", `const {value}=({get value(){return document.title}});export {value};`, "client"},
		{"static", `class Holder{static get value(){return "safe"}get value(){return document.title}}export const value=Holder.value;`, "isomorphic"},
		{"instance", `class Holder{static get value(){return "safe"}get value(){return document.title}}export const value=new Holder().value;`, "client"},
		{"default", `function read(input:{value:string}={get value(){return document.title}}){return input.value}export const value=read();`, "client"},
		{"default-overridden", `function read(input:{value:string}={get value(){return document.title}}){return input.value}export const value=read({value:"safe"});`, "isomorphic"},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "analyze", ID: "eager-accessor.ts", Source: test.source})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("%s %#v", response.Error, response.Diagnostics)
			}
			for _, export := range response.Analysis.Exports {
				if export.Name == "value" {
					if export.Placement != test.want {
						t.Fatalf("placement %s want %s", export.Placement, test.want)
					}
					return
				}
			}
			t.Fatal("missing value")
		})
	}
}
