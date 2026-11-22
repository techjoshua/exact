package exactcompiler

import (
	"strings"
	"testing"
)

func TestOptimisticCaptureScope(t *testing.T) {
	for _, test := range []struct {
		name, body string
		invalid    bool
	}{
		{"server local", `const local="client"; task.optimistic(()=>effects.push(local));`, true},
		{"destructured server local", `const {label:local}={label:"client"}; task.optimistic(()=>effects.push(local));`, true},
		{"aliased capability capture", `const local="client"; const context=task; context.optimistic(()=>effects.push(local));`, true},
		{"server conditional", `if(input)task.optimistic(()=>effects.push(input));`, true},
		{"client conditional", `task.optimistic(()=>{if(input)effects.push(input);});`, false},
		{"parenthesized call", `(task.optimistic(()=>effects.push(input)));`, false},
		{"destructured task input", `task.optimistic(()=>effects.push(input));`, false},
		{"task input", `task.optimistic(()=>effects.push(input));`, false},
		{"callback local", `task.optimistic(()=>{const local=input; effects.push(local);});`, false},
		{"module value", `task.optimistic(()=>effects.push(moduleValue));`, false},
		{"ordinary helper", `const local="server"; optimistic(()=>effects.push(local));`, false},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(test.name+string(target), func(t *testing.T) {
				parameter, argument := "input:string", `"client"`
				if test.name == "destructured task input" {
					parameter, argument = "{input}:{input:string}", `{input:"client"}`
				}
				response := NewSession().Execute(Request{ID: "optimistic-capture.tsx", Kind: "compile", Target: target, Source: `import {TaskContext,type Component} from '@exactjs/core';
const effects:string[]=[]; const moduleValue="client";
function optimistic(work:()=>void){work();}
export function Page(this:Component<{value:string}>){this.state.value="initial";
async function load(` + parameter + `,task:TaskContext=TaskContext.server().latest()){` + test.body + `await Promise.resolve();this.state.value="complete";}
return()=> <button onClick={()=>load(` + argument + `)}>{this.state.value}</button>;}`})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				if hasDiagnosticCode(response.Diagnostics, "EXACT2001") != test.invalid {
					t.Fatalf("unexpected scope diagnostics: %#v", response.Diagnostics)
				}
				if !test.invalid && len(response.Diagnostics) != 0 {
					t.Fatalf("valid control rejected: %#v", response.Diagnostics)
				}
			})
		}
	}
}

// TestInvokedServerOptimisticOwnership checks the generated callback body on
// both targets, including an ordinary helper with the same name.
func TestInvokedServerOptimisticOwnership(t *testing.T) {
	for _, tc := range []struct {
		name, policyParameter, work string
		ordinary                    bool
	}{
		{"direct", "task", `task.optimistic(() => { this.state.value = "ownership " + "witness"; });`, false},
		{"destructured", "{ optimistic }", `optimistic(() => { this.state.value = "ownership " + "witness"; });`, false},
		{"renamed parameter", "{ optimistic: apply }", `apply(() => { this.state.value = "ownership " + "witness"; });`, false},
		{"body-local alias", "task", `const { optimistic: apply } = task; apply(() => { this.state.value = "ownership " + "witness"; });`, false},
		{"ordinary callback", "task", `optimistic(() => { this.state.value = "ownership " + "witness"; });`, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			source := `import { TaskContext, type Component } from "@exactjs/core";
function optimistic(work: () => void) { work(); }
export function Panel(this: Component<{ value: string }>) {
 this.state.value = "initial";
 const run = async (` + tc.policyParameter + `: TaskContext = TaskContext.server().latest()) => {
  ` + tc.work + `
  await Promise.resolve();
  this.state.value = "complete";
 };
 return () => <button onClick={() => run()}>{this.state.value}</button>;
}`
			for _, target := range []Target{TargetClient, TargetServer} {
				result := NewSession().Execute(Request{ID: "optimistic-owner.tsx", Kind: "compile", Target: target, Source: source})
				if result.Error != "" || result.Code == "" || len(result.Diagnostics) != 0 {
					t.Fatalf("%s compilation failed: %s %#v", target, result.Error, result.Diagnostics)
				}
				want := 0
				if (target == TargetServer) == tc.ordinary {
					want = 1
				}
				if count := strings.Count(result.Code, `"ownership " + "witness"`); count != want {
					t.Fatalf("%s contains %d copies of the callback body, want %d:\n%s", target, count, want, result.Code)
				}
			}
		})
	}
}
