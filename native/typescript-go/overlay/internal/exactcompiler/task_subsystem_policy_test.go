package exactcompiler

import (
	"fmt"
	"strings"
	"testing"
)

// Policy controls protect the complete builder grammar and progress lane rather
// than accepting an erased or contradictory policy because its body is valid.
func TestTaskSubsystemPolicyControls(t *testing.T) {
	for _, c := range []struct{ name, policy, parameters, invocation, detail string }{
		{"parenthesized", "(TaskContext.client().blocking())", "", "run()", ""},
		{"bare", "TaskContext", "", "run()", ""},
		{"duplicate-placement", "TaskContext.client().client()", "", "run()", "repeats"},
		{"mixed-placement", "TaskContext.client().server()", "", "run()", "both client and server"},
		{"duplicate-concurrency", "TaskContext.client().latest().latest()", "", "run()", "repeats"},
		{"mixed-concurrency", "TaskContext.client().latest().queue()", "", "run()", "contradictory"},
		{"mixed-priority", "TaskContext.client().normal().deferred()", "", "run()", "contradictory"},
		{"mixed-readiness", "TaskContext.client().blocking().nonblocking()", "", "run()", "contradictory"},
		{"progress-blocking", "TaskContext.client().progress().blocking()", "value:number,", "run(1)", ""},
		{"progress-server", "TaskContext.server().progress()", "value:number,", "run(1)", "requires client"},
		{"progress-arity", "TaskContext.client().progress()", "", "run()", "exactly one"},
		{"progress-detached", "TaskContext.client().progress().detached()", "value:number,", "run(1)", "cannot use detached"},
		{"progress-key", "TaskContext.client().progress().key(value)", "value:number,", "run(1)", "cannot use detached"},
		{"progress-queue", "TaskContext.client().progress().queue()", "value:number,", "run(1)", "cannot use detached"},
		{"progress-result", "TaskContext.client().progress()", "value:number,", "void [run(1)]", "no client result"},
		{"progress-parenthesized", "TaskContext.client().progress()", "value:number,", "void ((run(1)))", ""},
	} {
		for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
			t.Run(fmt.Sprintf("%s/%s", c.name, target), func(t *testing.T) {
				r := NewSession().Execute(Request{Kind: "compile", ID: "task-subsystem-policy.tsx", Target: target, Source: `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;function run(` + c.parameters + `task:TaskContext=` + c.policy + `){this.state.value=1;}return()=> <button onClick={()=>{` + c.invocation + `;}}>{this.state.value}</button>;}`})
				if r.Error != "" {
					t.Fatal(r.Error)
				}
				if c.detail == "" {
					if len(r.Diagnostics) != 0 || len(r.Analysis.Tasks) != 1 {
						t.Fatalf("valid policy lost: %#v %#v", r.Diagnostics, r.Analysis.Tasks)
					}
				} else {
					found := false
					for _, d := range r.Diagnostics {
						found = found || strings.Contains(d.Message, c.detail)
					}
					if !found || r.Code != "" {
						t.Fatalf("invalid policy emitted or attribution lost (%s): %#v", c.detail, r.Diagnostics)
					}
				}
			})
		}
	}
}
