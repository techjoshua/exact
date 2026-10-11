package exactcompiler

import (
	"strings"
	"testing"
)

// Caller constraints must survive task binding, including inferred defaults and
// overloaded definitions. Invalid controls distinguish preserved typing from erasure.
func TestTaskSignatureMatrix(t *testing.T) {
	for _, c := range []struct {
		name, definition, argument string
		invalid                    bool
	}{
		{"nullable-default", `function run(value:string|null=null,task:TaskContext=TaskContext.client()){return value;}`, `null`, false},
		{"undefined-default", `function run(value:number|undefined=undefined,task:TaskContext=TaskContext.client()){return value;}`, `undefined`, false},
		{"inferred-default", `function run(value=1,task:TaskContext=TaskContext.client()){return value;}`, `2`, false},
		{"invalid-inferred-default", `function run(value=1,task:TaskContext=TaskContext.client()){return value;}`, `'bad'`, true},
		{"required-after-default", `function run(offset=1,value:number,task:TaskContext=TaskContext.client()){return offset+value;}`, `undefined,2`, false},
		{"invalid-required-after-default", `function run(offset=1,value:number,task:TaskContext=TaskContext.client()){return offset+value;}`, `undefined,'bad'`, true},
		{"destructured-default", `function run({value}={value:1},task:TaskContext=TaskContext.client()){return value;}`, `{value:2}`, false},
		{"invalid-destructured-default", `function run({value}={value:1},task:TaskContext=TaskContext.client()){return value;}`, `{value:'bad'}`, true},
		{"overloaded-number", `function run(value:number):number;function run(value:string):string;function run(value:number|string,task:TaskContext=TaskContext.client()){return value;}`, `2`, false},
		{"overloaded-string", `function run(value:number):number;function run(value:string):string;function run(value:number|string,task:TaskContext=TaskContext.client()){return value;}`, `'ok'`, false},
		{"invalid-overloaded", `function run(value:number):number;function run(value:string):string;function run(value:number|string,task:TaskContext=TaskContext.client()){return value;}`, `true`, true},
		{"tuple-spread", `function run(value:number,task:TaskContext=TaskContext.client()){return value;}`, `...([2] as const)`, false},
		{"invalid-tuple-spread", `function run(value:number,task:TaskContext=TaskContext.client()){return value;}`, `...(['bad'] as const)`, true},
	} {
		t.Run(c.name, func(t *testing.T) {
			for _, target := range []Target{TargetClient, TargetServer} {
				r := NewSession().Execute(Request{Kind: "compile", ID: "signature-matrix.tsx", Target: target, Diagnostics: "semantic", Source: `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;` + c.definition + `run(` + c.argument + `);return()=> <button onClick={()=>run(` + c.argument + `)}>Run</button>;}`})
				if r.Error != "" {
					t.Fatal(r.Error)
				}
				if (len(r.Diagnostics) != 0) != c.invalid {
					for _, d := range r.Diagnostics {
						t.Logf("%s %s", d.Code, d.Message)
					}
					t.Fatalf("%s invalid=%t count=%d", target, c.invalid, len(r.Diagnostics))
				}
			}
		})
	}
}

// Rest helpers remain ordinary JavaScript, while task activation needs fixed positions.
func TestTaskRestActivationDiagnostic(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "rest-task.tsx", Target: target, Diagnostics: "semantic", Source: `import {type Component} from '@exactjs/core';export function Page(this:Component<{value:number}>){this.state.value=0;const run=(...values:number[])=>{this.state.value=values.reduce((total,value)=>total+value,0);};run(1,2,3);return()=> <output>{this.state.value}</output>;}`})
		found := false
		for _, d := range r.Diagnostics {
			if d.Code == "EXACT2001" && strings.Contains(d.Message, "fixed argument positions") && strings.Contains(d.Message, "array input") {
				found = true
			}
		}
		if !found || r.Code != "" {
			t.Fatalf("rest limitation not diagnosed before emission: %#v", r.Diagnostics)
		}
		corrected := NewSession().Execute(Request{Kind: "compile", ID: "rest-task-fixed.tsx", Target: target, Diagnostics: "semantic", Source: `import {TaskContext,type Component} from '@exactjs/core';function sum(...values:number[]){return values.reduce((total,value)=>total+value,0);}export function Page(this:Component<{value:number}>){this.state.value=0;const run=(values:number[],task:TaskContext=TaskContext.client())=>{this.state.value=sum(...values);};run([1,2,3]);return()=> <output>{this.state.value}</output>;}`})
		if corrected.Error != "" || len(corrected.Diagnostics) != 0 {
			t.Fatalf("suggested correction failed: %s %#v", corrected.Error, corrected.Diagnostics)
		}
	}
}
