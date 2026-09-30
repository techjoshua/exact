package exactcompiler

import "testing"

func TestContinuationLocaleSnapshotUsesExistingDependencyContract(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, invocation := range []string{"save('value');", "return () => <button onClick={() => save('value')}>save</button>;"} {
			response := NewSession().Execute(Request{ID: "locale-capture.tsx", Kind: "compile", Target: target, Source: `
import {TaskContext} from '@exactjs/core';
declare class Component<T> { state:T; intl: Intl }
export function Example(this:Component<{value:string}>) {
 const save = async (label:string, task:TaskContext=TaskContext.server()) => {
  this.state.value = label + this.intl.NumberFormat('en-US').format(1234.5);
 };
 ` + invocation + `
 return () => <p>{this.state.value}</p>;
}`})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
			}
			if len(response.Analysis.Continuations) == 0 {
				t.Fatal("missing continuation")
			}
			for _, continuation := range response.Analysis.Continuations {
				dependencies := continuation.Activation.Dependencies
				if len(dependencies) == 0 || dependencies[len(dependencies)-1].Path != "this.intl" {
					t.Fatalf("missing locale snapshot: %#v", continuation)
				}
			}
		}
	}
}
