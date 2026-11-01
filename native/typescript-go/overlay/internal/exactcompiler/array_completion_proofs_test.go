package exactcompiler

import (
	"strings"
	"testing"
)

// Root and leaf authority remain distinct from checker-owned Array ancestry.
func TestArrayCompletionProofsAndBindings(t *testing.T) {
	cases := []struct {
		name, shape, helper, body, path string
		root                            bool
	}{
		{"direct root", "{rows:{label:string}[]}", "", `this.state.rows.push({label:"C"});`, "rows", true},
		{"helper root", "{rows:{label:string}[]}", `function update(s:{rows:{label:string}[]}){s.rows.push({label:"C"});}`, `update(this.state);`, "rows", true},
		{"direct member", "{rows:{label:string}[]}", "", `this.state.rows[0]!.label="C";`, "rows.0.label", false},
		{"helper member", "{rows:{label:string}[]}", `function update(s:{rows:{label:string}[]}){s.rows[0]!.label="C";}`, `update(this.state);`, "rows.0.label", false},
		{"replacement join", "{rows:{label:string}[]}", "", `this.state.rows=[{label:"R"}];this.state.rows.push({label:"C"});`, "rows", true},
		{"tuple member", "{rows:[{label:string},{label:string}]}", "", `this.state.rows[0].label="C";`, "rows.0.label", false},
		{"nested typed prefix", "{rows:{values:number[]}[]}", "", `this.state.rows[0]!.values.push(2);`, "rows.0.values", true},
		{"direct Array union push", "{rows:number[]|(number|string)[]}", "", `this.state.rows.push(2);`, "rows", true},
		{"helper Array union push", "{rows:number[]|(number|string)[]}", `function update(s:{rows:number[]|(number|string)[]}){s.rows.push(2);}`, `update(this.state);`, "rows", true},
		{"direct tuple union push", "{rows:[number]|[number,number]}", "", `this.state.rows.push(2);`, "rows", true},
		{"helper tuple union push", "{rows:[number]|[number,number]}", `function update(s:{rows:[number]|[number,number]}){s.rows.push(2);}`, `update(this.state);`, "rows", true},
		{"Array tuple union reverse", "{rows:number[]|[number,number]}", "", `this.state.rows.reverse();`, "rows", true},
		{"helper Array union reverse", "{rows:number[]|(number|string)[]}", `function update(s:{rows:number[]|(number|string)[]}){s.rows.reverse();}`, `update(this.state);`, "rows", true},
		{"member union", "{rows:{label:string}[]|[{label:string}]}", "", `this.state.rows[0]!.label="C";`, "rows.0.label", false},
	}
	for _, candidate := range cases {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(candidate.name+"/"+string(target), func(t *testing.T) {
				source := `import {TaskContext,type Component} from '@exactjs/core';` + candidate.helper + `export function Page(this:Component<` + candidate.shape + `>){async function run(task:TaskContext=TaskContext.server().parallel()){` + candidate.body + `}return()=> <button onClick={()=>run()}>Run</button>;}`
				response := NewSession().Execute(Request{Kind: "compile", ID: "array-completion.tsx", Source: source, Target: target, Diagnostics: "semantic"})
				assertReactiveCompilation(t, response, source)
				found := false
				for _, task := range response.Analysis.Tasks {
					for _, effect := range task.Writes {
						if effect.Path == candidate.path && effect.Confidence == "exact" {
							for _, proof := range effect.ArrayRoots {
								if proof.Kind == "array" && strings.Join(proof.Path, ".") == "rows" {
									found = true
								}
							}
						}
					}
				}
				if !found {
					t.Fatalf("missing exact Array prefix without changing authority: %#v", response.Analysis.Tasks)
				}
				if strings.Contains(response.Code, "selectedArray") {
					t.Fatal("obsolete response witness retained")
				}
				client := strings.Contains(response.Code, "captureArraySubmission")
				server := strings.Contains(response.Code, "diffArrayCompletion")
				if target == TargetClient && (!client || server) {
					t.Fatalf("client binding reachability: %s", response.Code)
				}
				if target == TargetServer && (client || server != candidate.root) {
					t.Fatalf("server binding reachability: %s", response.Code)
				}
			})
		}
	}
}

// A mixed receiver cannot gain Array proof merely because one union constituent is an Array.
func TestArrayCompletionMixedReceivers(t *testing.T) {
	for _, shape := range []string{"number[]|{value:number}", "unknown", "any"} {
		t.Run(shape, func(t *testing.T) {
			source := `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{rows:` + shape + `}>){async function run(task:TaskContext=TaskContext.server().parallel()){this.state.rows=this.state.rows;}return()=> <button onClick={()=>run()}>Run</button>;}`
			response := NewSession().Execute(Request{Kind: "compile", ID: "array-mixed.tsx", Source: source, Target: TargetClient, Diagnostics: "semantic"})
			assertReactiveCompilation(t, response, source)
			for _, task := range response.Analysis.Tasks {
				for _, effect := range task.Writes {
					if len(effect.ArrayRoots) != 0 {
						t.Fatalf("unproven mixed Array root: %#v", effect)
					}
				}
			}
			if strings.Contains(response.Code, "captureArraySubmission") {
				t.Fatal("mixed receiver retained Array engine")
			}
		})
	}
}
