package exactcompiler

import (
	"fmt"
	"strings"
	"testing"
)

// Source witnesses exercise reference planning in ordinary, indexed and task lanes.
// Emitted runtime tests independently verify evaluation order, results and publication.
func TestSelectedStateWriteSourcePaths(t *testing.T) {
	cases := []struct{ name, body string }{
		{"default", `const select=(value=(this.state.item.value=2))=>value;select();`},
		{"method", `const owner=this;const calls={assign(){owner.state.item.value=2;}};calls.assign();`},
		{"reentrant", `let depth=0;const assign=()=>{this.state.item.value=++depth===1?(this.state.item={value:10},assign(),1):2;};assign();`},
		{"assign", `this.state.item.value=2;`},
		{"consumed", `const value=(this.state.item.value=2);void value;`},
		{"indexed-logical", `const owner=this;const calls={run(){owner.state.n ||= 2;owner.state.n &&=3;owner.state.n ??=4;}};calls.run();`},
		{"indexed", `this.state.n+=2;`},
		{"compound", `this.state.item.value+=2;`},
		{"or", `this.state.item.value ||= 2;`},
		{"and", `this.state.item.value &&= 2;`},
		{"nullish", `this.state.item.value ??= 2;`},
		{"prefix", `const value=++this.state.item.value;void value;`},
		{"postfix", `const value=this.state.item.value++;void value;`},
		{"delete", `delete this.state.item.optional;`},
		{"pending", `function select(item:{value:number}){return item;}select(this.state.item);const key="value" as const;this.state.item[key]+=await Promise.resolve(2);`},
		{"computed", `const key='value' as const;this.state.item[key]+=2;`},
		{"await", `this.state.item.value=await Promise.resolve(2);`},
	}
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, lane := range []string{"ordinary", "sync", "task", "blocking", "lean"} {
			if lane == "lean" && target != TargetServer {
				continue
			}
			for _, candidate := range cases {
				t.Run(string(target)+"/"+lane+"/"+candidate.name, func(t *testing.T) {
					policy := "latest()"
					if lane == "blocking" || lane == "lean" {
						policy = "blocking()"
					}
					body := `async function run(task:TaskContext=TaskContext.` + string(target) + `().` + policy + `){void task;` + candidate.body + `}`
					if lane == "ordinary" {
						body = `const run=async ()=>{` + candidate.body + `};`
					}
					if lane == "sync" && candidate.name != "await" && candidate.name != "pending" {
						body = strings.TrimPrefix(body, "async ")
					}
					render := `return()=> <button onClick={()=>run()}>{this.state.n}</button>;`
					if lane == "lean" {
						render = `run();return()=>this.state.n;`
					}
					source := `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{n:number;item:{value:number;optional?:number}}>){this.state.n=0;this.state.item={value:1};` + body + render + `}`
					response := NewSession().Execute(Request{Kind: "compile", ID: "selected-reference.tsx", Target: target, Source: source})
					if target == TargetServer && (candidate.name == "computed" || candidate.name == "pending") && (lane == "sync" || lane == "task" || lane == "blocking") {
						found := false
						for _, diagnostic := range response.Diagnostics {
							found = found || diagnostic.Code == "EXACT2001"
						}
						if !found || response.Error != "" {
							t.Fatalf("dynamic server path lost its rejection: %#v %s", response.Diagnostics, response.Error)
						}
						return
					}
					assertReactiveCompilation(t, response, source)
					if len(response.Analysis.StateWrites) < 3 {
						t.Fatalf("lost mutation analysis: %#v", response.Analysis.StateWrites)
					}
					// A publishable scalar task must retain its operation owner even in a lean artifact.
					if lane == "lean" && !strings.Contains(response.Code, "@exactjs/core/runtime/reactivity") {
						t.Fatalf("lean task omitted performed operation: %s", response.Code)
					}
				})
			}
		}
	}
}

// Setup defaults and synchronous compiler computations retain plain lean storage.
func TestSelectedStateWriteLeanSetupControl(t *testing.T) {
	response := NewSession().Execute(Request{Kind: "compile", ID: "setup-control.tsx", Target: TargetServer, Source: `import {type Component} from '@exactjs/core';export function Page(this:Component<{n:number}>){this.state.n=1;const doubled=this.state.n*2;return()=>doubled;}`})
	assertReactiveCompilation(t, response, "setup")
	if strings.Contains(response.Code, "writeReactiveLazy") {
		t.Fatalf("setup retained task write machinery: %s", response.Code)
	}
}

// These source witnesses exercise environment selection independently of emitted execution.
func TestSelectedStateWriteEvaluationEnvironments(t *testing.T) {
	cases := []struct{ name, body string }{
		{"field computed object alias", `const owner=this;const old=this.state.item;let level=0;class Assign{value={[(owner.state.item.value=++level===1?(owner.state.item={value:10},new Assign(),1):2,'run' as const)](){return 9;}};}new Assign();trace.push(old.value,this.state.item.value);`},
		{"field computed object own receiver", `const owner=this;class Assign{state={item:{value:20}};value={[(this.state.item.value+=1,'run' as const)](){return 9;}};}trace.push(new Assign().state.item.value,owner.state.item.value);`},
		{"class expression alias", `const owner=this;const Assign=class{value=(owner.state.item.value+=2);};trace.push(new Assign().value,owner.state.item.value);`},
		{"renamed component alias", `const component=this;const owner=component;class Assign{constructor(){owner.state.item.value+=2;trace.push(owner.state.item.value);}}new Assign();`},
		{"renamed state alias", `const facade=this.state;const owner=facade;class Assign{value=(owner.item.value ||=3);}trace.push(new Assign().value,owner.item.value);`},
		{"own receiver and lexical alias", `const owner=this;function assign(this:{state:{item:{value:number}}}){owner.state.item.value=4;this.state.item.value+=1;trace.push(owner.state.item.value,this.state.item.value);}assign.call({state:{item:{value:40}}});`},
		{"shadowed class alias", `const owner=this;class Assign{state={item:{value:20}};constructor(){const owner=this;owner.state.item.value+=1;trace.push(owner.state.item.value);}value=owner.state.item.value+=2;}new Assign();`},
		{"readonly nested alias", `const owner=this;const view:Readonly<{item:{value:number}}>=owner.state;class Assign{value=(view.item.value+=2);}trace.push(new Assign().value,owner.state.item.value);`},
		{"static deletion", `const owner=this;owner.state.item.optional=3;class Assign{static value=delete owner.state.item.optional;}trace.push(Assign.value,owner.state.item.optional);`},
		{"constructor body", `const owner=this;const old=this.state.item;let level=0;class Assign{constructor(){owner.state.item.value=++level===1?(owner.state.item={value:10},new Assign(),1):2;}}new Assign();trace.push(old.value,this.state.item.value);`},
		{"instance field", `const owner=this;const old=this.state.item;let level=0;class Assign{value:number=(owner.state.item.value=++level===1?(owner.state.item={value:10},new Assign(),1):2);}new Assign();trace.push(old.value,this.state.item.value);`},
		{"constructor default", `const owner=this;const old=this.state.item;let level=0;class Assign{constructor(value:number=(owner.state.item.value=++level===1?(owner.state.item={value:10},new Assign(),1):2)){trace.push(value);}}new Assign();trace.push(old.value,this.state.item.value);`},
		{"static field reentry", `const owner=this;const old=this.state.item;let level=0;function define():void{class Assign{static value:number=(owner.state.item.value=++level===1?(owner.state.item={value:10},define(),1):2);}void Assign;}define();trace.push(old.value,this.state.item.value);`},
		{"static block reentry", `const owner=this;const old=this.state.item;let level=0;function define():void{class Assign{static{owner.state.item.value=++level===1?(owner.state.item={value:10},define(),1):2;}}void Assign;}define();trace.push(old.value,this.state.item.value);`},
		{"derived private field preserves super and this", `const owner=this;class Base{get value(){return 3;}}class Assign extends Base{#value=(owner.state.item.value=super.value);copy=this.#value;constructor(){trace.push("before");super();trace.push("after",this.copy);}}new Assign();trace.push(owner.state.item.value);`},
		{"object computed method name", `const owner=this;const calls={[(owner.state.item.value+=1,'run' as const)](){return 9;}};trace.push(calls.run(),owner.state.item.value);`},
		{"class computed method name", `const owner=this;class Calls{[(owner.state.item.value+=1,'run' as const)](){return 9;}}trace.push(owner.state.item.value);void Calls;`},
		{"computed accessor names", `const owner=this;const calls={get [(owner.state.item.value+=1,'value' as const)](){return 9;},set [(owner.state.item.value+=1,'value' as const)](value:number){trace.push(value);}};Reflect.set(calls,'value',4);trace.push(Reflect.get(calls,'value'),owner.state.item.value);`},
	}
	for _, candidate := range cases {
		for _, ordinary := range []bool{false, true} {
			t.Run(candidate.name+"/ordinary="+fmt.Sprint(ordinary), func(t *testing.T) {
				declaration := "function run(task:TaskContext=TaskContext.client().latest())"
				if ordinary {
					declaration = "const run=()=>"
				}
				source := `import {TaskContext,type Component} from '@exactjs/core';export const trace:unknown[]=[];export function Page(this:Component<{item:{value:number;optional?:number}}>){this.state.item={value:0};` + declaration + `{` + candidate.body + `};return()=> <button onClick={()=>run()}>ready</button>;}`
				response := NewSession().Execute(Request{Kind: "compile", ID: "evaluation-scope.tsx", Target: TargetClient, Source: source})
				assertReactiveCompilation(t, response, source)
			})
		}
	}
}

// Checking and emission consume the same resolved lexical alias, even when a class
// supplies a different this. A readonly facade still permits its mutable nested value.
func TestSelectedStateWriteClassAliasFacts(t *testing.T) {
	for _, receiver := range []struct{ setup, access string }{
		{"const component=this;const owner=component;", "owner.state"},
		{"const facade=this.state;const owner=facade;", "owner"},
	} {
		for _, body := range []string{
			"constructor(){" + receiver.access + ".item.value=2;}",
			"value=(" + receiver.access + ".item.value=2);",
		} {
			source := `import {type Component} from '@exactjs/core';export function Page(this:Component<{item:{value:number}}>){this.state.item={value:0};const run=()=>{` + receiver.setup + `class Assign{` + body + `}new Assign();};return()=> <button onClick={()=>run()}>ready</button>;}`
			response := NewSession().Execute(Request{Kind: "compile", ID: "class-alias-facts.tsx", Target: TargetClient, Diagnostics: "semantic", Source: source})
			assertReactiveCompilation(t, response, source)
			if len(response.Diagnostics) != 0 {
				t.Fatalf("valid lexical alias rejected: %#v", response.Diagnostics)
			}
			found := false
			for _, write := range response.Analysis.StateWrites {
				if len(write.Path) == 2 && write.Path[1] == "value" {
					found = true
					if write.RootAlias != "owner" || write.RootComponent != (receiver.access == "owner.state") {
						t.Fatalf("resolved alias identity lost: %#v", write)
					}
				}
			}
			if !found {
				t.Fatal("class write missing from analysis")
			}
		}
	}
	source := `import {type Component} from '@exactjs/core';export function Page(this:Component<{item:{value:number}}>){this.state.item={value:0};const run=()=>{const view:Readonly<{item:{value:number}}>=this.state;class Assign{value=(view.item={value:2});}new Assign();};return()=> <button onClick={()=>run()}>ready</button>;}`
	response := NewSession().Execute(Request{Kind: "compile", ID: "readonly-class-alias.tsx", Target: TargetClient, Diagnostics: "semantic", Source: source})
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Code == "TS2540" {
			return
		}
	}
	t.Fatalf("readonly assignment lost TypeScript rejection: %s %#v", response.Error, response.Diagnostics)
}

// A computed object name evaluates in the field's class receiver. It cannot
// bypass that class merely because a name elsewhere is evaluated before invocation.
func TestSelectedStateWriteNestedObjectNameReceiver(t *testing.T) {
	source := `import {type Component} from '@exactjs/core';export function Page(this:Component<{item:{value:number}}>){this.state.item={value:0};const run=()=>{class Assign{state={item:{value:20}};value={[(this.state.item.value+=1,'run' as const)](){return 9;}};}new Assign();};return()=> <button onClick={()=>run()}>ready</button>;}`
	response := NewSession().Execute(Request{Kind: "compile", ID: "field-object-name.tsx", Target: TargetClient, Source: source})
	assertReactiveCompilation(t, response, source)
	if len(response.Analysis.StateWrites) != 1 {
		t.Fatalf("class own state acquired component mutation ownership: %#v", response.Analysis.StateWrites)
	}
}
