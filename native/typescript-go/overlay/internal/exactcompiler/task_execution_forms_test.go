package exactcompiler

import (
	"fmt"
	"strings"
	"testing"
)

// Authored task forms must retain their context, mutation and transport contracts
// when compiled through both artifact targets, including inspection instrumentation.
func TestTaskExecutionForms(t *testing.T) {
	for _, c := range []struct{ name, definition string }{
		{"signal-shorthand", `async function run({signal}:TaskContext=TaskContext.client()){this.state.count=await Promise.resolve(signal.aborted?0:1);}`},
		{"signal-alias", `async function run({signal:cancel}:TaskContext=TaskContext.client()){this.state.count=await Promise.resolve(cancel.aborted?0:1);}`},
		{"signal-literal", `async function run({'signal':cancel}:TaskContext=TaskContext.client()){this.state.count=await Promise.resolve(cancel.aborted?0:1);}`},
		{"empty-context", `async function run({}:TaskContext=TaskContext.client()){this.state.count=await Promise.resolve(1);}`},
		{"other-context-member", `async function run({activation}:TaskContext=TaskContext.client()){this.state.count=await Promise.resolve(activation==='interaction'?1:2);}`},
		{"nested-destructured-context", `function child(task:TaskContext=TaskContext.client()){return 1;}async function run({signal}:TaskContext=TaskContext.client()){this.state.count=await child();}`},
		{"nested-expression-context", `function child(task:TaskContext=TaskContext.client()){return 1;}const run=({signal}:TaskContext=TaskContext.client())=>child();`},
		{"blocking-expression-write", `const run=(task:TaskContext=TaskContext.client().blocking())=>this.state.count++;`},
		{"blocking-expression-collection", `const run=(task:TaskContext=TaskContext.client().blocking())=>this.state.lookup.set('x',1);`},
		{"function-expression", `const run=async function(task:TaskContext=TaskContext.client()){this.state.count=await Promise.resolve(1);};`},
		{"progress-array", `function run(value:number,task:TaskContext=TaskContext.client().progress()){for(let value=0;value<2;value++)this.state.values.push(value);}`},
		{"progress-map", `function run(value:number,task:TaskContext=TaskContext.client().progress()){this.state.lookup.set('x',value);this.state.lookup.clear();}`},
		{"progress-set", `function run(value:number,task:TaskContext=TaskContext.client().progress()){this.state.members.add(value);this.state.members.clear();}`},
		{"server-map", `function run(task:TaskContext=TaskContext.server()){this.state.lookup.set('x',1);this.state.lookup.clear();}`},
		{"server-set", `function run(task:TaskContext=TaskContext.server()){this.state.members.add(1);this.state.members.clear();}`},
		{"server-suspended-expression", `async function run(task:TaskContext=TaskContext.server()){const result=(this.state.count+=await Promise.resolve(1));return result;}`},
		{"server-suspended-statement", `async function run(task:TaskContext=TaskContext.server()){this.state.count+=await Promise.resolve(1);}`},
		{"captured-computed-state", `function run(task:TaskContext=TaskContext.server()){const key=props.key;this.state.count=this.state.nested[key];}`},
		{"captured-prop-callback", `function run(task:TaskContext=TaskContext.client().blocking()){props.mutate(props.item);}`},
		{"dependency-name-collision", `function run(task:TaskContext=TaskContext.server()){const __exactDependency=1;const __exactDependency1=2;this.state.count=this.state.nested.first+this.state.nested.second+__exactDependency+__exactDependency1;}`},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			for _, setupActivation := range []bool{false, true} {
				if setupActivation && strings.HasPrefix(c.name, "progress-") {
					continue
				}
				argument := ""
				if strings.HasPrefix(c.name, "progress-") {
					argument = "1"
				}
				setup := ""
				if setupActivation {
					setup = "void run();"
				}
				for _, inspection := range []bool{false, true} {
					t.Run(fmt.Sprintf("%s/%s/setup=%t/inspection=%t", c.name, target, setupActivation, inspection), func(t *testing.T) {
						r := NewSession().Execute(Request{Kind: "compile", ID: "execution-forms.tsx", Target: target, Diagnostics: "semantic", InstrumentInspection: inspection, Source: `import {TaskContext,type Component} from '@exactjs/core';export function Probe(this:Component<{count:number;values:number[];lookup:Map<string,number>;members:Set<number>;nested:{first:number;second:number}}>,props:{key:'first'|'second';mutate:(value:{value:number})=>void;item:{value:number}}){this.state.count=0;this.state.values=[];this.state.lookup=new Map();this.state.members=new Set();this.state.nested={first:1,second:2};` + c.definition + setup + `return()=> <button onClick={()=>run(` + argument + `)}>{this.state.count}</button>;}`})
						if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
							t.Fatalf("valid task form rejected: %s %#v", r.Error, r.Diagnostics)
						}
						if len(r.Analysis.Tasks) == 0 {
							t.Fatal("task ownership lost")
						}
						for _, task := range r.Analysis.Tasks {
							if task.Placement != "client" && task.Placement != "server" {
								t.Fatalf("task placement unproven: %#v", task)
							}
						}
					})
				}
			}
		}
	}
}

// Preparation snapshots receivers, while keys, loop bindings and selector effects
// stay inside work. Contract dependency paths must match the lowered parameters.
func TestTaskComputedSelectorsExecuteInWork(t *testing.T) {
	for _, c := range []struct{ name, body, path string }{
		{"local", `const key=props.key;this.state.trace=String(this.state.table[key]);`, "this.state.table"},
		{"root", `const key='table' as const;this.state.trace=String(this.state[key].first);`, "this.state"},
		{"call", `let calls=0;const key=()=>{calls++;return props.key;};this.state.trace=String(this.state.table[key()])+':'+calls;`, "this.state.table"},
		{"loop", `let total=0;for(const key of ['first','second'] as const)total+=this.state.table[key];this.state.trace=String(total);`, "this.state.table"},
		{"optional", `const key=props.key;this.state.trace=String(this.state.optional?.[key]);`, "this.state.optional"},
		{"asserted", `const key=props.key;this.state.trace=String(this.state.optional![key]);`, "this.state.optional"},
	} {
		for _, placement := range []string{"client", "server"} {
			for _, target := range []Target{TargetClient, TargetServer} {
				t.Run(fmt.Sprintf("%s/%s/%s", c.name, placement, target), func(t *testing.T) {
					r := NewSession().Execute(Request{Kind: "compile", Target: target, ID: "computed-task.tsx", Diagnostics: "semantic", InstrumentInspection: true, Source: `import {TaskContext,type Component} from '@exactjs/core';export function Probe(this:Component<{trace:string;table:{first:number;second:number};optional:{first:number;second:number}|undefined}>,props:{key:'first'|'second';mutate:(value:{value:number})=>void;item:{value:number}}){this.state.trace='';this.state.table={first:1,second:2};this.state.optional=undefined;function run(task:TaskContext=TaskContext.` + placement + `()){` + c.body + `}void run();return()=> <button onClick={()=>run()}>{this.state.trace}</button>;}`})
					if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
						t.Fatalf("work-local selector escaped: %s %#v", r.Error, r.Diagnostics)
					}
					if placement == "server" {
						found := false
						for _, continuation := range r.Analysis.Continuations {
							if continuation.Invocation != nil {
								continue
							}
							for _, dependency := range continuation.Activation.Dependencies {
								found = found || dependency.Path == c.path
							}
						}
						if !found {
							t.Fatalf("receiver dependency not recorded: %#v", r.Analysis.Continuations)
						}
						transportPath := strings.TrimPrefix(c.path, "this.state.")
						if c.path == "this.state" {
							transportPath = "*"
						}
						for _, continuation := range r.Analysis.Continuations {
							input := false
							for _, read := range continuation.Activation.StateReads {
								input = input || read.Path == transportPath && read.Confidence == "exact"
							}
							if !input {
								t.Fatalf("receiver missing from transport: %#v", continuation)
							}
						}
					}
				})
			}
		}
	}
}

// Setup method inputs transport the receiver, preserving native this binding and
// callback context. First-class method reads retain their ordinary separate semantics.
func TestSetupTaskMethodReceivers(t *testing.T) {
	for _, method := range []string{"props.rows.map", `props.rows["map"]`, `props["rows"]["map"]`, "rows.map"} {
		for _, placement := range []string{"client", "server"} {
			for _, target := range []Target{TargetClient, TargetServer} {
				for _, invalid := range []bool{false, true} {
					t.Run(fmt.Sprintf("%s/%s/%s/invalid=%t", method, placement, target, invalid), func(t *testing.T) {
						operation := "toFixed"
						if invalid {
							operation = "toUpperCase"
						}
						r := NewSession().Execute(Request{Kind: "compile", Target: target, ID: "task-method.tsx", Diagnostics: "semantic", InstrumentInspection: true, Source: `import {TaskContext,type Component} from '@exactjs/core';export function Probe(this:Component<{trace:string}>,props:{rows:readonly number[]}){this.state.trace='';const rows=props.rows;const run=(task:TaskContext=TaskContext.` + placement + `().blocking())=>{this.state.trace=` + method + `(value=>value.` + operation + `()).join(',');};void run();return()=> <button onClick={()=>run()}>{this.state.trace}</button>;}`})
						if r.Error != "" || hasDiagnosticCode(r.Diagnostics, "TS2339") != invalid || (!invalid && len(r.Diagnostics) != 0) {
							t.Fatalf("method capture lost its context: %s %#v", r.Error, r.Diagnostics)
						}
					})
				}
			}
		}
	}
}
