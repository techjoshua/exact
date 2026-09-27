package exactcompiler

import (
	"testing"
)

func TestInvokedTaskCaptureOwnership(t *testing.T) {
	for _, fixture := range []struct {
		name, props, setup, body string
		captures                 int
	}{
		{"members", "props: {left:string;right:string;unused:()=>void}", "", "this.state.value = props.left + props.right + props.left;", 3},
		{"destructured", "{left,right}: {left:string;right:string}", "", "this.state.value = left + right;", 2},
		{"derived", "props: {left:string}", "const label = props.left.toUpperCase();", "this.state.value = label;", 1},
		{"nested function", "props: {left:string}", "", "this.state.value = (function() { return props.left; })();", 1},
		{"shadowed", "props: {left:string}", "", "const props = {left:'local'}; this.state.value = props.left;", 0},
		{"method receiver", "props: {left:string}", "", "this.state.value = props.left.toUpperCase();", 1},
	} {
		t.Run(fixture.name, func(t *testing.T) {
			response := NewSession().Execute(Request{ID: "capture.tsx", Kind: "compile", Target: TargetServer, Source: `
import {TaskContext} from '@exactjs/core';
declare class Component<T> {state:T}
export function Example(this:Component<{value:string}>, ` + fixture.props + `) {
 ` + fixture.setup + `
 function save(input:string, task:TaskContext=TaskContext.server()) { ` + fixture.body + ` }
 return () => <button onClick={() => save('argument')}>{this.state.value}</button>;
}`})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
			}
			found := false
			for _, continuation := range response.Analysis.Continuations {
				if continuation.Invocation == nil {
					continue
				}
				found = true
				if len(continuation.Invocation.Arguments) != 1 || len(continuation.Activation.Dependencies) != fixture.captures+1 {
					t.Fatalf("wrong argument/capture contract: %#v", continuation)
				}
			}
			if !found {
				t.Fatal("missing invoked continuation")
			}
		})
	}
}
