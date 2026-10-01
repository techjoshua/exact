package exactcompiler

import "testing"

func TestTaskInputsRequireCompletedDominatingWrites(t *testing.T) {
	for _, example := range []struct {
		name, work string
		input      bool
	}{
		{"sequential", "this.state.count=1;this.state.trace=String(this.state.count);", false},
		{"assignment RHS", "this.state.count=this.state.count+1;this.state.trace=String(this.state.count);", true},
		{"conditional", "if(flag)this.state.count=1;this.state.trace=String(this.state.count);", true},
		{"nested writer", "const unused=()=>{this.state.count=1};this.state.trace=String(this.state.count);", true},
		{"short circuit", "flag && (this.state.count=1);this.state.trace=String(this.state.count);", true},
		{"ternary", "flag ? (this.state.count=1) : 0;this.state.trace=String(this.state.count);", true},
		{"within conditional block", "if(flag){this.state.count=1;this.state.trace=String(this.state.count);}", false},
		{"after loop", "for(const value of [1])this.state.count=value;this.state.trace=String(this.state.count);", true},
		{"within loop block", "for(const value of [1]){this.state.count=value;this.state.trace=String(this.state.count);}", false},
		{"after try", "try{this.state.count=1;}catch{}this.state.trace=String(this.state.count);", true},
	} {
		t.Run(example.name, func(t *testing.T) {
			response := NewSession().Execute(Request{ID: "component.tsx", Kind: "analyze", Source: `
import {TaskContext} from "@exactjs/core";
declare const flag:boolean;
export function Probe(this:{state:{count:number;trace:string}}){
this.state.count=0;this.state.trace="";
const run=async(task:TaskContext=TaskContext.server().blocking())=>{` + example.work + `};
void run();return()=> <output>{this.state.trace}</output>;
}`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if len(response.Analysis.Tasks) != 1 {
				t.Fatalf("unexpected tasks: %#v", response.Analysis.Tasks)
			}
			found := false
			for _, dependency := range response.Analysis.Tasks[0].Dependencies {
				if dependency.Path == "this.state.count" {
					found = true
				}
			}
			if found != example.input {
				t.Fatalf("count input=%v, want %v: %#v", found, example.input, response.Analysis.Tasks[0].Dependencies)
			}
		})
	}
}
