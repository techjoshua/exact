package exactcompiler

import (
	"fmt"
	"strings"
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

// A neutral component task has the same platform requirements whether or not
// it writes state. Only its default initial-work scheduling differs.
func TestNeutralTaskSchedulingUsesStateWrites(t *testing.T) {
	for _, row := range []struct {
		name, work, placement string
	}{
		{"read-only", "return value", "client"},
		{"writes", "this.state.label = value; return value", "isomorphic"},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `import {TaskContext,type Component} from '@exactjs/core';
export function Page(this:Component<{label:string}>){
	this.state.label="initial";
	const run=(value:string, task:TaskContext=TaskContext.latest())=>{` + row.work + `};
	return()=> <button onClick={()=>run("next")}>{this.state.label}</button>;
}`
			r := NewSession().Execute(Request{Kind: "compile", ID: "neutral-task-scheduling.tsx", Source: source, Target: TargetClient, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" || len(r.Analysis.Tasks) != 1 {
				t.Fatalf("component task did not compile: %s %#v tasks=%d", r.Error, r.Diagnostics, len(r.Analysis.Tasks))
			}
			task := r.Analysis.Tasks[0]
			if task.RequestedPlacement != "" || task.EnvironmentEffect != "neutral" || task.BrowserEffects || task.ServerEffects || task.Placement != row.placement {
				t.Fatalf("unexpected platform effects or default scheduling: %#v", task)
			}
		})
	}
}

// Each package mode reports the decision that actually selected or refused placement.
func TestTaskPlacementReasons(t *testing.T) {
	for _, row := range []struct{ policy, work, placement, reason string }{
		{"latest", "return 1", "client", "client scheduling default"},
		{"latest", "this.state.n=1", "isomorphic", "isomorphic scheduling default"},
		{"server", "return foreign()", "server", "explicitly requested as server"},
		{"latest", "return foreign()", "unknown", "placement depends on an opaque call"},
	} {
		for _, kind := range []string{"application", "library"} {
			t.Run(kind+"/"+row.placement, func(t *testing.T) {
				source := `import {TaskContext,type Component} from '@exactjs/core';
declare function foreign():number;
export function Page(this:Component<{n:number}>){
 this.state.n=0;
 function run(task:TaskContext=TaskContext.` + row.policy + `()){` + row.work + `}
 return()=> <button onClick={()=>run()}>Run</button>;
}`
				r := NewSession().Execute(Request{Kind: "compile", ID: "task-reasons.tsx", Source: source, Target: TargetServer, PackageType: kind})
				if r.Error != "" || len(r.Analysis.Tasks) != 1 {
					t.Fatalf("missing task: %s %#v", r.Error, r.Diagnostics)
				}
				task := r.Analysis.Tasks[0]
				reasons := strings.Join(task.Diagnostics, "\n")
				if task.Placement != row.placement || hasErrorDiagnostic(r.Diagnostics) != (row.placement == "unknown") || !strings.Contains(reasons, row.reason) {
					t.Fatalf("unexpected decision: %s %q %#v", task.Placement, reasons, r.Diagnostics)
				}
				if row.placement == "unknown" || row.policy == "server" {
					if strings.Contains(reasons, "scheduling default") || strings.Contains(reasons, "on the client") {
						t.Fatalf("contradictory explanation: %s", reasons)
					}
				}
			})
		}
	}
}
