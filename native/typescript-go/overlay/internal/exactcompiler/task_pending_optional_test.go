package exactcompiler

import (
	"strings"
	"testing"
)

// Collection work selects an invocation facade before optional reads. Scalar-only
// task witnesses cannot exercise this lowering, even when they contain the same syntax.
func TestTaskPendingOptionalInvocationSource(t *testing.T) {
	for _, test := range []struct{ name, work string }{
		{"absent-argument", `this.state.values.push(0);const consume=(value?:number)=>value??1;const absent=undefined as {value:number}|undefined;this.state.trace=String(consume?.(absent?.value));`},
		{"present-argument", `this.state.values.push(0);this.state.nested.count=7;const consume=(value?:number)=>value??1;this.state.trace=String(consume?.(this.state.nested?.count));`},
		{"computed-argument", `this.state.lookup.set("x",9);this.state.nested.count=1;const labels=["zero","one"];this.state.trace=String(labels?.[this.state.nested?.count]);`},
		{"native-argument", `this.state.values=[3,7];this.state.values.push(0);this.state.nested.count=1;this.state.trace=String(this.state.values?.at(this.state.nested?.count));`},
		{"native-receivers", `this.state.values=[];const length=this.state.values?.push(9);const owner=this.state.lookup?.set("x",9);this.state.trace=length+":"+(owner===this.state.lookup)+":"+owner?.get("x");`},
		{"delete", `this.state.lookup.set("x",9);const nested=this.state.nested as {count?:number};let keys=0;const absent=null as {count?:number}|null;const skipped=delete absent?.[String(++keys) as "count"];const removed=delete nested?.count;this.state.trace=skipped+":"+removed+":"+keys+":"+nested.count;`},
		{"helper", `this.state.lookup.set("x",9);this.state.count=9;const read=(owner:{count:number})=>owner.count;this.state.trace=String(read?.(this.state));`},
		{"chain", `this.state.values=[];this.state.values.push(1);let calls=0;const absent=()=>null as {nested:{count:number}}|null;const omitted=absent()?.[String(++calls) as "nested"].count;const present=()=>({nested:undefined as {count:number}|undefined});let failure="";try{present()?.nested!.count;}catch{failure="throw";}this.state.trace=this.state.values?.length+":"+calls+":"+omitted+":"+failure;`},
		{"non-null-absent", `this.state.lookup.set("x",9);const absent=()=>null as {nested:{count:number}}|null;this.state.trace=String(absent()?.nested!.count);`},
		{"non-null-parentheses", `this.state.lookup.set("x",9);const absent=()=>null as {nested:{count:number}}|null;let failure="";try{(absent()?.nested)!.count;}catch{failure="throw";}this.state.trace=failure;`},
		{"optional-computed-absent", `this.state.lookup.set("x",9);let keys=0;const key=()=>{keys++;return "nested" as const;};const result=this.state.outer?.[key()]!.count;this.state.trace=String(result)+":"+keys;`},
		{"optional-computed-present", `this.state.lookup.set("x",9);this.state.outer={nested:{count:7}};let keys=0;const key=()=>{keys++;return "nested" as const;};const result=this.state.outer?.[key()]!.count;this.state.trace=String(result)+":"+keys;`},
		{"non-null-before-member", `this.state.lookup.set("x",9);this.state.trace=String(this.state.outer?.nested!.count);`},
		{"non-null-captured", `this.state.lookup.set("x",9);this.state.trace=String(this.state.nested.deep?.count!.toString());`},
		{"non-null-computed", `this.state.lookup.set("x",9);this.state.trace=String(this.state.nested.deep?.["count"]!.toString());`},
		{"non-null-alias", `const holder=this.state.nested;this.state.lookup.set("x",9);this.state.trace=String(holder.deep?.count!.toString());`},
		{"optional-state-call", `this.state.lookup.set("x",9);this.state.trace=String(this.state.nested.deep?.count.toFixed(1));`},
		{"non-null-state", `this.state.lookup.set("x",9);const clear=()=>{this.state.nested.deep=undefined;};clear();this.state.trace=String(this.state.nested.deep?.count!.toString());`},
		{"non-null-present", `this.state.lookup.set("x",9);const present=()=>({nested:{count:7}});this.state.trace=String(present()?.nested!.count);`},
		{"property", `this.state.values=[];this.state.values.push(1);this.state.trace=String(this.state.values?.length);`},
		{"ordinary", `this.state.lookup.set("x",9);const reader:{value?:{count:number}}={};const value=reader.value?.count;this.state.trace=String(value);`},
	} {
		for _, placement := range []string{"client", "server"} {
			t.Run(placement+"/"+test.name, func(t *testing.T) {
				source := `import {TaskContext,type Component} from '@exactjs/core';
export function Probe(this:Component<{count:number;values:number[];lookup:Map<string,number>;nested:{count:number;deep?:{count:number}};outer:{nested:{count:number}|undefined}|null;trace:string}>){
this.state.count=0;this.state.values=[];this.state.lookup=new Map();this.state.nested={count:0};this.state.outer=null;this.state.trace='';
const run=async(task:TaskContext=TaskContext.` + placement + `().blocking())=>{` + test.work + `};
return()=> <button onClick={()=>run()}>{this.state.trace}</button>;}`
				for _, target := range []Target{TargetClient, TargetServer} {
					response := NewSession().Execute(Request{Kind: "compile", ID: "pending-optional.tsx", Source: source, Target: target})
					if response.Error != "" {
						t.Fatal(response.Error)
					}
					for _, diagnostic := range response.Diagnostics {
						if diagnostic.Severity == "error" {
							t.Fatalf("valid optional task rejected: %#v", response.Diagnostics)
						}
					}
				}
			})
		}
	}
}

// Setup aliases must remain writable in a module-owned executor, while optional
// receiver snapshots leave continuation in its body and retain member checking.
func TestTaskOptionalSetupAliasSource(t *testing.T) {
	source := `import {TaskContext,type Component} from '@exactjs/core';
export function Probe(this:Component<{lookup:Map<string,number>;nested:{count:number;deep?:{count:number}};outer:{nested:{count:number}|undefined}|null;trace:string}>){
this.state.lookup=new Map();this.state.nested={count:0,deep:{count:0}};this.state.trace='';
const holder=this.state.nested;const reset=()=>{holder.deep=undefined;};reset();
const run=async(task:TaskContext=TaskContext.server().blocking())=>{this.state.lookup.set("x",9);this.state.trace=String(holder.deep?.count!.toString());};
void run();return()=> <output>{this.state.trace}</output>;}`
	for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
		for _, invalid := range []bool{false, true} {
			input := source
			if invalid {
				input = strings.Replace(source, "?.count!", "?.missing!", 1)
			}
			kind := "compile"
			if target == TargetDefault {
				kind = "check"
			}
			response := NewSession().Execute(Request{Kind: kind, ID: "optional-alias.tsx", Source: input, Target: target, Diagnostics: "semantic"})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if hasDiagnosticCode(response.Diagnostics, "TS2339") != invalid {
				t.Fatalf("%s invalid=%v: %#v", target, invalid, response.Diagnostics)
			}
			if !invalid {
				for _, d := range response.Diagnostics {
					if d.Severity == "error" {
						t.Fatalf("valid source rejected: %#v", response.Diagnostics)
					}
				}
			}
		}
	}
}
