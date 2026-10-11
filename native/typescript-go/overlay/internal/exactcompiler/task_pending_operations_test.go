package exactcompiler

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

// Pending invocation lowering must preserve native expression semantics as well
// as state publication. Collection work ensures these are invocation-cell paths.
func TestTaskPendingOperationSources(t *testing.T) {
	for _, c := range []struct{ name, definitions, work string }{
		{"object-copy", "", `const copy={...{value:this.state.count}};this.state.trace=String(copy.value);`},
		{"delete-member", "", `const local:{value?:number}={value:1};this.state.trace=String(delete local.value)+":"+local.value;`},
		{"delete-computed", "", `const local:{value?:number}={value:1};const key="value";this.state.trace=String(delete local[key])+":"+local[key];`},
		{"array-spread", "", `this.state.values.push(2);const copy=[...this.state.values];this.state.trace=copy.join(",");`},
		{"for-of", "", `this.state.values.push(2);let total=0;for(const value of this.state.values)total+=value;this.state.trace=String(total);`},
		{"inline-member", "", `const helper={step:(value:number)=>{this.state.count+=value;return this.state.count;}};this.state.trace=String(helper.step(2));`},
		{"ordinary-compound-await", "", `const local={value:1};const result=(local.value+=await Promise.resolve(2));this.state.trace=result+":"+local.value;`},
		{"ordinary-logical", "", `const local={value:0};local.value||=2;local.value&&=3;this.state.trace=String(local.value);`},
		{"private-field-initializer", "", `class Local{#value=1;result=(this.#value+=2);read(){return this.#value;}}const local=new Local();this.state.trace=local.result+":"+local.read();`},
		{"private-call-initializer", "", `class Local{#value=1;#read(){return this.#value;}result=this.#read();}this.state.trace=String(new Local().result);`},
		{"private-getter-order", "", `const log:string[]=[];class Local{#value=1;get #read(){log.push("get");return function(this:Local,value:number){log.push("call");return this.#value+value;};}result=(log.push("receiver"),this).#read((log.push("argument"),2));}const local=new Local();this.state.trace=log.join(",")+":"+local.result;`},
		{"private-arrow-initializer", "", `class Local{#value=1;#read=(value:number)=>this.#value+value;result=this.#read(2);}this.state.trace=String(new Local().result);`},
		{"private-static-initializer", "", `class Local{static #value=1;static #read(){return this.#value;}static result=this.#read();}this.state.trace=String(Local.result);`},
		{"private-optional-call", "", `class Local{#value=1;#read(){return this.#value;}result=this.#read?.();}this.state.trace=String(new Local().result);`},
		{"private-optional-absent", "", `const log:string[]=[];class Local{get #read():((value:number)=>number)|undefined{log.push("get");return undefined;}result=this.#read?.((log.push("argument"),2));}const local=new Local();this.state.trace=log.join(",")+":"+local.result;`},
		{"private-optional-getter", "", `const log:string[]=[];class Local{#value=1;get #read(){log.push("get");return function(this:Local,value:number){log.push("call");return this.#value+value;};}result=(log.push("receiver"),this).#read?.((log.push("argument"),2));}const local=new Local();this.state.trace=log.join(",")+":"+local.result;`},
		{"private-state-arguments", "", `class Local{#value=1;#read(owner:{count:number}){owner.count+=this.#value;return owner.count;}result=this.#read(thisState);}const thisState=this.state;this.state.trace=String(new Local().result)+":"+this.state.count;`},
		{"private-tag-initializer", "", "class Local{#value=1;#tag(strings:TemplateStringsArray,value:number){return this.#value+value;}result=this.#tag`value:${2}`;}this.state.trace=String(new Local().result);"},
		{"optional-callable-guard", "", `const receiver:{read?:()=>number}={read:()=>this.state.count};if(receiver.read)this.state.trace=String(receiver.read());`},
		{"bound-helper", `function add(this:{value:number},value:number){this.value+=value;return this.value;}`, `const local={value:1};const step=add.bind(local);this.state.trace=String(step(2));`},
		{"returned-callable", `function make(value:number){return()=>value+1;}`, `this.state.trace=String(make(this.state.count)());`},
		{"bare-tag", `function tag(strings:TemplateStringsArray,value:number){return strings.raw[0]+value;}`, "this.state.trace=tag`value:${this.state.count}`;"},
		{"member-tag", "", "const tags={tag(strings:TemplateStringsArray,value:number){return strings[0]+value;}};this.state.trace=tags.tag`value:${this.state.count}`;"},
		{"computed-tag", "", "const tags={get tag(){return function(this:object,strings:TemplateStringsArray,value:number){return strings[0]+value;};}};const key='tag';this.state.trace=tags[key]`value:${this.state.count}`;"},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			for _, inspection := range []bool{false, true} {
				t.Run(fmt.Sprintf("%s/%s/inspection=%t", c.name, target, inspection), func(t *testing.T) {
					source := `import {TaskContext,type Component} from '@exactjs/core';` + c.definitions + `export function Probe(this:Component<{count:number;values:number[];trace:string}>){this.state.count=0;this.state.values=[];this.state.trace='';const run=async(task:TaskContext=TaskContext.client().blocking())=>{this.state.values.push(0);` + c.work + `};return()=> <button onClick={()=>run()}>{this.state.trace}</button>;}`
					response := NewSession().Execute(Request{Kind: "compile", ID: "pending-operations.tsx", Source: source, Target: target, Diagnostics: "semantic", InstrumentInspection: inspection})
					if response.Error != "" || len(response.Diagnostics) != 0 || response.Code == "" {
						t.Fatalf("valid pending operation rejected: %s %#v", response.Error, response.Diagnostics)
					}
					if len(response.Analysis.Tasks) != 1 || response.Analysis.Tasks[0].Placement != "client" {
						t.Fatalf("pending task ownership changed: %#v", response.Analysis.Tasks)
					}
				})
			}
		}
	}
}

// Namespace exports remain module-owned, including live reads during pending work.
// Their readonly import contract must not turn into a writable invocation slot.
func TestTaskPendingNamespaceSources(t *testing.T) {
	root, err := os.MkdirTemp(".", ".exact-pending-namespace-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(root) })
	root, err = filepath.Abs(root)
	if err != nil {
		t.Fatal(err)
	}
	helper := filepath.Join(root, "helper.ts")
	if err := os.WriteFile(helper, []byte(`export let current=1;export function advance(){current++;}`), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, invalid := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/invalid=%t", target, invalid), func(t *testing.T) {
				work := `helper.advance();this.state.trace=String(helper.current)+":"+helper["current"];`
				if invalid {
					work = `helper.current=2;`
				}
				response := NewSession().Execute(Request{Kind: "compile", Root: root, ID: filepath.Join(root, "probe.tsx"), Target: target, Diagnostics: "semantic", Source: `import {TaskContext,type Component} from '@exactjs/core';import * as helper from './helper.js';export function Probe(this:Component<{values:number[];trace:string}>){this.state.values=[];this.state.trace='';const run=async(task:TaskContext=TaskContext.client().blocking())=>{this.state.values.push(0);` + work + `};return()=> <button onClick={()=>run()}>{this.state.trace}</button>;}`})
				if response.Error != "" || hasDiagnosticCode(response.Diagnostics, "TS2540") != invalid || (!invalid && len(response.Diagnostics) != 0) {
					t.Fatalf("namespace contract changed: %s %#v", response.Error, response.Diagnostics)
				}
			})
		}
	}
}

// Private call selection preserves authored argument and callback obligations.
func TestTaskPendingPrivateCallConstraints(t *testing.T) {
	for _, optional := range []bool{false, true} {
		for _, callback := range []bool{false, true} {
			for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
				for _, invalid := range []bool{false, true} {
					t.Run(fmt.Sprintf("%s/optional=%t/callback=%t/invalid=%t", target, optional, callback, invalid), func(t *testing.T) {
						signature, argument, code := `value:number`, `2`, "TS2345"
						if invalid {
							argument = `"bad"`
						}
						if callback {
							signature = `read:(value:number)=>string`
							argument = `value=>value.toFixed()`
							code = "TS2339"
							if invalid {
								argument = `value=>value.toUpperCase()`
							}
						}
						invocation := ""
						if optional {
							invocation = "?."
						}
						kind := "compile"
						if target == TargetDefault {
							kind = "check"
						}
						source := `import {TaskContext,type Component} from '@exactjs/core';export function Probe(this:Component<{values:number[];trace:string}>){this.state.values=[];this.state.trace='';const run=async(task:TaskContext=TaskContext.client().blocking())=>{this.state.values.push(0);class Local{#read(` + signature + `){return 1;}result=this.#read` + invocation + `(` + argument + `);}this.state.trace=String(new Local().result);};return()=> <button onClick={()=>run()}>{this.state.trace}</button>;}`
						r := NewSession().Execute(Request{Kind: kind, ID: "private-pending-types.tsx", Source: source, Target: target, Diagnostics: "semantic"})
						if r.Error != "" || hasDiagnosticCode(r.Diagnostics, code) != invalid || (!invalid && len(r.Diagnostics) != 0) {
							t.Fatalf("private call obligations changed: %s %#v", r.Error, r.Diagnostics)
						}
					})
				}
			}
		}
	}
}
