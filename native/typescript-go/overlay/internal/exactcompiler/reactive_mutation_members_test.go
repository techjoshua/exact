package exactcompiler

import (
	"strings"
	"testing"
)

// Literal member selection has the same state ownership as dot access, while
// structurally similar authored methods must retain their ordinary call semantics.
func TestReactiveMutationMemberSelection(t *testing.T) {
	cases := []struct{ work, operation, path string }{
		{`this.state.rows.push(1)`, "array-mutation", "rows"},
		{`this.state.rows["push"](1)`, "array-mutation", "rows"},
		{`this.state.rows[method](1)`, "array-mutation", "rows"},
		{`this.state.map["set"]("x",1)`, "map-mutation", "map"},
		{`this.state.set["add"](1)`, "set-mutation", "set"},
		{`this.state.fake["push"](1)`, "", "fake"},
	}
	for _, test := range cases {
		for _, target := range []Target{TargetClient, TargetServer} {
			response := NewSession().Execute(Request{Kind: "compile", ID: "members.tsx", Target: target, Source: `export function Page(this:{state:{rows:number[];map:Map<string,number>;set:Set<number>;fake:{push(value:number):number}}}){this.state.rows=[];this.state.map=new Map();this.state.set=new Set();const method="push" as const;return()=> <button onClick={()=>{` + test.work + `;}}>Go</button>;}`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			found := ""
			for _, write := range response.Analysis.StateWrites {
				if write.Operation != "assignment" && len(write.Path) > 0 && write.Path[0] == test.path {
					found = write.Operation
				}
			}
			if found != test.operation {
				t.Fatalf("%s %s: expected %s, got %s", target, test.work, test.operation, found)
			}
		}
	}
}

// Extracting a library operation through a binding pattern must not bypass the
// reflective state-write rejection. The same operation on ordinary data remains valid.
func TestReactiveReflectiveBindingPatterns(t *testing.T) {
	cases := []struct {
		work   string
		reject bool
	}{
		{`const {set}=Reflect;set(this.state,"count",1);`, true},
		{`const {set}=Reflect;(set as typeof Reflect.set)(this.state,"count",1);`, true},
		{`const {ops:{set}}={ops:Reflect};set(this.state,"count",1);`, true},
		{`const {set=Reflect.set}={} as {set?:typeof Reflect.set};set(this.state,"count",1);`, true},
		{`const {set:assign}=Reflect;assign(this.state,"count",1);`, true},
		{`const {["set"]:assign}=Reflect;assign(this.state,"count",1);`, true},
		{`const {defineProperty}=Object;defineProperty(this.state,"count",{value:1});`, true},
		{`const {set}=Reflect;set.call(Reflect,this.state,"count",1);`, true},
		{`const {set}=Reflect;const assign=set.bind(Reflect);assign(this.state,"count",1);`, true},
		{`const {set}=Reflect;set({count:0},"count",1);`, false},
		{`const Reflect={set(value:unknown,key:string,next:number){return next;}};const {set}=Reflect;set(this.state,"count",1);`, false},
	}
	for _, test := range cases {
		for _, target := range []Target{TargetClient, TargetServer} {
			response := NewSession().Execute(Request{Kind: "compile", ID: "reflect-bindings.tsx", Target: target, Source: `export function Page(this:{state:{count:number}}){this.state.count=0;return()=> <button onClick={()=>{` + test.work + `}}>Go</button>;}`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			rejected := false
			for _, diagnostic := range response.Diagnostics {
				if diagnostic.Code == "EXACT_STATE_WRITE" {
					rejected = true
				}
			}
			if rejected != test.reject {
				t.Fatalf("%s %s: rejection=%v diagnostics=%#v", target, test.work, rejected, response.Diagnostics)
			}
		}
	}
}

// An invoked computed member reads its collection receiver. Losing that read
// freezes a safe setup calculation even when the native iterator is recognized.
func TestReactiveComputedMemberReceiverInputs(t *testing.T) {
	for _, expression := range []string{`Array.from(this.state.map.values()).join(",")`, `Array.from(this.state.map["values"]()).join(",")`, `Array.from((this.state.map["values"])()).join(",")`, `this.state.rows["map"](value=>value+1).join(",")`, `this.state.set["has"](1).toString()`} {
		for _, target := range []Target{TargetClient, TargetServer} {
			response := NewSession().Execute(Request{Kind: "compile", ID: "receiver-inputs.tsx", Target: target, Source: `export function Page(this:{state:{rows:number[];map:Map<string,number>;set:Set<number>}}){this.state.rows=[];this.state.map=new Map();this.state.set=new Set();const label=` + expression + `;return()=> <p>{label}</p>;}`})
			assertReactiveCompilation(t, response, expression)
			found := false
			for _, binding := range response.Analysis.ReactiveBindings {
				if binding.Name == "label" {
					found = binding.Provenance == "derived" && binding.SafeToReevaluate
				}
			}
			if !found {
				t.Fatalf("lost receiver input: %s %#v", expression, response.Analysis.ReactiveBindings)
			}
		}
	}
}

// Rest and defaults can allocate independent receivers. They cannot authorize
// rewriting a native callback mutation through a fabricated component-state path.
func TestReactiveBindingAllocationOwnership(t *testing.T) {
	for _, test := range []struct {
		work       string
		stateWrite bool
	}{
		{`const {rows,...rest}=this.state;rest.n++;`, false},
		{`const [first,...rest]=this.state.rows;rest.push(2);`, false},
		{`const {nested={n:2}}=this.state;nested.n++;`, true},
		{`const {rows=[]}=this.state;rows.push(2);`, true},
		{`const {map=new Map<string,number>()}=this.state;map["set"]("x",2);`, true},
		{`const {set=new Set<number>()}=this.state;set["add"](2);`, true},
		{`const {nested}=this.state;nested!.n++;`, true},
		{`const [first]=this.state.objects;first.n++;`, true},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			response := NewSession().Execute(Request{Kind: "compile", ID: "binding-allocation.tsx", Target: target, Source: `export function Page(this:{state:{n:number;rows:number[];objects:{n:number}[];nested?:{n:number};map?:Map<string,number>;set?:Set<number>}}){this.state.n=0;this.state.rows=[1];this.state.objects=[{n:0}];return()=> <button onClick={()=>{` + test.work + `}}>Go</button>;}`})
			assertReactiveCompilation(t, response, test.work)
			found := false
			for _, write := range response.Analysis.StateWrites {
				found = found || write.Operation != "assignment"
			}
			if strings.Contains(test.work, "nested={") {
				for _, write := range response.Analysis.StateWrites {
					if write.Operation != "assignment" && !containsString(write.Path, "*") {
						t.Fatalf("default granted finite mutation authority: %#v", write)
					}
				}
			}
			if found != test.stateWrite {
				t.Fatalf("allocated binding ownership %s: %#v", test.work, response.Analysis.StateWrites)
			}
		}
	}
}

// A defaulted binding can still refer to state, so its possible write cannot
// authorize a finite server operation. Copies have their own storage instead.
func TestReactiveBindingTaskAuthority(t *testing.T) {
	for _, test := range []struct {
		work   string
		opaque bool
	}{
		{`const {nested={n:2}}=this.state;nested.n++;`, true},
		{`const {missingRows=[]}=this.state;missingRows.push(2);`, true},
		{`const {map=new Map<string,number>()}=this.state;map["set"]("x",2);`, true},
		{`const {set=new Set<number>()}=this.state;set["add"](2);`, true},
		{`const {nested}=this.state;nested!.n++;`, false},
		{`const {rows}=this.state;rows.push(2);`, false},
		{`const {rows,...rest}=this.state;rest.n++;`, false},
		{`const [first,...rest]=this.state.rows;rest.push(2);`, false},
	} {
		for _, placement := range []string{"client", "server"} {
			for _, target := range []Target{TargetClient, TargetServer} {
				response := NewSession().Execute(Request{Kind: "compile", ID: "binding-authority.tsx", Target: target, Source: `import {TaskContext} from '@exactjs/core';export function Page(this:{state:{n:number;rows:number[];nested?:{n:number};missingRows?:number[];map?:Map<string,number>;set?:Set<number>}}){this.state.n=0;this.state.rows=[];const run=(task:TaskContext=TaskContext.` + placement + `().latest().blocking())=>{void task;` + test.work + `};return()=> <button onClick={()=>run()}>Go</button>;}`})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				rejected := false
				for _, diagnostic := range response.Diagnostics {
					if diagnostic.Code == "EXACT2001" {
						rejected = true
					}
					if diagnostic.Code == "EXACT_STATE_WRITE" {
						t.Fatalf("lost native mutation ownership: %s %#v", test.work, response.Diagnostics)
					}
				}
				if rejected != (test.opaque && placement == "server") {
					t.Fatalf("%s %s %s: %#v", target, placement, test.work, response.Diagnostics)
				}
			}
		}
	}
}
