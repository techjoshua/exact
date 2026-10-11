package exactcompiler

import (
	"strconv"
	"strings"
	"testing"
)

// Hydration suppresses completed startup generations while retaining reactive server inputs.
func TestNormalizationHydrationActivationRetention(t *testing.T) {
	for _, c := range []struct {
		name, setup string
		reactive    bool
		serverOnly  bool
	}{
		{"arguments", `const run=(input:number,task:TaskContext=TaskContext.server().blocking())=>{this.state.output=input};run(this.state.input);`, true, false},
		{"startup", `const run=(task:TaskContext=TaskContext.server().blocking())=>{this.state.output=this.state.input};run();`, false, false},
		{"server-resident", `const run=(input:number,task:TaskContext=TaskContext.server().blocking())=>{this.state.output=input};run(this.state.input);`, false, true},
		{"client-computation", `this.state.output=this.state.input+1;`, false, false},
		{"inferred-async", `this.state.output=await Promise.resolve(this.state.input);`, true, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			interaction := ` onClick={()=>this.state.input++}`
			if c.serverOnly {
				interaction = ""
			}
			r := NewSession().Execute(Request{Kind: "compile", ID: "hydration-activation.tsx", Target: TargetClient, ServerComponents: true, ComponentContractProjection: ComponentContractProjectionHydrate, Source: `import {TaskContext,type Component} from '@exactjs/core';export function Probe(this:Component<{input:number;output:number}>){this.state.input=1;this.state.output=0;` + c.setup + `return()=> <p` + interaction + `>{this.state.output}</p>;}`})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			if (len(r.Analysis.Continuations) != 0) != c.reactive {
				t.Fatal("same-build hydration lost reactive continuation ownership")
			}
			if strings.Contains(r.Code, "dispatchComponentContinuation as") != c.reactive {
				t.Fatal("hydration activation lifetime changed")
			}
		})
	}
}

// Generated setup helpers cannot shadow a module callable used by the returned render function.
func TestNormalizationGeneratedHelperNameCollisions(t *testing.T) {
	for _, c := range []struct{ prefix, expression string }{
		{"__exactComponentSetupTask_", "await Promise.resolve(this.state.input)"},
		{"__exactComponentComputation_", "this.state.input+1"},
	} {
		name := c.prefix + "0"
		var source string
		for attempt := 0; attempt < 8; attempt++ {
			source = `import {type Component} from '@exactjs/core';function ` + name + `(){return 7;}export function Probe(this:Component<{input:number;output:number}>){this.state.input=1;this.state.output=` + c.expression + `;return()=> <p>{this.state.output}:{` + name + `().toFixed(0)}</p>;}`
			next := c.prefix + strconv.Itoa(strings.Index(source, "this.state.output="))
			if next == name {
				break
			}
			name = next
		}
		for _, target := range []Target{TargetClient, TargetServer} {
			r := NewSession().Execute(Request{Kind: "compile", ID: "normalization-helper-collision.tsx", Target: target, Diagnostics: "semantic", Source: source})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			for _, diagnostic := range r.Diagnostics {
				if diagnostic.Severity == "error" {
					t.Fatalf("generated helper shadowed %s: %#v", name, diagnostic)
				}
			}
		}
	}
}

// Generated-looking authored names retain the same startup policy as ordinary task names.
func TestNormalizationAuthoredTaskNames(t *testing.T) {
	for _, name := range []string{"run", "__exactComponentSetupTask_authored", "__exactComponentComputation_authored"} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "authored-task-name.tsx", Target: TargetClient, Source: `import {TaskContext,type Component} from '@exactjs/core';export function Probe(this:Component<{input:number;output:number}>){this.state.input=1;this.state.output=0;function ` + name + `(task:TaskContext=TaskContext.client()){this.state.output=this.state.input;} ` + name + `();return()=> <p onClick={()=>this.state.input++}>{this.state.output}</p>;}`})
		if r.Error != "" {
			t.Fatal(r.Error)
		}
		if !strings.Contains(r.Code, "activateTaskOnceForHost as") {
			t.Fatalf("authored task %s acquired inferred activation semantics", name)
		}
	}
}

// A typed native component is classified by its component contract even with a helper-like name.
func TestNormalizationAuthoredComponentNames(t *testing.T) {
	for _, name := range []string{"__exactComponentSetupTask_authored", "__exactComponentComputation_authored"} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "authored-component-name.tsx", Target: TargetClient, Source: `import {type Component} from '@exactjs/core';export function ` + name + `(this:Component<{value:number}>){this.state.value=1;return()=> <p onClick={()=>this.state.value++}>{this.state.value}</p>;}`})
		if r.Error != "" || len(r.Analysis.Components) != 1 || r.Analysis.Components[0].Name != name {
			t.Fatalf("authored component %s lost its native identity: %s", name, r.Error)
		}
		if !strings.Contains(r.Code, "attachCompiledComponentContract as") {
			t.Fatal("authored component did not reach artifact lowering")
		}
	}
}

// An ordinary typed receiver remains ordinary regardless of the local helper's spelling.
func TestNormalizationAuthoredReceiverNames(t *testing.T) {
	for _, name := range []string{"ordinary", "__exactComponentComputation_authored"} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "authored-receiver-name.tsx", Target: TargetClient, Source: `import {type Component} from '@exactjs/core';export function Probe(this:Component<{value:number}>){this.state.value=1;function ` + name + `(this:{state:{foreign:number}}){this.state.foreign++;}const other={state:{foreign:1}};return()=> <p onClick={()=>` + name + `.call(other)}>{this.state.value}</p>;}`})
		if r.Error != "" {
			t.Fatal(r.Error)
		}
		for _, write := range r.Analysis.StateWrites {
			if len(write.Path) != 0 && write.Path[0] == "foreign" {
				t.Fatalf("ordinary receiver %s acquired component state authority", name)
			}
		}
		if !strings.Contains(r.Code, "this.state.foreign++") {
			t.Fatal("ordinary receiver mutation did not retain its lexical owner")
		}
	}
}

// Inserted policy aliases and context parameters preserve references to authored bindings.
func TestNormalizationGeneratedNameCollisions(t *testing.T) {
	for _, binding := range []string{"__exactTaskContext", "__exactTaskContext_1", "__exactComponentTaskContext"} {
		for _, target := range []Target{TargetClient, TargetServer} {
			r := NewSession().Execute(Request{Kind: "compile", ID: "normalization-name-collision.tsx", Target: target, Diagnostics: "semantic", Source: `import {type Component} from '@exactjs/core';const ` + binding + `=7;export function Probe(this:Component<{input:number;output:number}>){this.state.input=1;this.state.output=await Promise.resolve(this.state.input+` + binding + `);return()=> <p onClick={()=>this.state.input++}>{this.state.output}</p>;}`})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			for _, diagnostic := range r.Diagnostics {
				if diagnostic.Severity == "error" {
					t.Fatalf("generated declaration captured %s: %#v", binding, diagnostic)
				}
			}
		}
	}
}
