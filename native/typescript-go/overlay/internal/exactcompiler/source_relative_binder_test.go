package exactcompiler

import (
	"strings"
	"testing"
)

// These source controls distinguish invocation from passing or storing a value.
// They bind actuals at the use edge, never specialize the reusable definition.
func TestRelativeBinderInvocationEffects(t *testing.T) {
	for _, row := range []struct {
		name, setup, body string
		browser           bool
	}{
		{"missing-default", `function invoke(read=browser){return read()}`, `return invoke()`, true},
		{"undefined-default", `function invoke(read=browser){return read()}`, `return invoke(undefined)`, true},
		{"supplied-bypasses-default", `function invoke(read=browser){return read()}`, `return invoke(safe)`, false},
		{"rest-first", `function invoke(...reads:(()=>string)[]){return reads[0]()}`, `return invoke(browser,safe)`, true},
		{"rest-second", `function invoke(...reads:(()=>string)[]){return reads[1]()}`, `return invoke(browser,safe)`, false},
		{"stored-not-invoked", `function store(read:()=>string){return {read}}`, `store(browser);return 'safe'`, false},
		{"passed-not-invoked", `function ignore(read:()=>string){return 'safe'}`, `return ignore(browser)`, false},
		{"method-receiver", `const box={read:browser,invoke(){return this.read()}}`, `return box.invoke()`, true},
		{"call-receiver", `function invoke(this:{read:()=>string}){return this.read()}`, `return invoke.call({read:browser})`, true},
		{"apply-receiver", `function invoke(this:{read:()=>string}){return this.read()}`, `return invoke.apply({read:browser},[])`, true},
		{"arrow-lexical-receiver", `const box={read:browser,make(){return ()=>this.read()}}`, `const saved=box.make();return saved.call({read:safe})`, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `function browser(){return document.title}function safe(){return 'safe'}` + row.setup + `;export function work(){` + row.body + `}`
			r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/relative-binder-" + row.name + ".ts", Source: source, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			summary := findCallable(t, r.Analysis.Callables, "work")
			browser := false
			for _, effect := range summary.EffectSources {
				browser = browser || effect.Environment == "browser"
			}
			if browser != row.browser {
				t.Fatalf("browser=%v want %v: %+v", browser, row.browser, summary.EffectSources)
			}
		})
	}
}

// Emitted behavior protects evaluation order and receiver ownership independently
// of the analysis facts. A supplied callback remains dormant until selected.
func TestRelativeBinderEmittedOrder(t *testing.T) {
	const source = `export function run(){const events:string[]=[];const callback=(name:string)=>()=>{events.push(name);return name};function invoke(first=callback('default'),...rest:(()=>string)[]){return [first(),rest[1]()]};const box={name:'lexical',make(){return ()=>this.name}};const saved=box.make();const result=invoke(undefined,callback('dormant'),callback('selected'));return {result,receiver:saved.call({name:'dynamic'}),events}}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/relative-binder-order.ts", Source: source, Target: target, Diagnostics: "semantic", PreserveOrdinaryModules: true})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			sourceNodeScript(t, r.Code, `const fs=require('node:fs'),vm=require('node:vm'),out={};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:out});const actual=JSON.stringify(out.run());const expected=JSON.stringify({result:['default','selected'],receiver:'lexical',events:['default','selected']});if(actual!==expected)throw Error(actual);`)
		})
	}
}

// Unknown supplied callbacks may be undefined and activate the default. That
// uncertainty must not erase the default donor or become required producer work.
func TestRelativeBinderUnknownDefault(t *testing.T) {
	const source = `function browser(){return document.title}function invoke(read=browser){return read()}export function work(foreign:()=>string){return invoke(foreign)}`
	r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/relative-unknown-default.ts", Source: source, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	summary := findCallable(t, r.Analysis.Callables, "work")
	browser, unknown := false, false
	for _, effect := range summary.EffectSources {
		browser = browser || effect.Environment == "browser"
		unknown = unknown || effect.Environment == "unknown"
	}
	if !browser || !unknown {
		t.Fatalf("unknown default lost independent donor: %+v", summary.EffectSources)
	}
}

// A browser callback selected by a default constrains server task policy.
// A supplied quiet callback bypasses that default and leaves its sibling dormant.
func TestComponentDefaultCallbackPolicyAndDormancy(t *testing.T) {
	const source = `import {TaskContext,type Component} from '@exactjs/core';
function browser(){return document.title;}
function dormant(){return window.name;}
function safe(){return 'quiet';}
export function Page(this:Component<{label:string}>,props:{read?:()=>string}){
 this.state.label='';
 function invoke(read:()=>string=browser,unused:()=>string=dormant){return read();}
 const run=(task:TaskContext=TaskContext.server())=>{this.state.label=invoke(props.read,dormant);};
 return()=> <button onClick={()=>run()}>{this.state.label}</button>;
}`
	for _, row := range []struct {
		name, source string
		refused      bool
	}{
		{"server-default", source, true},
		{"server-provided-quiet", strings.Replace(source, "invoke(props.read,dormant)", "invoke(safe,dormant)", 1), false},
	} {
		if !t.Run(row.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "component-default-input.tsx", Source: row.source, Target: TargetClient, Diagnostics: "semantic"})
			assertComponentCallbackPolicy(t, r, row.refused)
		}) {
			return
		}
	}
}

// Ordinary rest inputs keep callback position distinct from task activation
// inputs: only the selected callback may constrain server task policy.
func TestComponentRestCallbackPolicy(t *testing.T) {
	const source = `import {TaskContext,type Component} from '@exactjs/core';
function browser(){return document.title;}
function safe(){return 'quiet';}
export function Page(this:Component<{label:string}>){
 this.state.label='';
 function invoke(...reads:(()=>string)[]){return reads[0]();}
 const run=(task:TaskContext=TaskContext.server())=>{this.state.label=invoke(browser,safe);};
 return()=> <button onClick={()=>run()}>{this.state.label}</button>;
}`
	for _, row := range []struct {
		name, source string
		refused      bool
	}{
		{"first-browser", source, true},
		{"second-quiet", strings.Replace(source, "reads[0]()", "reads[1]()", 1), false},
	} {
		if !t.Run(row.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "component-rest-input.tsx", Source: row.source, Target: TargetClient, Diagnostics: "semantic"})
			assertComponentCallbackPolicy(t, r, row.refused)
		}) {
			return
		}
	}
}

// assertComponentCallbackPolicy checks the shared server-task policy and state/render consumer.
func assertComponentCallbackPolicy(t *testing.T, r Response, refused bool) {
	t.Helper()
	if refused {
		browserRefusal := false
		for _, d := range r.Diagnostics {
			browserRefusal = browserRefusal || d.Code == "EXACT2001" && strings.Contains(d.Message, "browser-only globals")
		}
		if r.Error != "" || !browserRefusal || r.Code != "" || r.SourceMap != nil {
			t.Fatalf("selected browser callback escaped server policy: %s %#v", r.Error, r.Diagnostics)
		}
		return
	}
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
		t.Fatalf("quiet callback or dormant sibling prevented emission: %s %#v", r.Error, r.Diagnostics)
	}
	found := false
	for _, task := range r.Analysis.Tasks {
		if !task.FunctionDefined || task.CompilerComputation || task.CompilerSetup {
			continue
		}
		for _, write := range task.Writes {
			if write.Path != "label" {
				continue
			}
			if task.Placement != "server" || task.BrowserEffects {
				t.Fatalf("quiet task lost server path: %#v", task)
			}
			found = true
		}
	}
	render := false
	for _, read := range r.Analysis.StateReads {
		render = render || len(read.Path) == 1 && read.Path[0] == "label"
	}
	if !found || !render {
		t.Fatalf("missing task/state/render consumer: tasks=%#v reads=%#v", r.Analysis.Tasks, r.Analysis.StateReads)
	}
}

// Acquiring and passing the same foreign callback does not invoke it. Only the
// selected first input can make automatic task placement depend on an opaque call.
func TestComponentDefaultCallbackUncertainty(t *testing.T) {
	const source = `import {TaskContext,type Component} from '@exactjs/core';
function safe(){return 'quiet';}
export function Page(this:Component<{label:string}>,props:{read?:()=>string}){
 this.state.label='';
 function invoke(read:()=>string=safe,unused?:()=>string){return read();}
 const call=invoke;
 const supplied=props.read;
 const run=(task:TaskContext=TaskContext.latest())=>{this.state.label=call(supplied,supplied);};
 run();
 return()=> <button onClick={()=>run()}>{this.state.label}</button>;
}`
	for _, row := range []struct {
		name, source string
		refused      bool
	}{
		{"foreign-invoked", source, true},
		{"foreign-dormant", strings.Replace(source, "call(supplied,supplied)", "call(undefined,supplied)", 1), false},
	} {
		if !t.Run(row.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "component-foreign-default.tsx", Source: row.source, Target: TargetClient, Diagnostics: "semantic"})
			if row.refused {
				opaqueRefusal := false
				for _, d := range r.Diagnostics {
					opaqueRefusal = opaqueRefusal || d.Code == "EXACT2001" && strings.Contains(d.Message, "task placement depends on an opaque call")
				}
				if r.Error != "" || !opaqueRefusal || r.Code != "" || r.SourceMap != nil {
					t.Fatalf("foreign invoked input lost opaque placement refusal: %s %#v", r.Error, r.Diagnostics)
				}
				return
			}
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatalf("dormant foreign input prevented emission: %s %#v", r.Error, r.Diagnostics)
			}
			found := false
			for _, task := range r.Analysis.Tasks {
				if !task.FunctionDefined || task.CompilerComputation || task.CompilerSetup {
					continue
				}
				for _, write := range task.Writes {
					if write.Path != "label" {
						continue
					}
					if task.RequestedPlacement != "" || task.Placement == "unknown" {
						t.Fatalf("quiet default lost automatic placement: %#v", task)
					}
					found = true
				}
			}
			render := false
			for _, read := range r.Analysis.StateReads {
				render = render || len(read.Path) == 1 && read.Path[0] == "label"
			}
			if !found || !render {
				t.Fatalf("missing task/state/render consumer: tasks=%#v reads=%#v", r.Analysis.Tasks, r.Analysis.StateReads)
			}
		}) {
			return
		}
	}
}

// Capturing a module input with an unexposed function cannot mutate its value
// before a component later reads the bound result.
func TestComponentUsesBoundModuleInput(t *testing.T) {
	root, config := formsSourceFixture(t)
	for _, source := range []string{
		"function read(this:{value:string}){return this.value};const base={value:'safe'};const bound=read.bind(base);",
		"const read=(v:{value:string})=>v.value;let base={value:'safe'};const bound=read.bind(null,base);base={get value(){return document.title}};",
	} {
		source = "import type {Component} from '@exactjs/core';" + source + "const value=bound(); export function Page(this:Component<{}>){return()=> <p>{value}</p>}"
		for _, target := range []Target{TargetClient, TargetServer} {
			result := formsCompileSource(t, root, config, source, target)
			if result.Code == "" || hasErrorDiagnostic(result.Diagnostics) {
				t.Fatalf("%s bound module input: %s %#v", target, result.Error, result.Diagnostics)
			}
		}
	}
}

// The rendered module initializer observes a factory return and its executed
// nested call. The forwarded read must keep the initializer's actual input.
func TestComponentUsesForwardedModuleInput(t *testing.T) {
	root, config := formsSourceFixture(t)
	for _, row := range []struct {
		name, input string
		browser     bool
	}{
		{"direct-data", `{value:'safe'}`, false},
		{"portable-getter", `{get value(){return 'safe'}}`, false},
		{"browser-getter", `{get value(){return document.title}}`, true},
		{"conditional-getter", `Math.random() ? {value:'safe'} : {get value(){return document.title}}`, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `import type {Component} from '@exactjs/core';
function make(input:{value:string}) {
  function read(v:{value:string}) {return v.value;}
  function forward(v:{value:string}) {return read(v);}
  forward(input);
  return {get label(){return 'retained'}};
}
export const label=make(` + row.input + `).label;
export function Page(this:Component<{}>){return()=> <p>{label}</p>}`
			for _, target := range []Target{TargetClient, TargetServer} {
				result := formsCompileSource(t, root, config, source, target)
				if result.Code == "" || hasErrorDiagnostic(result.Diagnostics) {
					t.Fatalf("%s forwarded module input: %s %#v", target, result.Error, result.Diagnostics)
				}
				placement := "isomorphic"
				if row.browser {
					placement = "client"
				}
				components := result.Analysis.Components
				if len(components) != 1 || components[0].Placement != placement {
					t.Fatalf("%s expected %s placement: %#v", target, placement, components)
				}
				local := !row.browser || target == TargetClient
				if strings.Contains(result.Code, "export const label = make(") != local || strings.Contains(result.Code, "document.title") != (row.browser && local) {
					t.Fatalf("%s selected the wrong initializer: %s", target, result.Code)
				}
			}
		})
	}
}
