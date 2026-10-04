package exactcompiler

import (
	"fmt"
	"strings"
	"testing"
)

// Key extraction must retain authored inputs while erasing the final policy builder.
// Observable cancellation/publication is covered by the paired keyed-policy compiler journey.
func TestKeyedTaskPolicyAcrossDeclarationShapesAndTargets(t *testing.T) {
	for _, shape := range []string{"declaration", "arrow", "expression"} {
		for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
			for _, priority := range []string{"immediate", "normal", "deferred"} {
				t.Run(fmt.Sprintf("%s/%s/%s", shape, target, priority), func(t *testing.T) {
					signature := `(key:string,value:number,task:TaskContext=TaskContext.client().latest().key(key).` + priority + `().blocking())`
					body := `{await Promise.resolve();this.state.value=value;}`
					definition := `async function run` + signature + body
					if shape == "arrow" {
						definition = `const run=async ` + signature + `=>` + body + `;`
					}
					if shape == "expression" {
						definition = `const run=async function` + signature + body + `;`
					}
					response := NewSession().Execute(Request{Kind: "compile", ID: "keyed-policy.tsx", Target: target, InstrumentInspection: shape == "expression", Source: `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;` + definition + `return()=> <button onClick={()=>run('a',1)}>{this.state.value}</button>;}`})
					if response.Error != "" {
						t.Fatal(response.Error)
					}
					for _, d := range response.Diagnostics {
						if d.Severity == "error" {
							t.Fatalf("valid keyed policy rejected: %#v", response.Diagnostics)
						}
					}
					if len(response.Analysis.Tasks) != 1 {
						t.Fatalf("missing task: %#v", response.Analysis.Tasks)
					}
					task := response.Analysis.Tasks[0]
					if task.KeyLength == 0 || task.Priority != priority || task.Readiness != "blocking" || task.Concurrency != "latest" {
						t.Fatalf("lost keyed policy: %#v", task)
					}
					if target != TargetServer && !strings.Contains(response.Code, "concurrencyKey") {
						t.Fatal("key was analyzed but not emitted")
					}
				})
			}
		}
	}
}
