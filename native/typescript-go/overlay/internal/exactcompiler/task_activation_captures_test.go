package exactcompiler

import (
	"fmt"
	"testing"
)

// Captured defaults remain generation snapshots across source forms and artifact
// targets. Same-path reads in the body still belong to the live work contract.
func TestTaskActivationCaptureSources(t *testing.T) {
	for _, c := range []struct{ name, setup, parameters, body, arguments, source, path string }{
		{"state", "", "value:number=this.state.input", "return value;", "", "state", "this.state.input"},
		{"duplicate-state", "", "value:number=this.state.input+this.state.input", "return value;", "", "state", "this.state.input"},
		{"state-alias", "const input=this.state.input;", "value:number=input", "return value;", "", "derived", "input"},
		{"props", "", "value:number=props.input", "return value;", "", "props", "props.input"},
		{"indexed-props", "", "value:number=props['input']", "return value;", "", "props", "props['input']"},
		{"computed-props", "const key='input' as const;", "value:number=props[key]", "return value;", "", "props", "props[key]"},
		{"derived", "const input=props.input+1;", "value:number=input", "return value;", "", "derived", "input"},
		{"direct-context", "", "value:number=this.getContext(Public)", "return value;", "", "context", "this.getContext(Public)"},
		{"context", "const input=this.getContext(Public);", "value:number=input", "return value;", "", "context", "input"},
		{"partial", "", "revision:number,value:number=props.input", "return revision+value;", "this.state.revision", "props", "props.input"},
		{"earlier", "", "revision:number,value:number=revision+props.input", "return value;", "this.state.revision", "props", "props.input"},
		{"explicit-undefined", "", "value:number=props.input", "return value;", "undefined", "props", "props.input"},
		{"same-path-body", "", "value:number=this.state.input", "return value+this.state.input;", "", "state", "this.state.input"},
		{"same-path-child", "const read=()=>this.state.input;", "value:number=this.state.input", "return value+read();", "", "state", "this.state.input"},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(fmt.Sprintf("%s/%s", c.name, target), func(t *testing.T) {
				r := NewSession().Execute(Request{Kind: "compile", ID: "task-capture-sources.tsx", Target: target, Diagnostics: "semantic", Source: `import {TaskContext,createContext,type Component} from '@exactjs/core';const Public=createContext<number>('public',{keep:'shared'});export function Page(this:Component<{input:number;revision:number;result:number}>,props:{input:number}){this.state.input=2;this.state.revision=1;this.state.result=0;` + c.setup + `function run(` + c.parameters + `,task:TaskContext=TaskContext.server().blocking()){` + c.body + `}this.state.result=run(` + c.arguments + `);return()=> <output>{this.state.result}</output>;}`})
				if r.Error != "" || len(r.Diagnostics) != 0 {
					t.Fatalf("valid capture rejected: %s %#v", r.Error, r.Diagnostics)
				}
				if len(r.Analysis.Tasks) != 1 {
					t.Fatalf("task ownership lost: %#v", r.Analysis.Tasks)
				}
				task := r.Analysis.Tasks[0]
				found := false
				for _, input := range task.CapturedInputs {
					if input.Source == c.source && input.Path == c.path {
						found = true
					}
				}
				if !found {
					t.Fatalf("capture provenance lost: %#v", task.CapturedInputs)
				}
				if c.name == "duplicate-state" && len(task.CapturedInputs) != 1 {
					t.Fatalf("capture duplicated: %#v", task.CapturedInputs)
				}
				if len(r.Analysis.Continuations) != 1 {
					t.Fatalf("continuation lost: %#v", r.Analysis.Continuations)
				}
			})
		}
	}
}

// Context lookups and authored arguments must keep separate continuation slots,
// including when ordinary parameters are captured after inferred body inputs.
func TestTaskActivationContextSlots(t *testing.T) {
	for _, c := range []struct{ name, setup, parameters, body, arguments string }{
		{"shared-body", "", "value:number=props.input", "return value+this.getContext(Public);", ""},
		{"server-body", "", "value:number=props.input", "return value+this.getContext(Private);", ""},
		{"shared-binding", "const input=this.getContext(Public);", "value:number=props.input", "return value+input;", ""},
		{"server-binding", "const input=this.getContext(Private);", "value:number=props.input", "return value+input;", ""},
		{"mixed-bindings", "const input=this.getContext(Public);const secret=this.getContext(Private);", "value:number=props.input", "return value+input+this.state.revision+secret;", ""},
		{"partial-shared", "", "revision:number,value:number=props.input", "return revision+value+this.getContext(Public);", "this.state.revision"},
		{"partial-server", "", "revision:number,value:number=props.input", "return revision+value+this.getContext(Private);", "this.state.revision"},
		{"shared-write", "", "value:number=props.input", "this.setContext(Public,value);return value;", ""},
		{"server-write", "", "value:number=props.input", "this.setContext(Private,value);return value;", ""},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(fmt.Sprintf("%s/%s", c.name, target), func(t *testing.T) {
				r := NewSession().Execute(Request{Kind: "compile", ID: "task-context-slots.tsx", Target: target, Diagnostics: "semantic", Source: `import {TaskContext,createContext,type Component} from '@exactjs/core';const Public=createContext<number>('public',{keep:'shared'});const Private=createContext<number>('private',{keep:'server'});export function Page(this:Component<{revision:number;result:number}>,props:{input:number}){this.state.revision=1;this.state.result=0;` + c.setup + `function run(` + c.parameters + `,task:TaskContext=TaskContext.server().blocking()){` + c.body + `}this.state.result=run(` + c.arguments + `);return()=> <output>{this.state.result}</output>;}`})
				if r.Error != "" || len(r.Diagnostics) != 0 {
					t.Fatalf("valid context routing rejected: %s %#v", r.Error, r.Diagnostics)
				}
				if len(r.Analysis.Continuations) != 1 {
					t.Fatalf("context continuation lost: %#v", r.Analysis.Continuations)
				}
				continuation := r.Analysis.Continuations[0]
				indices := map[int]bool{}
				for _, dependency := range continuation.Activation.Dependencies {
					if indices[dependency.Index] {
						t.Fatalf("continuation arguments overlap: %#v", continuation.Activation)
					}
					indices[dependency.Index] = true
				}
			})
		}
	}
}

// Captured private values are forbidden even when an unrelated body input is
// shared. Body-only server resources do not authorize browser transport.
func TestTaskCapturePolicyBoundaryControls(t *testing.T) {
	for _, source := range []string{"this.getContext(Private)", "privateValue", "this.state.privateValue"} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(fmt.Sprintf("%s/%s", source, target), func(t *testing.T) {
				r := NewSession().Execute(Request{Kind: "compile", ID: "task-private-default.tsx", Target: target, Source: `import {TaskContext,createContext,type Component} from '@exactjs/core';const Private=createContext<number>('private',{keep:'server'});interface State {
/** @exact keep=server */
privateValue:number;result:number;
}export function Page(this:Component<State>){this.state.privateValue=7;this.state.result=0;const privateValue=this.getContext(Private);function run(value:number=` + source + `,task:TaskContext=TaskContext.server()){this.state.result=value;}run();return()=> <output>{this.state.result}</output>;}`})
				rejected := false
				for _, diagnostic := range r.Diagnostics {
					rejected = rejected || diagnostic.Code == "EXACT2001"
				}
				if !rejected {
					t.Fatalf("private default escaped transport policy: %s %#v", r.Error, r.Diagnostics)
				}
			})
		}
	}
}

// Setup-only private access belongs to the component, while a task body owns
// its own placement. Client context attachments cannot reference erased tokens.
func TestTaskContextPlacementAndAttachment(t *testing.T) {
	for _, operation := range []string{"getContext(Private)", "setContext(Private,7)"} {
		for _, inside := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/task=%t", operation, inside), func(t *testing.T) {
				statement := "this." + operation + ";"
				if inside {
					statement = "function run(task:TaskContext=TaskContext.server()){ " + statement + " }run();"
				}
				r := NewSession().Execute(Request{Kind: "compile", ID: "context-owner.tsx", Target: TargetClient, ServerComponents: true, Diagnostics: "semantic", Source: `import {TaskContext,createContext,type Component} from '@exactjs/core';const Private=createContext<number>('private',{keep:'server'});export function Page(this:Component<{count:number}>){this.state.count=0;` + statement + `return()=> <button onClick={()=>this.state.count++}>ready</button>;}`})
				if r.Error != "" || len(r.Diagnostics) != 0 {
					t.Fatalf("context owner rejected: %s %#v", r.Error, r.Diagnostics)
				}
				component := findComponent(t, r.Analysis.Components, "Page")
				if (component.Placement == "server") == inside {
					t.Fatalf("context placement crossed owner: %#v", component)
				}
			})
		}
	}
}

// Component-local binding names cannot merge captures or defaults across owners.
func TestTaskCaptureComponentIsolation(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "capture-owners.tsx", Target: target, Diagnostics: "semantic", Source: `import {TaskContext,type Component} from '@exactjs/core';export function First(this:Component<{result:number}>,props:{first:number}){this.state.result=0;const input=props.first+1;function run(value:number=input,task:TaskContext=TaskContext.server()){this.state.result=value;}run();return()=> <output>{this.state.result}</output>;}export function Second(this:Component<{result:number}>,props:{second:number}){this.state.result=0;const input=props.second+2;function run(value:number=input,task:TaskContext=TaskContext.server()){this.state.result=value;}run();return()=> <output>{this.state.result}</output>;}`})
			if r.Error != "" || len(r.Diagnostics) != 0 {
				t.Fatalf("owner-isolated capture rejected: %s %#v", r.Error, r.Diagnostics)
			}
			if len(r.Analysis.Tasks) != 2 {
				t.Fatalf("task owners merged: %#v", r.Analysis.Tasks)
			}
			for _, task := range r.Analysis.Tasks {
				if len(task.CapturedInputs) != 1 || task.CapturedInputs[0].Source != "derived" || task.CapturedInputs[0].Path != "input" {
					t.Fatalf("capture crossed component owner: %#v", task)
				}
			}
		})
	}
}

// Ordinary local helper reconstruction retains transitive definitions and owned
// receivers. Helpers declared inside the work itself need no setup reconstruction.
func TestTaskContinuationLocalHelperForms(t *testing.T) {
	for _, c := range []struct{ name, setup, body string }{
		{"arrow", "const read=()=>this.state.input;", "return value+read();"},
		{"function", "function read(this:{state:{input:number}}){return this.state.input;}", "return value+read.call(this);"},
		{"expression", "const read=function(owner:{input:number}){return owner.input;};", "return value+read(this.state);"},
		{"transitive", "const leaf=()=>this.state.input;const read=()=>leaf();", "return value+read();"},
		{"recursive", "function read(n:number):number{return n?read(n-1):1;}", "return value+read(2);"},
		{"body-local", "", "const read=()=>this.state.input;return value+read();"},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(fmt.Sprintf("%s/%s", c.name, target), func(t *testing.T) {
				r := NewSession().Execute(Request{Kind: "compile", ID: "task-local-helpers.tsx", Target: target, Diagnostics: "semantic", Source: `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{input:number;result:number}>){this.state.input=2;this.state.result=0;` + c.setup + `function run(value:number=this.state.input,task:TaskContext=TaskContext.server().blocking()){` + c.body + `}this.state.result=run();return()=> <button onClick={()=>run()}>{this.state.result}</button>;}`})
				if r.Error != "" || len(r.Diagnostics) != 0 {
					t.Fatalf("local helper lost lexical scope: %s %#v", r.Error, r.Diagnostics)
				}
			})
		}
	}
}

// Invoked tasks preserve context authority and bindings through direct reads,
// lexical aliases, local callable closures and transitive publication helpers.
func TestTaskInvokedContextBindings(t *testing.T) {
	for _, c := range []struct{ name, setup, body string }{
		{"direct", "", "this.setContext(Public,value+this.getContext(Public));"},
		{"alias", "const input=this.getContext(Public);", "this.setContext(Public,value+input);"},
		{"helper-alias", "const input=this.getContext(Public);const read=()=>input;", "this.setContext(Public,value+read());"},
		{"helper-write", "const publish=(value:number)=>this.setContext(Public,value);", "publish(value);"},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(fmt.Sprintf("%s/%s", c.name, target), func(t *testing.T) {
				r := NewSession().Execute(Request{Kind: "compile", ID: "task-invoked-context.tsx", Target: target, Diagnostics: "semantic", Source: `import {TaskContext,createContext,type Component} from '@exactjs/core';const Public=createContext<number>('public',{keep:'shared'});export function Page(this:Component<{}>,props:{input:number}){` + c.setup + `const run=(value:number=props.input,task:TaskContext=TaskContext.server().blocking())=>{` + c.body + `};run();return()=> <button onClick={()=>run()}>run</button>;}`})
				if r.Error != "" || len(r.Diagnostics) != 0 {
					t.Fatalf("invoked context binding lost: %s %#v", r.Error, r.Diagnostics)
				}
				found := false
				for _, continuation := range r.Analysis.Continuations {
					if continuation.Invocation == nil {
						continue
					}
					found = true
					if len(continuation.Effects.ContextWrites) != 1 || continuation.Effects.ContextWrites[0].Token != "Public" {
						t.Fatalf("invoked context write authority lost: %#v", continuation)
					}
					if c.name != "helper-write" && (len(continuation.Activation.PublicContexts) != 1 || continuation.Activation.PublicContexts[0].Token != "Public") {
						t.Fatalf("invoked context read authority lost: %#v", continuation)
					}
				}
				if !found {
					t.Fatal("invoked context contract missing")
				}
			})
		}
	}
}

// A context captured only by a default travels as the parameter value. A body
// read of that same token still retains its executor lookup authority.
func TestTaskContextCaptureExecutionBoundary(t *testing.T) {
	for _, c := range []struct {
		name, initializer, body string
		reads                   int
	}{
		{"direct-default", "this.getContext(Public)", "this.state.result=value;", 0},
		{"alias-default", "input", "this.state.result=value;", 0},
		{"direct-body", "input", "this.state.result=value+this.getContext(Public);", 1},
		{"alias-body", "input", "this.state.result=value+input;", 1},
		{"helper-body", "input", "this.state.result=value+read();", 1},
		{"shadowed-body", "input", "const input=2;this.state.result=value+input;", 0},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(fmt.Sprintf("%s/%s", c.name, target), func(t *testing.T) {
				r := NewSession().Execute(Request{Kind: "compile", ID: "task-context-capture.tsx", Target: target, Diagnostics: "semantic", Source: `import {TaskContext,createContext,type Component} from '@exactjs/core';const Public=createContext<number>('public',{keep:'shared'});export function Page(this:Component<{result:number}>){this.state.result=0;const input=this.getContext(Public);const read=()=>input;const run=(value:number=` + c.initializer + `,task:TaskContext=TaskContext.server().blocking())=>{` + c.body + `};run();return()=> <button onClick={()=>run()}>{this.state.result}</button>;}`})
				if r.Error != "" || len(r.Diagnostics) != 0 {
					t.Fatalf("context capture rejected: %s %#v", r.Error, r.Diagnostics)
				}
				for _, continuation := range r.Analysis.Continuations {
					if len(continuation.Activation.PublicContexts) != c.reads {
						t.Fatalf("snapshot and executor context authority merged: %#v", continuation)
					}
				}
			})
		}
	}
}

// Local publishing helpers belong to setup or task work. Direct render effects
// and nested durable components retain their independent rejection contracts.
func TestTaskLocalContextHelperOwnershipControls(t *testing.T) {
	for _, c := range []struct {
		name, setup, render string
		accepted            bool
	}{
		{"helper", "const publish=(value:number)=>{this.setContext(Public,value);};const run=(task:TaskContext=TaskContext.server())=>publish(1);run();", "<button onClick={()=>run()}>run</button>", true},
		{"render-effect", "", "this.setContext(Public,1)", false},
		{"nested-component", "function Inner(this:Component<{}>){this.setContext(Public,1);return()=> <output>inner</output>;}", "<Inner />", false},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(fmt.Sprintf("%s/%s", c.name, target), func(t *testing.T) {
				r := NewSession().Execute(Request{Kind: "compile", ID: "task-helper-ownership.tsx", Target: target, Diagnostics: "semantic", Source: `import {TaskContext,createContext,type Component} from '@exactjs/core';const Public=createContext<number>('public',{keep:'shared'});export function Page(this:Component<{}>){` + c.setup + `return()=> ` + c.render + `;}`})
				if c.accepted && (r.Error != "" || len(r.Diagnostics) != 0) {
					t.Fatalf("ordinary helper rejected: %s %#v", r.Error, r.Diagnostics)
				}
				if !c.accepted && r.Error == "" && len(r.Diagnostics) == 0 {
					t.Fatal("invalid owner accepted")
				}
				if c.accepted && len(r.Analysis.Components) != 1 {
					t.Fatalf("ordinary helper received component identity: %#v", r.Analysis.Components)
				}
			})
		}
	}
}
