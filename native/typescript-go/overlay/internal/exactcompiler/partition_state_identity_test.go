package exactcompiler

import (
	"strings"
	"testing"
)

func TestPartitionStateSnapshotPreservesPropertyBoundaries(t *testing.T) {
	for _, body := range []string{
		`return()=> <button onClick={()=>{this.state['a.b']++;this.state.a.b++;}}>{this.state['a.b']}:{this.state.a.b}</button>;`,
		`const label=this.state.a.b;return()=> <button onClick={()=>{this.state['a.b']++;}}>{this.state['a.b']}:{label}</button>;`,
		`const label=this.state['a.b'];return()=> <button onClick={()=>{this.state.a.b++;}}>{label}:{this.state.a.b}</button>;`,
	} {
		source := `import {type Component} from '@exactjs/core';export function Probe(this:Component<{'a.b':number,a:{b:number}}>) {this.state['a.b']=1;this.state.a={b:2};` + body + `}`
		response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/identity.tsx", Target: TargetServer, ServerComponents: true, Source: source})
		if response.Error != "" || len(response.Diagnostics) != 0 {
			t.Fatalf("valid state paths rejected: %s %#v", response.Error, response.Diagnostics)
		}
		// Hydration must receive both distinct values, including transitively derived captures.
		if !strings.Contains(response.Code, `"a.b": this.state["a.b"]`) || !strings.Contains(response.Code, `b: this.state.a.b`) {
			t.Fatalf("island snapshot conflated distinct property paths:\n%s", response.Code)
		}
	}
}

func TestTaskLocalReadsDoNotConflateLiteralAndNestedPaths(t *testing.T) {
	for _, body := range []string{
		`this.state['a.b']=10;this.state.trace=String(this.state.a.b);`,
		`this.state.a.b=10;this.state.trace=String(this.state['a.b']);`,
	} {
		response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/identity-task.tsx", Source: `import {TaskContext,type Component} from '@exactjs/core';export function Probe(this:Component<{'a.b':number,a:{b:number},trace:string}>){this.state['a.b']=1;this.state.a={b:2};this.state.trace='';const run=async(task:TaskContext=TaskContext.client().blocking())=>{` + body + `};void run();return()=> <output>{this.state.trace}</output>;}`})
		if response.Error != "" || len(response.Diagnostics) != 0 {
			t.Fatalf("valid task rejected: %s %#v", response.Error, response.Diagnostics)
		}
		if len(response.Analysis.Tasks) != 1 {
			t.Fatalf("expected task: %#v", response.Analysis.Tasks)
		}
		found := false
		for _, dep := range response.Analysis.Tasks[0].Dependencies {
			if dep.Path == "this.state.a.b" {
				found = true
			}
		}
		if !found {
			t.Fatalf("an unrelated write suppressed an activation input: %#v", response.Analysis.Tasks[0].Dependencies)
		}
	}
}
