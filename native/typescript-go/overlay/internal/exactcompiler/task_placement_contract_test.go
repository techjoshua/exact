package exactcompiler

import (
	"fmt"
	"testing"
)

// Placement and suspension must preserve authored task policies and transport only server work.
func TestTaskPlacementSuspensionAndNestedContracts(t *testing.T) {
	for _, placement := range []string{"client", "server", "inferred"} {
		for _, suspended := range []bool{false, true} {
			for _, nested := range []bool{false, true} {
				for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
					t.Run(fmt.Sprintf("%s/suspended=%t/nested=%t/%s", placement, suspended, nested, target), func(t *testing.T) {
						policy := "TaskContext"
						if placement != "inferred" {
							policy += "." + placement + "()"
						}
						expression := "value + suffix"
						if suspended {
							expression = "await Promise.resolve(value + suffix)"
						}
						inner := ""
						if nested {
							inner = `function child(value:string,task:TaskContext=` + policy + `.latest().blocking()){return value+suffix;}`
							expression = "child(value)"
							if suspended {
								expression = "await child(value)"
							}
						}
						source := `import {TaskContext,type Component} from '@exactjs/core';
export function Page(this:Component<{label:string}>,suffix:string){this.state.label='initial';` + inner + `
async function run(value:string,task:TaskContext=` + policy + `.latest().blocking()){
this.state.label=` + expression + `;return this.state.label;}
return()=> <button onClick={()=>run('next')}>{this.state.label}</button>;}`
						response := NewSession().Execute(Request{Kind: "compile", ID: "placement-controls.tsx", Source: source, Target: target})
						if response.Error != "" {
							t.Fatal(response.Error)
						}
						for _, d := range response.Diagnostics {
							if d.Severity == "error" {
								t.Fatalf("valid task rejected: %#v", response.Diagnostics)
							}
						}
						expected := 1
						if nested {
							expected = 2
						}
						if len(response.Analysis.Tasks) != expected {
							t.Fatalf("lost task definitions: %#v", response.Analysis.Tasks)
						}
						for _, task := range response.Analysis.Tasks {
							requested := placement
							if requested == "inferred" {
								requested = ""
							}
							if task.RequestedPlacement != requested {
								t.Fatalf("lost placement: %#v", task)
							}
							if task.Concurrency != "latest" || task.Readiness != "blocking" {
								t.Fatalf("lost policy: %#v", task)
							}
						}
						if placement == "server" && len(response.Analysis.Continuations) != expected {
							t.Fatalf("lost server transport: %#v", response.Analysis.Continuations)
						}
						if placement == "client" && len(response.Analysis.Continuations) != 0 {
							t.Fatalf("client-only work acquired server transport: %#v", response.Analysis.Continuations)
						}
					})
				}
			}
		}
	}
}
