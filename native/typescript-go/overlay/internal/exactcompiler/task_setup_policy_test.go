package exactcompiler

import (
	"fmt"
	"strings"
	"testing"
)

// Setup activation owns dependencies and policy independently of an event-owned callable.
// These source witnesses protect policy preservation across concrete artifact projections.
func TestSetupTaskPolicyAcrossTargetsAndProjections(t *testing.T) {
	for _, c := range []struct {
		name, parameters, policy, body, arguments string
		key, detached                             bool
	}{
		{"latest", "value:number,", "latest()", "this.state.value=await Promise.resolve(value);", "1", false, false},
		{"keyed", "value:number,", "latest().key(value)", "this.state.value=await Promise.resolve(value);", "1", true, false},
		{"detached", "value:number,", "latest().detached()", "this.state.value=await Promise.resolve(value);", "1", false, true},
		{"function-input", "read:()=>number,", "latest()", "this.state.value=await Promise.resolve(read());", "()=>2", false, false},
		{"default-input", "value:number=2,", "latest()", "this.state.value=await Promise.resolve(value);", "", false, false},
	} {
		for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
			for _, projection := range []ComponentContractProjection{ComponentContractProjectionComplete, ComponentContractProjectionHydrate, ComponentContractProjectionClient, ComponentContractProjectionServerRender} {
				t.Run(fmt.Sprintf("%s/%s/%s", c.name, target, projection), func(t *testing.T) {
					response := NewSession().Execute(Request{Kind: "compile", ID: "setup-policy.tsx", Target: target, ComponentContractProjection: projection, InstrumentInspection: c.key, Source: `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;async function run(` + c.parameters + `task:TaskContext=TaskContext.client().` + c.policy + `){` + c.body + `}run(` + c.arguments + `);return()=> <p>{this.state.value}</p>;}`})
					if response.Error != "" || len(response.Diagnostics) != 0 {
						t.Fatalf("setup policy rejected: %s %#v", response.Error, response.Diagnostics)
					}
					if len(response.Analysis.Tasks) != 1 {
						t.Fatalf("setup activation lost: %#v", response.Analysis.Tasks)
					}
					task := response.Analysis.Tasks[0]
					if task.Invoked || task.Detached != c.detached || (task.KeyLength != 0) != c.key || task.RequestedPlacement != "client" {
						t.Fatalf("setup policy changed: %#v", task)
					}
					if target != TargetServer {
						if c.key && !strings.Contains(response.Code, "concurrencyKey") {
							t.Fatal("setup key analyzed but not emitted")
						}
						if c.detached && !strings.Contains(response.Code, "detached: true") {
							t.Fatal("setup detached policy analyzed but not emitted")
						}
					}
				})
			}
		}
	}
}

// Explicit setup task results retain their publication path even with reactive arguments.
func TestSetupTaskResultAssignmentOwnershipAcrossTargets(t *testing.T) {
	for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
		for _, projection := range []ComponentContractProjection{ComponentContractProjectionComplete, ComponentContractProjectionHydrate, ComponentContractProjectionServerRender} {
			for _, argument := range []string{"1", "props.input"} {
				t.Run(fmt.Sprintf("%s/%s/%s", target, projection, argument), func(t *testing.T) {
					response := NewSession().Execute(Request{Kind: "compile", ID: "setup-result.tsx", Target: target, ComponentContractProjection: projection, Source: `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>,props:{input:number}){this.state.value=0;function run(value:number,task:TaskContext=TaskContext.server().blocking()){return value+1;}this.state.value=run(` + argument + `);return()=> <p>{this.state.value}</p>;}`})
					if response.Error != "" || len(response.Diagnostics) != 0 {
						t.Fatalf("setup result rejected: %s %#v", response.Error, response.Diagnostics)
					}
					found := false
					for _, task := range response.Analysis.Tasks {
						if len(task.ResultWritePath) == 1 && task.ResultWritePath[0] == "value" {
							found = true
							if task.Invoked || task.Placement != "server" || task.Readiness != "blocking" {
								t.Fatalf("setup result lost its policy: %#v", task)
							}
						}
					}
					if !found {
						t.Fatalf("setup result lost its publication path: %#v", response.Analysis.Tasks)
					}
				})
			}
		}
	}
}

// Result ownership must survive callable forms, local aliases and a shared interaction binding.
func TestSetupTaskResultCallableRoutes(t *testing.T) {
	for _, c := range []struct{ name, definition, call, render string }{
		{"declaration", "function run(value:number,task:TaskContext=TaskContext.client().latest().key(value)){return value+1;}", "run", ""},
		{"arrow", "const run=(value:number,task:TaskContext=TaskContext.client().latest().key(value))=>value+1;", "run", ""},
		{"expression", "const run=function(value:number,task:TaskContext=TaskContext.client().latest().key(value)){return value+1;};", "run", ""},
		{"member", "function run(value:number,task:TaskContext=TaskContext.client().latest().key(value)){return value+1;}const actions={run};", "actions.run", ""},
		{"indexed", "function run(value:number,task:TaskContext=TaskContext.client().latest().key(value)){return value+1;}const actions={run};", "actions['run']", ""},
		{"destructured", "function run(value:number,task:TaskContext=TaskContext.client().latest().key(value)){return value+1;}const actions={run};const {run:activate}=actions;", "activate", ""},
		{"nested-destructured", "function run(value:number,task:TaskContext=TaskContext.client().latest().key(value)){return value+1;}const actions={nested:{run}};const {nested:{run:activate}}=actions;", "activate", ""},
		{"array-destructured", "function run(value:number,task:TaskContext=TaskContext.client().latest().key(value)){return value+1;}const [activate]=[run];", "activate", ""},
		{"alias", "function run(value:number,task:TaskContext=TaskContext.client().latest().key(value)){return value+1;}const activate=run;", "activate", ""},
		{"default-reused", "function run(revision:number,value:number=2,key:string='setup',task:TaskContext=TaskContext.client().latest().key(key)){return value+revision;}", "run", "<button onClick={()=>run(9)}>Run</button>"},
		{"reused", "function run(value:number,task:TaskContext=TaskContext.client().latest().key(value)){return value+1;}", "run", "<button onClick={()=>run(9)}>Run</button>"},
	} {
		for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
			t.Run(fmt.Sprintf("%s/%s", c.name, target), func(t *testing.T) {
				response := NewSession().Execute(Request{Kind: "compile", ID: "setup-result-routes.tsx", Target: target, InstrumentInspection: true, Source: `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>,props:{input:number}){this.state.value=0;` + c.definition + `this.state.value=` + c.call + `(props.input);return()=> <main>` + c.render + `<p>{this.state.value}</p></main>;}`})
				if response.Error != "" || len(response.Diagnostics) != 0 {
					t.Fatalf("setup result rejected: %s %#v", response.Error, response.Diagnostics)
				}
				found := false
				for _, task := range response.Analysis.Tasks {
					if !task.Invoked && len(task.ResultWritePath) == 1 && task.ResultWritePath[0] == "value" {
						found = true
						if task.RequestedPlacement != "client" || task.KeyLength == 0 || task.ReusesInvokedDefinition != (c.name == "reused" || c.name == "default-reused" || c.name == "alias" || c.name == "destructured" || c.name == "nested-destructured" || c.name == "array-destructured" || c.name == "member" || c.name == "indexed") {
							t.Fatalf("result policy changed: %#v", task)
						}
					}
				}
				if !found {
					t.Fatalf("result publication lost: %#v", response.Analysis.Tasks)
				}
			})
		}
	}
}

// These setup and interaction systems exercise distinct capture, context and lifetime routes.
func TestTaskLoweringCaptureContextAndResourceRoutes(t *testing.T) {
	for _, c := range []struct{ name, source string }{
		{"module-constant-input", `import {TaskContext,type Component} from '@exactjs/core';const INPUT=1;export function Page(this:Component<{value:number}>){this.state.value=0;function run(value:number,task:TaskContext=TaskContext.client()){this.state.value=value;}run(INPUT);return()=> <p>{this.state.value}</p>;}`},
		{"derived-input", `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>,props:{input:number}){this.state.value=0;const input=props.input+1;function run(value:number,task:TaskContext=TaskContext.client()){this.state.value=value;}run(input);return()=> <p>{this.state.value}</p>;}`},
		{"captured-default", `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>,props:{input:number}){this.state.value=0;function run(value:number=props.input,task:TaskContext=TaskContext.client()){this.state.value=value;}run();return()=> <p>{this.state.value}</p>;}`},
		{"server-default-result", `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>,props:{input:number}){this.state.value=0;function run(value:number=props.input,task:TaskContext=TaskContext.server().blocking()){return value+1;}this.state.value=run();return()=> <p>{this.state.value}</p>;}`},
		{"context-publication", `import {TaskContext,createContext,type Component} from '@exactjs/core';const Status=createContext<number>('status',{keep:'shared'});export function Page(this:Component<{value:number}>,props:{input:number}){this.state.value=0;function run(value:number,task:TaskContext=TaskContext.server()){this.setContext(Status,value);this.state.value=value;}run(props.input);return()=> <p>{this.state.value}</p>;}`},
		{"progress", `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;function report(value:number,task:TaskContext=TaskContext.client().progress()){this.state.value=value;}function run(task:TaskContext=TaskContext.server()){report(1);}return()=> <button onClick={()=>run()}>{this.state.value}</button>;}`},
		{"detached-invocation", `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;function run(task:TaskContext=TaskContext.client().detached()){this.state.value++;}return()=> <button onClick={()=>run()}>{this.state.value}</button>;}`},
		{"owned-subscription", `import {type Component} from '@exactjs/core';declare const source:{subscribe(callback:()=>void):()=>void};export function Page(this:Component<{value:number}>){this.state.value=0;source.subscribe(()=>{});return()=> <p>{this.state.value}</p>;}`},
	} {
		for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
			t.Run(fmt.Sprintf("%s/%s", c.name, target), func(t *testing.T) {
				response := NewSession().Execute(Request{Kind: "compile", ID: "task-systems.tsx", Target: target, Source: c.source})
				if response.Error != "" || len(response.Diagnostics) != 0 {
					t.Fatalf("supported task system rejected: %s %#v", response.Error, response.Diagnostics)
				}
				if len(response.Analysis.Tasks) == 0 {
					t.Fatal("owned task system lost its activation")
				}
			})
		}
	}
}

// Checking a setup activation must retain both the destination and the authored call signature.
func TestSetupTaskResultAssignmentConstraints(t *testing.T) {
	for _, c := range []struct{ name, body, valid, invalid, code string }{
		{"result", "function run(value:number,task:TaskContext=TaskContext.client()){return RESULT;}this.state.value=run(props.input);", "value", "'bad'", "TS2322"},
		{"destructured-result", "function run(value:number,task:TaskContext=TaskContext.client()){return RESULT;}const {run:activate}={run};this.state.value=activate(props.input);", "value", "'bad'", "TS2322"},
		{"argument", "function run(value:number,task:TaskContext=TaskContext.client()){return value;}this.state.value=run(RESULT);", "props.input", "'bad'", "TS2345"},
	} {
		for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
			t.Run(fmt.Sprintf("%s/%s", c.name, target), func(t *testing.T) {
				for _, value := range []string{c.valid, c.invalid} {
					kind := "compile"
					if target == TargetDefault {
						kind = "check"
					}
					response := NewSession().Execute(Request{Kind: kind, ID: "setup-result-types.tsx", Target: target, Diagnostics: "semantic", Source: `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>,props:{input:number}){this.state.value=0;` + strings.ReplaceAll(c.body, "RESULT", value) + `return()=> <p>{this.state.value}</p>;}`})
					if response.Error != "" {
						t.Fatal(response.Error)
					}
					found := false
					for _, diagnostic := range response.Diagnostics {
						found = found || diagnostic.Code == c.code
					}
					if found != (value == c.invalid) {
						t.Fatalf("assignment constraint lost: %#v", response.Diagnostics)
					}
				}
			})
		}
	}
}

// A shorthand task-table reference escapes direct invocation and needs the universal helper ABI.
func TestTaskTablePreservesUniversalInvocationABI(t *testing.T) {
	for _, projection := range []ComponentContractProjection{ComponentContractProjectionComplete, ComponentContractProjectionHydrate, ComponentContractProjectionClient} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "task-table-abi.tsx", Target: TargetClient, ComponentContractProjection: projection, Source: `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>,props:{input:number}){this.state.value=0;function run(value:number,task:TaskContext=TaskContext.client().latest()){return value+1;}const actions={run};this.state.value=actions.run(props.input);return()=> <p>{this.state.value}</p>;}`})
		if response.Error != "" || len(response.Diagnostics) != 0 {
			t.Fatalf("task table rejected: %s %#v", response.Error, response.Diagnostics)
		}
		if strings.Contains(response.Code, "bindCompiledClientLatestTaskForHost") || !strings.Contains(response.Code, "bindTaskForHost") {
			t.Fatalf("task table lost the generic invocation ABI (%s)", projection)
		}
	}
}

// Scalar publication and asynchronous/thenable publication must both have native source witnesses.
func TestSetupTaskResultPublicationKinds(t *testing.T) {
	for _, c := range []struct{ name, result string }{
		{"scalar", "value+1"},
		{"promise", "Promise.resolve(value+1)"},
		{"object", "({id:value})"},
		{"union", "value>0?value+1:Promise.resolve(value+1)"},
	} {
		t.Run(c.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "setup-publication-kind.tsx", Target: TargetClient, Diagnostics: "semantic", Source: `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number|{id:number}}>,props:{input:number}){this.state.value=0;function run(value:number,task:TaskContext=TaskContext.client()){return ` + c.result + `;}this.state.value=run(props.input);return()=> <p>{typeof this.state.value==='number'?this.state.value:this.state.value.id}</p>;}`})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("settled result rejected: %s %#v", response.Error, response.Diagnostics)
			}
			if len(response.Analysis.Tasks) != 1 || len(response.Analysis.Tasks[0].ResultWritePath) != 1 || response.Analysis.Tasks[0].ResultWritePath[0] != "value" {
				t.Fatalf("settled result lost its output: %#v", response.Analysis.Tasks)
			}
		})
	}
}

// A default before a required argument accepts explicit undefined without weakening later arguments.
func TestSharedTaskDefaultBeforeRequiredArgument(t *testing.T) {
	for _, input := range []string{"props.input", "'invalid'"} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "setup-required-after-default.tsx", Target: TargetClient, Diagnostics: "semantic", Source: `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>,props:{input:number}){this.state.value=0;function run(offset:number=1,value:number,task:TaskContext=TaskContext.client()){return offset+value;}this.state.value=run(undefined,` + input + `);return()=> <button onClick={()=>run(undefined,2)}>{this.state.value}</button>;}`})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		if hasDiagnosticCode(response.Diagnostics, "TS2345") != (input == "'invalid'") {
			t.Fatalf("required argument checking changed: %#v", response.Diagnostics)
		}
		if input == "props.input" && len(response.Diagnostics) != 0 {
			t.Fatalf("defaulted argument rejected: %#v", response.Diagnostics)
		}
	}
}
