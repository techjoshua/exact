package exactcompiler

import "testing"

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
