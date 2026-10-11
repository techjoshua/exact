package exactcompiler

import (
	"fmt"
	"strings"
	"testing"
)

// Remaining source controls distinguish unsupported ownership and placement from
// valid generic captures, function syntax, aliases and duplicate initializers.
func TestTaskSubsystemRemainingSourceControls(t *testing.T) {
	for _, c := range []struct{ name, source, diagnostic string }{
		{"mutated-const-helper-property", `import{TaskContext,type Component}from'@exactjs/core';const helper=Object.assign(()=>2,{label:0});export function Page(this:Component<{value:number}>){this.state.value=0;const selected=helper;selected.label=1;const run=(task:TaskContext=TaskContext.client().blocking())=>{this.state.value=selected();};return()=> <button onClick={()=>run()}>{this.state.value}</button>;}`, ""},
		{"retained-render-helper-overloads", `import{TaskContext,type Component}from'@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;function read(value:number):number;function read(value:string):number;function read(value:number|string){return Number(value);}const run=(task:TaskContext=TaskContext.client().blocking())=>{this.state.value=2;};return()=> <button onClick={()=>run()}>{read(this.state.value)}</button>;}`, ""},
		{"generic-helper-props", `import {TaskContext,type Component} from '@exactjs/core';export function Page<T extends number>(this:Component<{value:T}>,props:{input:T}){this.state.value=props.input;const read=()=>props.input;const run=(task:TaskContext=TaskContext.server().blocking())=>{this.state.value=read();};run();return()=> <button onClick={()=>run()}>{this.state.value}</button>;}`, ""},
		{"generic-helper-value", `import {TaskContext,type Component} from '@exactjs/core';export function Page<T extends number>(this:Component<{value:T}>,props:{input:T}){this.state.value=props.input;const value=props.input;const read=()=>value;const run=(task:TaskContext=TaskContext.server().blocking())=>{this.state.value=read();};run();return()=> <button onClick={()=>run()}>{this.state.value}</button>;}`, ""},
		{"local-type-helper", `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;class Options{offset=2;}const settings=new Options();const read=()=>settings.offset;const run=(task:TaskContext=TaskContext.client().blocking())=>{this.state.value=read();};run();return()=> <button onClick={()=>run()}>{this.state.value}</button>;}`, ""},
		{"array-hole-alias", `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;const work=(task:TaskContext=TaskContext.client())=>{this.state.value=2;};const[,run]=[null,work] as const;run();return()=> <button onClick={()=>run()}>{this.state.value}</button>;}`, ""},
		{"inline-resource-return", `import {TaskContext,type Component} from '@exactjs/core';class Resource{value=1;dispose(){}}export function Page(){function run(task:TaskContext=TaskContext.client()){const resource=new Resource();const value=(()=>resource)();void value.value;}run();return()=> <output/>;}`, ""},
		{"dynamic-resource-context", `import {TaskContext,type Component} from '@exactjs/core';class Resource{dispose(){}}export function Page(){function run(task:TaskContext=TaskContext.client()){const resource=new Resource();const key:'cleanup'='cleanup';task[key](()=>resource.dispose());}run();return()=> <output/>;}`, "EXACT2001"},
		{"wrapped-setup-call", `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;function run(){this.state.value++;}((run()));return()=> <output>{this.state.value}</output>;}`, ""},
		{"function-expression", `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;const run=function(task:TaskContext=TaskContext.client().blocking()){this.state.value=2;};run();return()=> <button onClick={()=>run()}>{this.state.value}</button>;}`, ""},
		{"progress-arrow", `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;const report=(value:number,task:TaskContext=TaskContext.client().progress())=>{this.state.value=value;};report(1);return()=> <button onClick={()=>report(2)}>{this.state.value}</button>;}`, "EXACT2001"},
		{"same-default", `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=1;this.state.value=1;return()=> <output>{this.state.value}</output>;}`, ""},
		{"changed-default", `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=1;this.state.value=2;return()=> <output>{this.state.value}</output>;}`, ""},
		{"local-Object", `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;const Object={assign(owner:{value:number},source:{value:number}){owner.value=source.value;}};const run=(task:TaskContext=TaskContext.client().blocking())=>{Object.assign(this.state,{value:2});};run();return()=> <button onClick={()=>run()}>{this.state.value}</button>;}`, ""},
		{"Object-ordinary-owner", `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;const run=(task:TaskContext=TaskContext.client().blocking())=>{const owner={value:0};Object.assign(owner,{value:2});this.state.value=owner.value;};run();return()=> <button onClick={()=>run()}>{this.state.value}</button>;}`, ""},
		{"optimistic-repeat", `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;const run=(task:TaskContext=TaskContext.server())=>{const local=1;task.optimistic(()=>{this.state.value=local+local;});};return()=> <button onClick={()=>run()}>{this.state.value}</button>;}`, "EXACT2001"},
		{"optimistic-unknown", `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;const run=(task:TaskContext=TaskContext.server())=>{task.optimistic(()=>{this.state.value=missing;});};return()=> <button onClick={()=>run()}>{this.state.value}</button>;}`, "TS2304"},
		{"dynamic-opaque", `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>,props:{read:()=>number}){this.state.value=0;const run=(task:TaskContext=TaskContext.latest())=>{this.state.value=props.read();};run();return()=> <output>{this.state.value}</output>;}`, "EXACT2001"},
		{"dynamic-opaque-browser", `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>,props:{read:()=>number}){this.state.value=0;const run=(task:TaskContext=TaskContext.latest())=>{this.state.value=props.read();document.title='title';};run();return()=> <output>{this.state.value}</output>;}`, ""},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(fmt.Sprintf("%s/%s", c.name, target), func(t *testing.T) {
				r := NewSession().Execute(Request{Kind: "compile", Target: target, Diagnostics: "semantic", ID: "remaining-task-sources.tsx", Source: c.source})
				if r.Error != "" || (c.diagnostic == "" && (len(r.Diagnostics) != 0 || r.Code == "")) || (c.diagnostic != "" && (!hasDiagnosticCode(r.Diagnostics, c.diagnostic) || (strings.HasPrefix(c.diagnostic, "EXACT") && r.Code != ""))) {
					t.Fatalf("source control changed: %s %#v", r.Error, r.Diagnostics)
				}
			})
		}
	}
}

// Stateless components still receive a typed generated owner when task helpers
// introduce instance capabilities into the server projection.
func TestTaskSubsystemRuntimeHelperSources(t *testing.T) {
	for _, module := range []string{"@exactjs/core"} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(fmt.Sprintf("%s/%s", module, target), func(t *testing.T) {
				r := NewSession().Execute(Request{Kind: "compile", Target: target, Diagnostics: "semantic", ID: "imported-task-timeout.tsx", Source: `import {TaskContext} from '@exactjs/core';import{taskTimeout}from'` + module + `';export function Page(){async function run(task:TaskContext=TaskContext.server().blocking()){await new Promise<void>(resolve=>taskTimeout(task.signal,resolve,1));}run();return()=> <output/>;}`})
				if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
					t.Fatalf("runtime helper import rejected: %s %#v", r.Error, r.Diagnostics)
				}
			})
		}
	}
}

// A compiler temporary resembling an authored identifier cannot capture that
// identifier. Calculate the actual source position instead of constructing ASTs.
func TestTaskSubsystemSuspensionNameCollision(t *testing.T) {
	prefix := `import{TaskContext,type Component}from'@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;async function run(task:TaskContext=TaskContext.client().blocking()){const COLLISION=1;void COLLISION;`
	suffix := `({value:this.state.value}=await Promise.resolve({value:2}));}run();return()=> <button onClick={()=>run()}>{this.state.value}</button>;}`
	name := "__exactDestructured_0_rhs"
	for {
		source := strings.ReplaceAll(prefix, "COLLISION", name) + suffix
		next := fmt.Sprintf("__exactDestructured_%d_rhs", strings.Index(source, "{value:this.state.value}"))
		if next == name {
			for _, target := range []Target{TargetClient, TargetServer} {
				r := NewSession().Execute(Request{Kind: "compile", Target: target, Diagnostics: "semantic", ID: "task-temporary-collision.tsx", Source: source})
				if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
					t.Fatalf("suspension captured authored identifier: %s %#v", r.Error, r.Diagnostics)
				}
			}
			return
		}
		name = next
	}
}

// Generated task ownership must not introduce an implicit receiver requirement
// into stateless authored declarations or values.
func TestTaskSubsystemStatelessOwners(t *testing.T) {
	for _, definition := range []string{"export function Page(){BODY}", "export const Page=()=>{BODY}", "export const Page=function(){BODY}", "export async function Page(){BODY}"} {
		for _, placement := range []string{"client", "server"} {
			for _, target := range []Target{TargetClient, TargetServer} {
				body := `async function run(task:TaskContext=TaskContext.` + placement + `().blocking()){await new Promise<void>(resolve=>taskTimeout(task.signal,resolve,1));}run();return()=> <output/>;`
				source := `import{TaskContext,taskTimeout}from'@exactjs/core';` + strings.Replace(definition, "BODY", body, 1)
				r := NewSession().Execute(Request{Kind: "compile", ID: "stateless-task-owner.tsx", Source: source, Target: target, Diagnostics: "semantic"})
				if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
					t.Fatalf("stateless %s/%s/%s: %s %#v", definition, placement, target, r.Error, r.Diagnostics)
				}
			}
		}
	}
}

// A TaskContext parameter belongs to task invocation, while an ordinary signal
// options parameter remains eligible for automatic cancellation injection.
func TestTaskSubsystemNestedPolicySignals(t *testing.T) {
	for _, definition := range []string{
		`async function report(value:number,task:TaskContext=TaskContext.client().progress()){this.state.value=value;}`,
		`const report=async(value:number,task:TaskContext=TaskContext.client().progress())=>{this.state.value=value;};`,
		`async function report(value:number,task:TaskContext=TaskContext.server()){this.state.value=value;}`,
		`const report=async(value:number,task:TaskContext=TaskContext.client())=>{this.state.value=value;};`,
		`function report(value:number):Promise<void>;async function report(value:number,task:TaskContext=TaskContext.client().progress()){this.state.value=value;}`,
	} {
		for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
			kind := "compile"
			if target == TargetDefault {
				kind = "check"
			}
			r := NewSession().Execute(Request{Kind: kind, ID: "nested-policy-signals.tsx", Target: target, Diagnostics: "semantic", Source: `import{TaskContext,type Component}from'@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;` + definition + `async function start(task:TaskContext=TaskContext.server()){await Promise.resolve();report(42);}return()=> <button onClick={()=>start()}>{this.state.value}</button>;}`})
			if r.Error != "" || len(r.Diagnostics) != 0 || (kind == "compile" && r.Code == "") {
				t.Fatalf("nested task signal %s %s: %s %#v", definition, target, r.Error, r.Diagnostics)
			}
			for _, task := range r.Analysis.Tasks {
				if len(task.SignalCalls) != 0 {
					t.Fatalf("task policy classified as cancellation options: %#v", task.SignalCalls)
				}
			}
		}
	}
}

// These source forms exercise the scalar and nested-container paths separately
// from pending helper-call work, which owns different mutation machinery.
func TestTaskSubsystemScalarFrontier(t *testing.T) {
	for _, body := range []string{
		`this.state.value+=await 1;`,
		`this.state.nested={value:2};this.state.nested.value=3;this.state.nested.value+=await 1;`,
		`this.state.nested={value:2};this.state.nested.value=3;this.state.value=this.state.nested.value++;`,
		`this.state.nested={value:2};this.state.nested.value=3;this.state.value=(this.state.nested.value+=2);`,
		`this.state.value=await 2;`,
		`let local=1;this.state.value=(local++&&this.state.value);`,
		`this.state.value=(this.state.value&&1);`,
		`const first=async()=>({value:this.state.value}=await {value:2});const second=async()=>({value:this.state.nested.value}=await {value:3});await first();await second();`,
		`let key:'value'='value';this.state.nested[key]+=await 1;`,
		`const values:number[]=[];for(let index=0;index<2;index++){values.push(this.state.value+=await 1);}this.state.value=values[1]!;`,
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			r := NewSession().Execute(Request{Kind: "compile", Target: target, Diagnostics: "semantic", ID: "scalar-task-frontier.tsx", Source: `import{TaskContext,type Component}from'@exactjs/core';export function Page(this:Component<{value:number;nested:{value:number}}>){this.state.value=0;this.state.nested={value:0};async function run(task:TaskContext=TaskContext.client().blocking()){` + body + `}run();return()=> <button onClick={()=>run()}>{this.state.value}:{this.state.nested.value}</button>;}`})
			if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
				t.Fatalf("scalar frontier %s %s: %s %#v", body, target, r.Error, r.Diagnostics)
			}
		}
	}
}

// Callable effects follow type-only wrappers by symbol, so state and environment
// contracts cannot disappear merely because a helper has an authored annotation.
func TestTaskSubsystemWrappedCallableEffects(t *testing.T) {
	for _, wrapper := range []string{"(%s) as (()=>number)", "(%s) satisfies (()=>number)", "(%s)!", "((%s))", "((%s) as (()=>number))!"} {
		for _, helper := range []string{"()=>owner.value+offset", "function read(){return owner.value+offset;}"} {
			for _, target := range []Target{TargetClient, TargetServer} {
				r := NewSession().Execute(Request{Kind: "compile", Target: target, Diagnostics: "semantic", ID: "wrapped-helper-effects.tsx", Source: `import{TaskContext,type Component}from'@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;const owner=this.state;const offset=2;const read=` + fmt.Sprintf(wrapper, helper) + `;const run=(task:TaskContext=TaskContext.server().blocking())=>{this.state.value=read();};run();return()=> <button onClick={()=>run()}>{this.state.value}</button>;}`})
				if r.Error != "" || len(r.Diagnostics) != 0 {
					t.Fatalf("wrapped callable %s/%s: %s %#v", wrapper, target, r.Error, r.Diagnostics)
				}
				for _, task := range r.Analysis.Tasks {
					found := false
					for _, read := range task.Reads {
						found = found || read.Path == "value"
					}
					if !found {
						t.Fatalf("wrapped callable lost state reads: %#v", task.Reads)
					}
				}
			}
		}
		for _, placement := range []string{"client", "server"} {
			for _, target := range []Target{TargetClient, TargetServer} {
				r := NewSession().Execute(Request{Kind: "compile", Target: target, Diagnostics: "semantic", ID: "wrapped-helper-placement.tsx", Source: `import{TaskContext,type Component}from'@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;const read=` + fmt.Sprintf(wrapper, `()=>{document.title='title';return 2;}`) + `;const run=(task:TaskContext=TaskContext.` + placement + `())=>{this.state.value=read();};run();return()=> <button onClick={()=>run()}>{this.state.value}</button>;}`})
				if placement == "server" {
					if !hasDiagnosticCode(r.Diagnostics, "EXACT2001") || r.Code != "" {
						t.Fatalf("wrapped browser effect escaped server placement: %#v", r.Diagnostics)
					}
				} else if r.Error != "" || len(r.Diagnostics) != 0 {
					t.Fatalf("wrapped browser control rejected: %s %#v", r.Error, r.Diagnostics)
				}
			}
		}
	}
}

// Definition annotations retain policy ownership rather than activating an
// ordinary unbranded function. Both setup and retained event calls use one task.
func TestTaskSubsystemWrappedPolicyDefinitions(t *testing.T) {
	for _, wrapper := range []string{"(%s)", "(%s) as ((task?:TaskContext)=>Promise<void>)", "(%s) satisfies ((task?:TaskContext)=>Promise<void>)", "(%s)!"} {
		for _, placement := range []string{"client", "server"} {
			for _, target := range []Target{TargetClient, TargetServer} {
				work := `async(task:TaskContext=TaskContext.` + placement + `().blocking())=>{await Promise.resolve();this.state.value++;}`
				r := NewSession().Execute(Request{Kind: "compile", ID: "wrapped-policy.tsx", Source: `import{TaskContext,type Component}from'@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;const run=` + fmt.Sprintf(wrapper, work) + `;run();return()=> <button onClick={()=>run()}>{this.state.value}</button>;}`, Target: target, Diagnostics: "semantic"})
				if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
					t.Fatalf("wrapped policy %s/%s/%s: %s %#v", wrapper, placement, target, r.Error, r.Diagnostics)
				}
			}
		}
	}
}

// Cleanup-created resources have native lifetime, including when the registered
// callback is reached through a typed alias rather than a direct arrow.
func TestTaskSubsystemWrappedCleanupPhases(t *testing.T) {
	for _, wrapper := range []string{"%s", "(%s)", "(%s) as (()=>void)", "(%s) satisfies (()=>void)", "(%s)!"} {
		for _, body := range []string{`const resource=acquire();resource.dispose();`, `void fetch('/next');`, `void fetch('/next',{signal:task.signal});`} {
			for _, target := range []Target{TargetClient, TargetServer} {
				r := NewSession().Execute(Request{Kind: "compile", ID: "wrapped-cleanup-phase.tsx", Source: `import{TaskContext}from'@exactjs/core';class Resource{dispose(){}}/** @exact cleanup=dispose */ function acquire(){return new Resource();}export function Page(){const run=(task:TaskContext=TaskContext.client().blocking())=>{const cleanup=` + fmt.Sprintf(wrapper, `()=>{`+body+`}`) + `;task.cleanup(cleanup);};run();return()=> <output/>;}`, Target: target, Diagnostics: "semantic"})
				found := false
				for _, d := range r.Diagnostics {
					found = found || strings.Contains(d.Message, "native lifetime after the producer closes")
				}
				if r.Error != "" || r.Code == "" || !found {
					t.Fatalf("cleanup phase warning lost %s/%s: %s %#v", wrapper, target, r.Error, r.Diagnostics)
				}
			}
		}
	}
}

// A named task's provisional TypeScript any receiver must not hide the owning
// component's known collection shape, including guarded nullish containers.
func TestTaskSubsystemNullableCollectionReceivers(t *testing.T) {
	for _, container := range []string{"{lookup:Map<string,number>;members:Set<number>;values:number[]}|undefined", "{lookup:Map<string,number>;members:Set<number>;values:number[]}|null"} {
		for _, body := range []string{`this.state.nested.lookup.set('a',1);`, `this.state.nested.members.add(1);`, `this.state.nested.values.push(1);`} {
			for _, placement := range []string{"client", "server"} {
				for _, target := range []Target{TargetClient, TargetServer} {
					r := NewSession().Execute(Request{Kind: "compile", Target: target, ID: "nullable-collection-owner.tsx", Diagnostics: "semantic", Source: `import{TaskContext,type Component}from'@exactjs/core';export function Page(this:Component<{nested:` + container + `}>){this.state.nested={lookup:new Map(),members:new Set(),values:[]};function run(task:TaskContext=TaskContext.` + placement + `().blocking()){if(this.state.nested){` + body + `}}run();return()=> <button onClick={()=>run()}>Run</button>;}`})
					if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
						t.Fatalf("nullable collection %s/%s: %s %#v", body, target, r.Error, r.Diagnostics)
					}
					for _, task := range r.Analysis.Tasks {
						if len(task.Writes) == 0 {
							t.Fatal("nullable collection lost state publication")
						}
					}
				}
			}
		}
	}
}

// Type erasure keeps conservative write effects without guessing a native
// collection implementation from the method spelling.
func TestTaskSubsystemErasedCollectionEffects(t *testing.T) {
	for _, body := range []string{`this.state.value.set('a',1);`, `this.state.value.delete('a');`, `this.state.value.clear();`, `this.state.value.add(1);`, `this.state.value.push(1);`} {
		for _, target := range []Target{TargetClient, TargetServer} {
			r := NewSession().Execute(Request{Kind: "analyze", ID: "erased-collection-owner.tsx", Target: target, Source: `import{TaskContext,type Component}from'@exactjs/core';export function Page(this:Component<{value:any}>){this.state.value=new Map();const run=(task:TaskContext=TaskContext.client().blocking())=>{` + body + `};run();return()=> <output/>;}`})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			for _, task := range r.Analysis.Tasks {
				if len(task.Writes) == 0 || task.Writes[0].Confidence != "broad" {
					t.Fatalf("erased collection inferred native authority or lost write: %#v", task.Writes)
				}
			}
		}
	}
}

// Server publication requires a proven collection kind. An erased receiver
// retains conservative client effects but cannot authorize a transport delta.
func TestTaskSubsystemErasedCollectionPublication(t *testing.T) {
	for _, body := range []string{`this.state.value.set('a',1);`, `this.state.value.delete('a');`, `this.state.value.clear();`, `this.state.value.add(1);`, `this.state.value.push(1);`} {
		for _, placement := range []string{"client", "server"} {
			for _, target := range []Target{TargetClient, TargetServer} {
				r := NewSession().Execute(Request{Kind: "compile", ID: "erased-collection-publication.tsx", Target: target, Diagnostics: "semantic", Source: `import{TaskContext,type Component}from'@exactjs/core';export function Page(this:Component<{value:any}>){this.state.value=new Map();const run=(task:TaskContext=TaskContext.` + placement + `().blocking())=>{` + body + `};return()=> <button onClick={()=>run()}/>;}`})
				found := false
				for _, d := range r.Diagnostics {
					found = found || d.Code == "EXACT2001" && strings.Contains(d.Message, "statically known Array, Map or Set")
				}
				if placement == "server" && !found || placement == "client" && (r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "") {
					t.Fatalf("erased collection boundary %s/%s/%s: %s %#v", body, placement, target, r.Error, r.Diagnostics)
				}
			}
		}
	}
}

// Signal injection preserves explicit selections as well as the task's own
// signal. These source expressions exercise direct-server equality choices.
func TestTaskSubsystemSelectedSignals(t *testing.T) {
	for _, signal := range []string{"task.signal", "new AbortController().signal", "selected", "alias.signal"} {
		for _, target := range []Target{TargetClient, TargetServer} {
			r := NewSession().Execute(Request{Kind: "compile", ID: "selected-task-signal.tsx", Target: target, Diagnostics: "semantic", Source: `import{TaskContext,taskTimeout}from'@exactjs/core';export function Page(){async function run(task:TaskContext=TaskContext.server().blocking()){const selected=new AbortController().signal;const alias=task;await new Promise<void>(resolve=>taskTimeout(` + signal + `,resolve,1));}run();return()=> <output/>;}`})
			if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
				t.Fatalf("signal %s/%s: %s %#v", signal, target, r.Error, r.Diagnostics)
			}
		}
	}
}

// Missing property types after an any container keep conservative ownership.
// They cannot manufacture a known native collection or a transport grant.
func TestTaskSubsystemErasedNestedReceiver(t *testing.T) {
	r := NewSession().Execute(Request{Kind: "compile", ID: "erased-nested-task.tsx", Target: TargetClient, Diagnostics: "semantic", Source: `import{TaskContext,type Component}from'@exactjs/core';export function Page(this:Component<{nested:any}>){this.state.nested={deep:{lookup:new Map()}};function run(task:TaskContext=TaskContext.client().blocking()){this.state.nested.deep.lookup.set('a',1);}run();return()=> <output/>;}`})
	if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
		t.Fatalf("erased nested receiver: %s %#v", r.Error, r.Diagnostics)
	}
	for _, task := range r.Analysis.Tasks {
		if len(task.Writes) == 0 || task.Writes[0].Confidence != "broad" {
			t.Fatalf("erased nested effect: %#v", task.Writes)
		}
	}
}

// Two locally replaced ancestor containers must compose before a suspended
// descendant write, without exposing either replacement before publication.
func TestTaskSubsystemAncestorLocalReadiness(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "ancestor-local-ready.tsx", Target: target, Diagnostics: "semantic", Source: `import{TaskContext,type Component}from'@exactjs/core';export function Page(this:Component<{nested:{deep:{count:number}};trace:string}>){this.state.nested={deep:{count:0}};this.state.trace='';async function run(task:TaskContext=TaskContext.client().blocking()){this.state.nested={deep:{count:1}};this.state.nested.deep={count:2};this.state.nested.deep.count+=await 1;this.state.trace=''+this.state.nested.deep.count;}run();return()=> <output>{this.state.trace}</output>;}`})
		if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
			t.Fatalf("ancestor readiness %s: %s %#v", target, r.Error, r.Diagnostics)
		}
	}
}

// Resource closures distinguish local invocation and retained aliases from
// values actually published beyond their generation.
func TestTaskSubsystemResourceEscapeFrontier(t *testing.T) {
	for _, c := range []struct {
		body   string
		escape bool
	}{
		{`const readers={read:()=>resource.value};const alias=readers.read;void alias;`, false},
		{`const read=()=>resource;void read;const value=read();void value.value;`, false},
		{`void (()=>resource)();`, false},
		{`void (function(){return resource;})();`, false},
		{`const selected=((()=>resource) as ()=>Resource)();void selected.value;`, false},
		{`const read=(()=>resource) satisfies ()=>Resource;const selected=(read as ()=>Resource)();void selected.value;`, false},
		{`publish(((()=>resource) satisfies ()=>Resource)());`, true},
		{`publish((()=>resource)());`, true},
		{`const selected=(()=>resource)();publish(selected);`, true},
		{`const read=()=>resource;publish(read);`, true},
		{`((new Resource())).dispose();`, false},
		{`(new Resource() as Resource)['dispose']();`, false},
		{`const selected=(new Resource()).value;void selected;`, false},
		{`(new Resource()).dispose?.();`, false},
		{`void (()=>{new Resource();})();`, false},
		{`publish(new Resource());`, true},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			r := NewSession().Execute(Request{Kind: "compile", ID: "resource-escape-frontier.tsx", Target: target, Diagnostics: "semantic", Source: `import{TaskContext}from'@exactjs/core';declare function publish(value:unknown):void;class Resource{value=1;dispose(){}}export function Page(){const run=(task:TaskContext=TaskContext.client())=>{const resource=new Resource();` + c.body + `};run();return()=> <output/>;}`})
			escaped := false
			for _, d := range r.Diagnostics {
				escaped = escaped || strings.Contains(d.Message, "escapes its task generation")
			}
			if escaped != c.escape || !c.escape && (r.Error != "" || r.Code == "") {
				t.Fatalf("resource frontier %s/%s: %s %#v", c.body, target, r.Error, r.Diagnostics)
			}
		}
	}
}

// Collection helper lowering cannot erase authored nullable safety checks.
func TestTaskSubsystemUnsafeNullableReceiver(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "unsafe-nullable-task.tsx", Target: target, Diagnostics: "semantic", Source: `import{TaskContext,type Component}from'@exactjs/core';export function Page(this:Component<{nested:{lookup:Map<string,number>}|undefined}>){this.state.nested=undefined;function run(task:TaskContext=TaskContext.server().blocking()){this.state.nested.lookup.set('a',1);}return()=> <button onClick={()=>run()}/>;}`})
		found := false
		for _, d := range r.Diagnostics {
			found = found || d.Code == "TS2532" || d.Code == "TS18048"
		}
		if !found {
			t.Fatalf("unsafe nullable mutation accepted %s: %s %#v", target, r.Error, r.Diagnostics)
		}
	}
}

// Receiver transport supplies a full subtree. A guarded descendant is not an
// unconditional presence requirement, and unrelated reads remain required.
func TestTaskSubsystemGuardedContinuationReadContracts(t *testing.T) {
	for _, body := range []string{`if(this.state.nested){this.state.result=this.state.nested.deep.value+this.state.other;}`, `this.state.result=(this.state.nested?.deep.value??0)+this.state.other;`, `if(this.state.nested){const key='value';this.state.result=this.state.nested.deep[key]+this.state.other;}`, `function read(value:{deep:{value:number}}|undefined){return value?.deep.value??0;}this.state.result=read(this.state.nested)+this.state.other;`} {
		for _, target := range []Target{TargetClient, TargetServer} {
			r := NewSession().Execute(Request{Kind: "compile", ID: "guarded-read-contract.tsx", Target: target, Diagnostics: "semantic", Source: `import{TaskContext,type Component}from'@exactjs/core';export function Page(this:Component<{nested:{deep:{value:number}}|undefined;result:number;other:number}>){this.state.nested=undefined;this.state.result=0;this.state.other=1;const run=(task:TaskContext=TaskContext.server().blocking())=>{` + body + `};return()=> <button onClick={()=>run()}/>;}`})
			if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
				t.Fatalf("guarded contract %s/%s: %s %#v", body, target, r.Error, r.Diagnostics)
			}
			if len(r.Analysis.Continuations) == 0 {
				t.Fatal("missing continuation")
			}
			for _, continuation := range r.Analysis.Continuations {
				paths := map[string]bool{}
				for _, read := range continuation.Activation.StateReads {
					if read.Confidence == "exact" {
						paths[read.Path] = true
					}
				}
				if !paths["nested"] || !paths["other"] || len(paths) != 2 {
					t.Fatalf("guarded input contract: %#v", paths)
				}
			}
		}
	}
}

// Unary reads are scheduling inputs, unlike ++ and -- write receivers.
func TestTaskSubsystemUnarySchedulingInputs(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "unary-task-reads.tsx", Target: target, Diagnostics: "semantic", Source: `import{TaskContext,type Component}from'@exactjs/core';export function Page(this:Component<{value:number;trace:string}>){this.state.value=0;this.state.trace='';const run=(task:TaskContext=TaskContext.client().blocking())=>{this.state.trace=''+(-this.state.value)+!this.state.value;};run();return()=> <output>{this.state.trace}</output>;}`})
		if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
			t.Fatalf("unary task source: %s %#v", r.Error, r.Diagnostics)
		}
		for _, task := range r.Analysis.Tasks {
			if len(task.Dependencies) != 1 || task.Dependencies[0].Path != "this.state.value" {
				t.Fatalf("unary read subscription lost: %#v", task.Dependencies)
			}
		}
	}
}

// Qualified local capture types retain authored checking without leaking a
// namespace-dependent annotation into a relocated executor signature.
func TestTaskSubsystemQualifiedCaptureTypes(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "qualified-task-captures.tsx", Target: target, Diagnostics: "semantic", Source: `import{TaskContext,type Component}from'@exactjs/core';namespace Models{export class Options{offset=1;}}export function Page(this:Component<{value:number}>){this.state.value=0;const options=new Models.Options();const read=()=>options.offset;function run(task:TaskContext=TaskContext.client().blocking()){this.state.value=read();}run();return()=> <output>{this.state.value}</output>;}`})
		if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
			t.Fatalf("qualified capture source %s: %s %#v", target, r.Error, r.Diagnostics)
		}
	}
}

// Releasable ownership needs the complete frame even when authored task context
// parameters destructure it. Context reconstruction must also avoid local names.
func TestTaskSubsystemDestructuredResourceContexts(t *testing.T) {
	for _, name := range []string{"{signal}", "{cleanup}", "{}"} {
		for _, collision := range []bool{false, true} {
			for _, placement := range []string{"client", "server"} {
				for _, target := range []Target{TargetClient, TargetServer} {
					body := `const resource=new Resource();resource.dispose?.();(new Resource()).dispose?.();`
					if collision {
						body = `const __exactTaskContext=1;void __exactTaskContext;` + body
					}
					r := NewSession().Execute(Request{Kind: "compile", ID: "destructured-resource-context.tsx", Target: target, Diagnostics: "semantic", Source: `import{TaskContext}from'@exactjs/core';class Resource{dispose(){}}export function Page(){function run(` + name + `:TaskContext=TaskContext.` + placement + `().blocking()){` + body + `}return()=> <button onClick={()=>run()}/>;}`})
					if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
						t.Fatalf("resource context %s/%t/%s/%s: %s %#v", name, collision, placement, target, r.Error, r.Diagnostics)
					}
				}
			}
		}
	}
}

// Ordinary nested constructor cleanup remains lexical, while destructured
// optimistic capabilities retain their task policy and publication ownership.
func TestTaskSubsystemFinalAdjacentControls(t *testing.T) {
	for _, body := range []string{`class Local{constructor(){using resource=new Resource();void resource;}}new Local();`, `optimistic(()=>{this.state.value++;});this.state.value++;`} {
		for _, target := range []Target{TargetClient, TargetServer} {
			name := "task"
			if strings.Contains(body, "optimistic(") {
				name = "{optimistic}"
			}
			r := NewSession().Execute(Request{Kind: "compile", ID: "task-final-adjacent.tsx", Target: target, Diagnostics: "semantic", Source: `/// <reference lib="esnext.disposable" />
import{TaskContext,type Component}from'@exactjs/core';declare global{interface SymbolConstructor{readonly dispose:unique symbol}}class Resource{[Symbol.dispose](){}}export function Page(this:Component<{value:number}>){this.state.value=0;function run(` + name + `:TaskContext=TaskContext.client().blocking()){` + body + `}run();return()=> <button onClick={()=>run()}>{this.state.value}</button>;}`})
			if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
				t.Fatalf("adjacent %s/%s: %s %#v", body, target, r.Error, r.Diagnostics)
			}
		}
	}
}

// Lean client lanes keep policy exclusions, callback contextual typing and
// reversed state-input ordering observable through authored programs.
func TestTaskSubsystemProjectionFrontier(t *testing.T) {
	for _, policy := range []string{"latest()", "parallel()", "latest().deferred()", "latest().blocking()"} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "task-lean-policy.tsx", Target: TargetClient, ComponentContractProjection: ComponentContractProjectionClient, Diagnostics: "semantic", Source: `import{TaskContext,type Component}from'@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;async function run(task:TaskContext=TaskContext.client().` + policy + `){this.state.value=await Promise.resolve(1).then(function(value){return value+1;});}return()=> <button onClick={()=>run()}>{this.state.value}</button>;}`})
		if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
			t.Fatalf("lean %s: %s %#v", policy, r.Error, r.Diagnostics)
		}
	}
	for _, separator := range []string{"", " ", "\n", "/* adjacent */"} {
		for _, target := range []Target{TargetClient, TargetServer} {
			r := NewSession().Execute(Request{Kind: "compile", ID: "task-input-order.tsx", Target: target, Diagnostics: "semantic", Source: `import{TaskContext,type Component}from'@exactjs/core';export function Page(this:Component<{z:number;a:number;result:number}>,props:{z:number;a:number}){this.state.z=props.z;` + separator + `this.state.a=props.a;this.state.result=0;function run(task:TaskContext=TaskContext.server().blocking()){this.state.result=this.state.z+this.state.a;}run();return()=> <button onClick={()=>run()}>{this.state.result}</button>;}`})
			if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
				t.Fatalf("ordered inputs %s: %s %#v", target, r.Error, r.Diagnostics)
			}
		}
	}
}

// Input defaults, renamed policies and native browser receivers exercise source
// producers before their later defensive checks.
func TestTaskSubsystemProducerFrontier(t *testing.T) {
	for _, body := range []string{`this.state.z??=props.z;this.state.a??=props.a;`, `let spare;void spare;this.state.z=0;this.state.a=0;`} {
		for _, target := range []Target{TargetClient, TargetServer} {
			r := NewSession().Execute(Request{Kind: "compile", ID: "task-source-producers.tsx", Target: target, Diagnostics: "semantic", Source: `import{TaskContext as Context,type Component}from'@exactjs/core';export function Page(this:Component<{z:number;a:number;result:number}>,props:{z:number;a:number}){` + body + `this.state.result=0;function run(task:Context=Context.server().blocking()){this.state.result=this.state.z+this.state.a;}run();return()=> <button onClick={()=>run()}/>;}`})
			if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
				t.Fatalf("producer %s/%s: %s %#v", body, target, r.Error, r.Diagnostics)
			}
		}
	}
	for _, receiver := range []string{"window", "self", "globalThis", "custom"} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "task-browser-receivers.tsx", Target: TargetClient, Diagnostics: "semantic", Source: `import{TaskContext}from'@exactjs/core';export function Page(){const custom={setTimeout(callback:()=>void,delay:number){callback();return delay;}};function run(task:TaskContext=TaskContext.client()){const handle=` + receiver + `.setTimeout(()=>{},1);void handle;}return()=> <button onClick={()=>run()}/>;}`})
		if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
			t.Fatalf("native receiver %s: %s %#v", receiver, r.Error, r.Diagnostics)
		}
	}
}

// Residual source candidates get real parser/checker witnesses rather than
// being classified as defensive based on their neighboring guard shapes.
func TestTaskSubsystemResidualSourceCandidates(t *testing.T) {
	for _, c := range []struct{ name, setup, body, context, placement string }{
		{"destructured-optimistic", "", `optimistic(()=>{this.state.value=1;});this.state.value=2;`, "{optimistic}", "server().latest"},
		{"ordinary-await-subscribe", "", `this.state.value=await subscribe();`, "task", "server"},
		{"state-map-helper-alias", `const owner=this.state.lookup;const read=()=>owner.get('a')??0;`, `this.state.value=read();`, "task", "server"},
		{"explicit-reactive-cell", `const cell=this.reactive(()=>this.state.value);`, `void cell.get();`, "task", "client"},
		{"mutable-helper-alias", `const read=()=>1;let selected=read;selected=()=>2;`, `this.state.value=selected();`, "task", "client"},
		{"whole-component-helper", `function read(owner:Component<{value:number;lookup:Map<string,number>}>){return owner.state.value;} `, `this.state.value=read(this);`, "task", "client"},
		{"whole-state-helper", `function read(owner:Component<{value:number;lookup:Map<string,number>}>){return owner.state;} `, `this.state.value=read(this).value;`, "task", "client"},
		{"nonnull-resource-return", "", `const resource=new Resource();const selected=((()=>resource)!)();void selected;`, "task", "client"},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			r := NewSession().Execute(Request{Kind: "compile", ID: "task-residual-source.tsx", Target: target, Diagnostics: "semantic", Source: `import{TaskContext,type Component}from'@exactjs/core';async function subscribe(){return 1;}class Resource{dispose(){}}export function Page(this:Component<{value:number;lookup:Map<string,number>}>){this.state.value=0;this.state.lookup=new Map();` + c.setup + `async function run(` + c.context + `:TaskContext=TaskContext.` + c.placement + `().blocking()){` + c.body + `}void run();return()=> <button onClick={()=>run()}>{this.state.value}</button>;}`})
			if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
				t.Fatalf("residual %s/%s: %s %#v", c.name, target, r.Error, r.Diagnostics)
			}
		}
	}
}
