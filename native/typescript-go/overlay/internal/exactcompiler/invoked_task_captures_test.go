package exactcompiler

import (
	"fmt"
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

// Executor dependency reads must retain authored types for computed keys,
// callback inference and narrowing. Invalid controls preserve the same obligations.
func TestInvokedTaskCapturedTypeObligations(t *testing.T) {
	for _, c := range []struct{ name, valid, invalid, code string }{
		{"direct-key", `this.state.value=this.state.table[props.key];`, `this.state.value=this.state.table[props.badKey];`, "TS7053"},
		{"literal-key", `this.state.value=this.state.table[props['key']];`, `this.state.value=this.state.table[props['badKey']];`, "TS7053"},
		{"computed-prop", `const field='key';this.state.value=this.state.table[props[field]];`, `const field='badKey';this.state.value=this.state.table[props[field]];`, "TS7053"},
		{"local-key", `const key=props.key;this.state.value=this.state.table[key];`, `const key=props.badKey;this.state.value=this.state.table[key];`, "TS7053"},
		{"destructured-key", `const {key}=props;this.state.value=this.state.table[key];`, `const {badKey}=props;this.state.value=this.state.table[badKey];`, "TS7053"},
		{"callback", `this.state.text=props.rows.map(value=>value.toFixed()).join(',');`, `this.state.text=props.rows.map(value=>value.toUpperCase()).join(',');`, "TS2339"},
		{"nullable", `const value=props.maybe;if(value!==null)this.state.text=value.toUpperCase();`, `const value=props.maybe;this.state.text=value.toUpperCase();`, "TS18047"},
		{"discriminated", `const choice=props.choice;if(choice.kind==='number')this.state.value=choice.value;else this.state.text=choice.value;`, `const choice=props.choice;if(choice.kind==='text')this.state.value=choice.value;`, "TS2322"},
		{"readonly", `const rows=props.rows;this.state.value=rows[0];`, `const rows=props.rows;rows.push(1);`, "TS2339"},
	} {
		for _, placement := range []string{"client", "server"} {
			for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
				for _, invalid := range []bool{false, true} {
					t.Run(fmt.Sprintf("%s/%s/%s/invalid=%t", c.name, placement, target, invalid), func(t *testing.T) {
						body := c.valid
						if invalid {
							body = c.invalid
						}
						kind := "compile"
						if target == TargetDefault {
							kind = "check"
						}
						r := NewSession().Execute(Request{Kind: kind, ID: "capture-obligations.tsx", Target: target, Diagnostics: "semantic", Source: `import {TaskContext,type Component} from '@exactjs/core';export function Probe(this:Component<{value:number;text:string;table:{first:number;second:number}}>,props:{key:'first'|'second';badKey:'missing';rows:readonly number[];maybe:string|null;choice:{kind:'number';value:number}|{kind:'text';value:string}}){this.state.value=0;this.state.text='';this.state.table={first:1,second:2};function run(task:TaskContext=TaskContext.` + placement + `()){` + body + `}return()=> <button onClick={()=>run()}>{this.state.value}:{this.state.text}</button>;}`})
						if r.Error != "" || hasDiagnosticCode(r.Diagnostics, c.code) != invalid || (!invalid && len(r.Diagnostics) != 0) {
							t.Fatalf("capture constraint changed: %s %#v", r.Error, r.Diagnostics)
						}
					})
				}
			}
		}
	}
}
