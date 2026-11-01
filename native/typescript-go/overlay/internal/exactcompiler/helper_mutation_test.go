package exactcompiler

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// Source witnesses distinguish execution eligibility from possible-effect resolution.
// Compiler-output runtime tests independently protect identity and HTTP publication.
func TestOwnedScalarHelperEntries(t *testing.T) {
	cases := []struct {
		name, helper, body string
		owned              bool
	}{
		{"declaration", `function apply(state:{value:number}){state.value=2;return state;}`, `apply(this.state);`, true},
		{"async", `async function apply(state:{value:number}){await Promise.resolve();state.value=2;return state;}`, `await apply(this.state);`, true},
		{"awaited value", `async function apply(state:{value:number}){state.value=await Promise.resolve(2);return state;}`, `await apply(this.state);`, true},
		{"inferred default", `function apply(state:{value:number},value=state.value){state.value=value+1;return value;}`, `apply(this.state);`, true},
		{"default", `function apply(state:{value:number},value=(state.value=2)){return state;}`, `apply(this.state);`, true},
		{"arrow arguments field", `const apply=(state:{value:number})=>{const input={arguments:2};state.value=input.arguments;};`, `apply(this.state);`, true},
		{"arrow module meta", `const apply=(state:{value:number})=>{void import.meta;state.value=2;};`, `apply(this.state);`, true},
		{"const arrow", `const apply=(state:{value:number})=>{state.value=2;return state;};`, `apply(this.state);`, true},
		{"finite transitive", `function leaf(state:{value:number}){state.value=2;}function apply(state:{value:number}){leaf(state);return state;}`, `apply(this.state);`, true},
		{"recursive", `function apply(state:{value:number},count=1):void{if(count)apply(state,count-1);else state.value=2;}`, `apply(this.state);`, true},
		{"function expression", `const apply=function(state:{value:number}){state.value=2;};`, `apply(this.state);`, true},
		{"named expression", `const apply=function original(state:{value:number}){state.value=2;return original;};`, `apply(this.state);`, false},
		{"arrow lexical this", `const apply=(state:{value:number})=>{void this;state.value=2;};`, `apply(this.state);`, false},
		{"optional call", `function apply(state:{value:number}){state.value=2;}`, `apply?.(this.state);`, false},
		{"pure", `function apply(state:{value:number}){return state.value;}`, `apply(this.state);`, false},
		{"mutable", `let apply=(state:{value:number})=>{state.value=2;};`, `apply(this.state);`, false},
		{"reassigned mutable binding", `let apply=(state:{value:number})=>{state.value=2;};apply=(state:{value:number})=>{state.value=3;};`, `apply(this.state);`, false},
		{"call selected", `function apply(state:{value:number}){state.value=2;}`, `apply.call(undefined,this.state);`, false},
		{"apply selected", `function apply(state:{value:number}){state.value=2;}`, `apply.apply(undefined,[this.state]);`, false},
		{"nested owner", `function apply(state:{value:number}){const inner=()=>{state.value=2;};inner();}`, `apply(this.state);`, false},
		{"selected array push", `function apply(state:{value:number;values:number[]}){state.values.push(2);}`, `apply(this.state);`, true},
		{"selected array parameter push", `function apply(state:number[]){state.push(2);}`, `apply(this.state.values);`, true},
	}
	for _, candidate := range cases {
		for _, lean := range []bool{false, true} {
			t.Run(candidate.name+"/lean="+map[bool]string{false: "false", true: "true"}[lean], func(t *testing.T) {
				render := `return()=> <button onClick={()=>save()}>save</button>;`
				if lean {
					render = `save();return()=>this.state.value;`
				}
				source := `import {TaskContext,type Component} from '@exactjs/core';` + candidate.helper + `export function Page(this:Component<{value:number;values:number[]}>){this.state.value=0;this.state.values=[];async function save(task:TaskContext=TaskContext.server().blocking()){` + candidate.body + `}` + render + `}`
				response := NewSession().Execute(Request{Kind: "compile", ID: "owned-scalar.tsx", Target: TargetServer, Diagnostics: "semantic", Source: source})
				assertReactiveCompilation(t, response, source)
				routed := strings.Contains(response.Code, "void 0, [") && strings.Contains(response.Code, "__exact_owned_")
				if routed != candidate.owned {
					t.Fatalf("owned route=%v want %v: %s", routed, candidate.owned, response.Code)
				}
				if strings.HasPrefix(candidate.name, "selected array") && !strings.Contains(response.Code, "__exactTaskMutation(") {
					t.Fatalf("native array entry omitted its required publication capability: %s", response.Code)
				}
			})
		}
	}
}

// Native resolution chooses TypeScript substitution even when an adjacent JS file exists.
func TestOwnedScalarHelperResolvedSource(t *testing.T) {
	root := t.TempDir()
	for name, source := range map[string]string{"helper.ts": `export function apply(state:{value:number}){state.value=2;}`, "helper.js": `export function apply(state){state.value=99;}`} {
		if err := os.WriteFile(filepath.Join(root, name), []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	source := `import {apply} from './helper.js';export function invoke(state:{value:number}){apply(state);}`
	response := NewSession().Execute(Request{Kind: "compile", Target: TargetServer, ID: filepath.Join(root, "page.ts"), Root: root, Source: source})
	assertReactiveCompilation(t, response, source)
	if !strings.Contains(response.Code, "import { __exact_owned_") {
		t.Fatalf("missing static entry import: %s", response.Code)
	}
	if len(response.Analysis.HelperSources) != 1 || response.Analysis.HelperSources[0].SourceFile != filepath.ToSlash(filepath.Join(root, "helper.ts")) {
		t.Fatalf("lost authoritative source: %#v", response.Analysis.HelperSources)
	}
	if len(response.Analysis.Imports) != 1 || response.Analysis.Imports[0].ResolvedFile != filepath.ToSlash(filepath.Join(root, "helper.ts")) {
		t.Fatalf("lost ordinary source: %#v", response.Analysis.Imports)
	}
}

// Equal-width binding edits must invalidate executable eligibility even when effects are unchanged.
func TestOwnedScalarHelperIncrementalSelection(t *testing.T) {
	session := NewSession()
	source := `import {TaskContext,type Component} from '@exactjs/core';const apply=(state:{value:number})=>{state.value=2;};export function Page(this:Component<{value:number}>){this.state.value=0;function save(task:TaskContext=TaskContext.server().blocking()){apply(this.state);}return()=> <button onClick={()=>save()}>save</button>;}`
	for _, immutable := range []bool{true, false, true} {
		current := source
		if !immutable {
			current = strings.Replace(current, "const apply", "let   apply", 1)
		}
		response := session.Execute(Request{Kind: "compile", ID: "owned-incremental.tsx", Target: TargetServer, Source: current})
		assertReactiveCompilation(t, response, current)
		if strings.Contains(response.Code, "void 0, [") != immutable {
			t.Fatalf("stale eligibility immutable=%v: %s", immutable, response.Code)
		}
	}
}

// Unknown parameter keys never gain executable entry authority from possible effects alone.
func TestOwnedScalarHelperFiniteEligibility(t *testing.T) {
	response := NewSession().Execute(Request{Kind: "compile", Target: TargetServer, ID: "owned-dynamic.ts", Source: `export function apply(state:Record<string,number>,key:string){state[key]=2;}`})
	if response.Error != "" || strings.Contains(response.Code, "__exact_owned_") {
		t.Fatalf("nonfinite helper gained entry: %#v", response)
	}
	source := `import {TaskContext,type Component} from '@exactjs/core';function apply(state:Record<string,number>,key:string){state[key]=2;}export function Page(this:Component<{values:Record<string,number>}>){this.state.values={};function save(key:string,task:TaskContext=TaskContext.server()){apply(this.state.values,key);}return()=> <button onClick={()=>save('x')}>save</button>;}`
	response = NewSession().Execute(Request{Kind: "compile", Target: TargetServer, ID: "owned-dynamic.tsx", Source: source})
	rejected := false
	for _, diagnostic := range response.Diagnostics {
		rejected = rejected || diagnostic.Code == "EXACT2001"
	}
	if !rejected || response.Error != "" {
		t.Fatalf("lost nonfinite remote rejection: %#v", response)
	}
}

// Adding an entry export must never turn an ordinary global script into a strict module.
func TestOwnedScalarHelperScriptControl(t *testing.T) {
	source := `function apply(state:{value:number}){state.value=2;}`
	response := NewSession().Execute(Request{Kind: "compile", Target: TargetServer, ID: "ordinary-script.ts", Source: source})
	assertReactiveCompilation(t, response, source)
	if strings.Contains(response.Code, "export") || strings.Contains(response.Code, "__exact_owned_") {
		t.Fatalf("changed script ownership: %s", response.Code)
	}
}

// Local classes have their own invocation and definition environments. This scalar
// entry proof must leave their ordinary implementation intact rather than capture a parent frame.
func TestOwnedScalarHelperNestedClassControls(t *testing.T) {
	for _, body := range []string{
		`class Assign{constructor(){state.value=2;}}new Assign();`,
		`class Assign{value=(state.value=2);}new Assign();`,
		`const Assign=class{static value=(state.value=2);};void Assign;`,
	} {
		source := `export function apply(state:{value:number}){` + body + `}`
		response := NewSession().Execute(Request{Kind: "compile", Target: TargetServer, Diagnostics: "semantic", ID: "owned-class.ts", Source: source})
		assertReactiveCompilation(t, response, source)
		if strings.Contains(response.Code, "__exact_owned_") {
			t.Fatalf("nested class gained a parent-owned entry: %s", response.Code)
		}
	}
}

// Generated invocation and signal types must not borrow authored bindings.
func TestOwnedScalarHelperIntrinsicBindings(t *testing.T) {
	for _, declaration := range []string{
		`const Reflect={apply(...args:unknown[]){void args;throw new Error('capture');}};`,
		`type AbortSignal={authored:boolean};`,
		`type Reflect={authored:boolean};`,
	} {
		source := declaration + `export function apply(state:{value:number}){state.value=2;}`
		response := NewSession().Execute(Request{Kind: "compile", Target: TargetServer, Diagnostics: "semantic", ID: "owned-intrinsics.ts", Source: source})
		assertReactiveCompilation(t, response, source)
		if !strings.Contains(response.Code, "__exact_owned_") {
			t.Fatalf("lost finite owned entry: %s", response.Code)
		}
		if strings.HasPrefix(declaration, "const Reflect") && !strings.Contains(response.Code, "globalThis.Reflect.apply") {
			t.Fatalf("authored capture intercepted intrinsic: %s", response.Code)
		}
	}
}

// Private imports retain the resolved ESM runtime suffix instead of guessing a JS sibling.
func TestOwnedScalarHelperModuleSuffixes(t *testing.T) {
	for _, extension := range []string{"mts", "mjs"} {
		root := t.TempDir()
		helper := `export function apply(state:{value:number}){state.value=2;}`
		if extension == "mjs" {
			helper = `/** @param {{value:number}} state */ export function apply(state){state.value=2;}`
		}
		if err := os.WriteFile(filepath.Join(root, "helper."+extension), []byte(helper), 0600); err != nil {
			t.Fatal(err)
		}
		source := `import {apply} from './helper.mjs';export function invoke(state:{value:number}){apply(state);}`
		response := NewSession().Execute(Request{Kind: "compile", Target: TargetServer, ID: filepath.Join(root, "page.mts"), Root: root, Source: source})
		assertReactiveCompilation(t, response, source)
		if len(response.Analysis.HelperSources) != 1 || response.Analysis.HelperSources[0].ModuleSpecifier != "./helper.mjs" {
			t.Fatalf("lost resolved ESM suffix: %#v", response.Analysis.HelperSources)
		}
	}
}

// Imported companions must be checked against real producer bodies at their original module
// identity. Authored export and readonly errors remain errors in both validation generations.
func TestOwnedImportedHelpersSemanticValidation(t *testing.T) {
	root := t.TempDir()
	// Match ordinary module resolution without writing fixtures into the staged native source tree.
	directory, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		modules := filepath.Join(directory, "node_modules")
		if _, err := os.Stat(filepath.Join(modules, "@exactjs", "core", "package.json")); err == nil {
			if err := os.Symlink(modules, filepath.Join(root, "node_modules")); err != nil {
				t.Fatal(err)
			}
			break
		}
		parent := filepath.Dir(directory)
		if parent == directory {
			t.Fatal("workspace runtime declarations unavailable")
		}
		directory = parent
	}
	leaf := filepath.Join(root, "leaf.tsx")
	middle := filepath.Join(root, "middle.ts")
	page := filepath.Join(root, "page.ts")
	config := filepath.Join(root, "tsconfig.json")
	if err := os.WriteFile(config, []byte(`{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler","jsx":"preserve","jsxImportSource":"@exactjs/jsx","strict":true,"skipLibCheck":true},"include":["*.ts","*.tsx"]}`), 0600); err != nil {
		t.Fatal(err)
	}
	session := NewSession()
	cases := []struct {
		name, leaf, middle, page string
		invalid                  bool
	}{
		{"direct", `export function apply(state:{value:number}){state.value+=1;return state;}`, `export {};`, `import {apply} from './leaf.js';export function run(state:{value:number}){return apply(state);}`, false},
		{"jsx", `export function apply(state:{value:number}){state.value+=1;return <span>{state.value}</span>;}`, `export {};`, `import {apply} from './leaf.js';export function run(state:{value:number}){return apply(state);}`, false},
		{"transitive", `export function apply(state:{value:number}){state.value+=2;return state;}`, `import {apply} from './leaf.js';export function forward(state:{value:number}){return apply(state);}`, `import {forward} from './middle.js';export function run(state:{value:number}){return forward(state);}`, false},
		{"finite cycle", `import {back} from './middle.js';export function apply(state:{value:number},n:number):void{if(n)back(state,n-1);else state.value+=1;}`, `import {apply} from './leaf.js';export function back(state:{value:number},n:number):void{apply(state,n);}`, `import {apply} from './leaf.js';export function run(state:{value:number}){apply(state,2);}`, false},
		{"changed producer", `export function apply(state:{value:number}){state.value+=3;return state;}`, `export {};`, `import {apply} from './leaf.js';export function run(state:{value:number}){return apply(state);}`, false},
		{"ineligible mutable", `export let apply=(state:{value:number})=>{state.value+=4;return state;};`, `export {};`, `import {apply} from './leaf.js';export function run(state:{value:number}){return apply(state);}`, false},
		{"removed export", `export const other=1;`, `export {};`, `import {apply} from './leaf.js';export function run(state:{value:number}){return apply(state);}`, true},
		{"relocated nominal", `export class Brand{private value=1;}export function apply(state:{value:number},brand:Brand){state.value+=1;return brand;}`, `import type{Brand}from'./leaf.js';export type Holder={brand:Brand};`, `import {apply,type Brand}from'./leaf.js';import type{Holder}from'./middle.js';export function run(state:{value:number},holder:Holder):Brand{return apply(state,holder.brand);}`, false},
		{"relocated default", `export default function apply(state:{value:number}){state.value+=1;return state;}`, `export {};`, `import apply from'./leaf.js';export function run(state:{value:number}){return apply(state);}`, false},
		{"relocated type-only", `export function apply(state:{value:number}){state.value+=1;return state;}`, `export type Holder={value:number};`, `import {apply}from'./leaf.js';import type{Holder}from'./middle.js';export function run(state:Holder){return apply(state);}`, false},
		{"relocated unresolved source", `export function apply(state:{value:number}){state.value+=1;return state;}`, `export type Holder={value:number};`, `import {apply}from'./leaf.js';import type{Holder}from'./absent.js';export function run(state:Holder){return apply(state);}`, true},
		{"relocated unowned target", `export function apply(state:{value:number}){state.value+=1;return state;}`, `export type Holder={value:number};`, `import {apply}from'./leaf.js';import type{Holder}from'./middle.js';export function run(state:Holder){return apply(state);}`, true},
		{"readonly", `export function apply(state:{readonly value:number}){state.value+=1;return state;}`, `export {};`, `import {apply} from './leaf.js';export function run(state:{value:number}){return apply(state);}`, true},
	}
	for _, candidate := range cases {
		for _, target := range []Target{TargetServer, TargetClient} {
			t.Run(candidate.name+"/"+string(target), func(t *testing.T) {
				sources := []ProjectSource{{ID: middle, Source: candidate.middle}, {ID: page, Source: candidate.page}}
				sources = append(sources, ProjectSource{ID: leaf, Source: candidate.leaf})
				for _, source := range sources {
					if err := os.WriteFile(source.ID, []byte(source.Source), 0600); err != nil {
						t.Fatal(err)
					}
				}
				sync := Request{Kind: "synchronize", Root: root, ConfigFile: config, Sources: sources}
				fresh := NewSession()
				for _, current := range []*Session{session, fresh} {
					response := current.Execute(sync)
					if response.Error != "" {
						t.Fatal(response.Error)
					}
				}
				request := Request{Kind: "compile", ID: page, Root: root, ConfigFile: config, Source: candidate.page, Target: target, Diagnostics: "semantic"}
				if strings.HasPrefix(candidate.name, "relocated ") {
					request.ModuleRewrite = &ModuleRewrite{ModuleAliases: map[string]string{"./leaf.js": "./unpublished/leaf.exact.js"}}
					if candidate.name == "relocated type-only" {
						request.ModuleRewrite.ModuleAliases["./middle.js"] = "./missing-middle.js"
					}
					if candidate.name == "relocated unresolved source" {
						request.ModuleRewrite.ModuleAliases["./absent.js"] = "./missing-middle.js"
					}
					if candidate.name == "relocated unowned target" {
						request.ModuleRewrite.ModuleAliases["./middle.js"] = "unowned-middle"
					}
				}
				if candidate.name == "readonly" {
					request.ID = leaf
					request.Source = candidate.leaf
				}
				retained, want := session.Execute(request), fresh.Execute(request)
				if retained.Error != "" || want.Error != "" {
					t.Fatalf("%s / %s", retained.Error, want.Error)
				}
				if !reflect.DeepEqual(retained.Diagnostics, want.Diagnostics) || retained.Code != want.Code {
					t.Fatalf("retained/fresh diverged: %+v / %+v", retained.Diagnostics, want.Diagnostics)
				}
				if hasErrorDiagnostic(retained.Diagnostics) != candidate.invalid {
					t.Fatalf("invalid=%v diagnostics=%+v", candidate.invalid, retained.Diagnostics)
				}
				if !candidate.invalid && target == TargetServer && candidate.name != "ineligible mutable" && !strings.Contains(retained.Code, "import { __exact_owned_") {
					t.Fatal("eligible imported helper lost its runtime companion")
				}
				if candidate.name == "relocated type-only" {
					if len(retained.Diagnostics) != 0 {
						t.Fatalf("resolved type-only source lost its checking identity: %+v", retained.Diagnostics)
					}
					// Checking can use prepared sources before their output paths are published.
					for _, filename := range []string{"unpublished/leaf.exact.js", "missing-middle.js"} {
						if _, err := os.Stat(filepath.Join(root, filename)); !os.IsNotExist(err) {
							t.Fatalf("semantic checking published %s: %v", filename, err)
						}
					}
				}
				if candidate.name == "relocated unresolved source" || candidate.name == "relocated unowned target" {
					if len(retained.Diagnostics) == 0 {
						t.Fatal("unresolved source or unowned target lost its module error")
					}
					for _, diagnostic := range retained.Diagnostics {
						if diagnostic.Code != "TS2307" || diagnostic.Severity != "error" {
							t.Fatalf("unexpected module diagnostic: %+v", retained.Diagnostics)
						}
					}
				}
				if candidate.name == "removed export" {
					if len(retained.Diagnostics) != 1 || retained.Diagnostics[0].Code != "TS2305" || strings.Contains(retained.Code, "import { __exact_owned_") {
						t.Fatalf("removed export gained a ghost companion: %+v\n%s", retained.Diagnostics, retained.Code)
					}
				}
				if candidate.name == "ineligible mutable" && strings.Contains(retained.Code, "__exact_owned_") {
					t.Fatal("ineligible producer gained a companion")
				}
			})
		}
	}

	// An installed unselected overlay is authoritative even after its physical source disappears.
	// Reset is the explicit certificate that discards that authority before fresh-session comparison.
	for _, physical := range []bool{true, false} {
		for _, target := range []Target{TargetServer, TargetClient} {
			t.Run("omission and reset/"+map[bool]string{true: "physical", false: "virtual"}[physical]+"/"+string(target), func(t *testing.T) {
				current := NewSession()
				execute := func(owner *Session, request Request) Response {
					response := owner.Execute(request)
					raw, err := json.Marshal(struct {
						Request  Request  `json:"request"`
						Response Response `json:"response"`
					}{request, response})
					if err != nil {
						t.Fatal(err)
					}
					t.Logf("actual overlay lifetime boundary: %s", raw)
					return response
				}
				producer := `export function apply(state:{value:number}){state.value+=7;return state;}`
				consumer := `import {apply} from './leaf.js';export function run(state:{value:number}){return apply(state);}`
				if err := os.WriteFile(page, []byte(consumer), 0600); err != nil {
					t.Fatal(err)
				}
				if physical {
					if err := os.WriteFile(leaf, []byte(producer), 0600); err != nil {
						t.Fatal(err)
					}
				} else if err := os.Remove(leaf); err != nil && !os.IsNotExist(err) {
					t.Fatal(err)
				}
				prepared := Request{Kind: "synchronize", Root: root, ConfigFile: config, Sources: []ProjectSource{{ID: page, Source: consumer}, {ID: leaf, Source: producer}}}
				if response := execute(current, prepared); response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
					t.Fatalf("initial sync: %+v", response)
				}
				request := Request{Kind: "compile", ID: page, Root: root, ConfigFile: config, Source: consumer, Target: target, Diagnostics: "semantic"}
				accepted := execute(current, request)
				if accepted.Error != "" || hasErrorDiagnostic(accepted.Diagnostics) {
					t.Fatalf("installed overlay rejected: %+v", accepted)
				}
				if physical {
					if err := os.Remove(leaf); err != nil {
						t.Fatal(err)
					}
				}
				prepared.Sources = prepared.Sources[:1]
				if response := execute(current, prepared); response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
					t.Fatalf("omission sync: %+v", response)
				}
				retained := execute(current, request)
				if retained.Error != "" || !reflect.DeepEqual(retained.Diagnostics, accepted.Diagnostics) || retained.Code != accepted.Code {
					t.Fatalf("omission discarded installed authority: %+v", retained)
				}
				if target == TargetServer && !strings.Contains(retained.Code, "import { __exact_owned_") {
					t.Fatal("installed virtual helper lost its companion")
				}
				if response := execute(current, Request{Kind: "reset"}); response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
					t.Fatalf("reset failed: %+v", response)
				}
				fresh := NewSession()
				for _, owner := range []*Session{current, fresh} {
					if response := execute(owner, prepared); response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
						t.Fatalf("resync failed: %+v", response)
					}
				}
				reset, expected := execute(current, request), execute(fresh, request)
				if reset.Error != "" || expected.Error != "" || !reflect.DeepEqual(reset.Diagnostics, expected.Diagnostics) || reset.Code != expected.Code {
					t.Fatalf("reset/fresh inputs diverged: %+v / %+v", reset, expected)
				}
				if len(reset.Diagnostics) != 1 || reset.Diagnostics[0].Code != "TS2307" {
					t.Fatalf("deleted module diagnostic changed: %+v", reset.Diagnostics)
				}
				if strings.Contains(reset.Code, "__exact_owned_") {
					t.Fatal("reset retained a ghost companion")
				}
			})
		}
	}
}

// Rebinding stays local while property writes select their receiver before the RHS.
func TestOwnedScalarHelperParameterRebinding(t *testing.T) {
	for _, candidate := range []struct{ name, body, id string }{
		{"before and after", `state.value+=1;state=next;state.value+=2;return state.value;`, "helper-rebinding.ts"},
		{"acquired receiver", `return state.value=(state=next,7);`, "helper-rebinding.ts"},
		{"plain", `state=next;state.value=3;return state.value;`, "independent-binding.ts"},
		{"as wrapper", `(state as {value:number})=next;state.value=3;return state.value;`, "independent-binding.ts"},
		{"non-null wrapper", `(state!)=next;state.value=3;return state.value;`, "independent-binding.ts"},
		{"satisfies wrapper", `(state satisfies {value:number})=next;state.value=3;return state.value;`, "independent-binding.ts"},
	} {
		t.Run(candidate.name, func(t *testing.T) {
			source := `export function apply(state:{value:number},next:{value:number}){` + candidate.body + `}`
			response := NewSession().Execute(Request{Kind: "compile", ID: candidate.id, Target: TargetServer, Diagnostics: "semantic", Source: source})
			assertReactiveCompilation(t, response, source)
			if !strings.Contains(response.Code, "export function __exact_owned_") {
				t.Fatalf("parameter rebinding excluded the helper companion: %s", response.Code)
			}
			if strings.Contains(response.Code, "this.state") {
				t.Fatalf("parameter rebinding introduced a component receiver: %s", response.Code)
			}
		})
	}
}
