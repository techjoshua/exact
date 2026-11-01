package exactcompiler

import (
	"strings"
	"testing"
)

func TestResumableOwnerKeepsElementCallbacksLexical(t *testing.T) {
	response := NewSession().Execute(Request{ID: "owned-elements.tsx", Kind: "compile", Target: TargetClient,
		ServerComponents: true, ComponentContractProjection: ComponentContractProjectionHydrate,
		Source: `import { TaskContext, type Component } from '@exactjs/core';
export function Workspace(this: Component<{items: string[]; value: string}>) {
 this.state.items = ['one'];
 this.state.value = '';
 function save(value: string, task: TaskContext = TaskContext.server()) { return value; }
 const choose = async (value: string) => { this.state.value = await save(value); };
 return () => <section>{this.state.items.map(item => <button key={item} onClick={() => choose(item)}>{item}</button>)}</section>;
}`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	if len(response.Analysis.Continuations) == 0 {
		t.Fatal("fixture must retain its server invocation")
	}
	if strings.Contains(response.Code, "Workspace_ExactClient_") {
		t.Fatalf("owner-local callback escaped into an independent island:\n%s", response.Code)
	}
	for _, symbol := range response.Analysis.Symbols {
		if symbol.Role == "client-island" {
			t.Fatalf("metadata advertised an unused element export: %#v", symbol)
		}
	}
}

// Callback parameters, receiver aliases and component-local annotations retain their actual
// lexical owners when one state-connected repeated range becomes a client island.
func TestExtractedIslandRetainsLexicalEnvironment(t *testing.T) {
	cases := []struct{ name, source string }{
		{"Flat", `import type {Component} from "@exactjs/core";
function Leaf(props:{text:string;active:boolean;onEnter:()=>void}){return()=> <li onMouseEnter={props.onEnter}>{props.text}{props.active ? " active":""}</li>;}
type Item={id:string,label:string}; export function List(this:Component<{active:string}>,props:{items:readonly Item[]}){this.state.active="";return()=> <ul>{props.items.map(item=><Leaf key={item.id} text={item.label} active={this.state.active===item.id} onEnter={()=>this.state.active=item.id}/>)}</ul>}`},
		{"LocalScalar", `import type {Component} from "@exactjs/core";
function Leaf(props:{text:string;active:boolean;onEnter:()=>void}){return()=> <li onMouseEnter={props.onEnter}>{props.text}{props.active ? " active":""}</li>;}
export function List(this:Component<{count:number}>,props:{item:{label:string}}){type LocalItem={label:string};const item:LocalItem=props.item;this.state.count=0;return()=> <button onClick={()=>this.state.count++}>{item.label}{this.state.count}</button>}`},
		{"LocalAlias", `import type {Component} from "@exactjs/core";
function Leaf(props:{text:string;active:boolean;onEnter:()=>void}){return()=> <li onMouseEnter={props.onEnter}>{props.text}{props.active ? " active":""}</li>;}
export function List(this:Component<{active:string}>,props:{items:readonly {id:string,label:string}[]}){type LocalItem={id:string,label:string};const items:readonly LocalItem[]=props.items;this.state.active="";return()=> <ul>{items.map(item=><Leaf key={item.id} text={item.label} active={this.state.active===item.id} onEnter={()=>this.state.active=item.id}/>)}</ul>}`},
		{"Nested", `import type {Component} from "@exactjs/core";
function Leaf(props:{text:string;active:boolean;onEnter:()=>void}){return()=> <li onMouseEnter={props.onEnter}>{props.text}{props.active ? " active":""}</li>;}
type Item={id:string,label:string};export function List(this:Component<{active:string}>,props:{groups:readonly {id:string,items:readonly Item[]}[]}){this.state.active="";return()=> <ul>{props.groups.map(group=><section key={group.id}>{group.items.map(item=><Leaf key={item.id} text={item.label} active={this.state.active===item.id} onEnter={()=>this.state.active=item.id}/>)}</section>)}</ul>}`},
		{"FunctionCallback", `import type {Component} from "@exactjs/core";
function Leaf(props:{text:string;active:boolean;onEnter:()=>void}){return()=> <li onMouseEnter={props.onEnter}>{props.text}{props.active ? " active":""}</li>;}
type Item={id:string,label:string};export function List(this:Component<{active:string}>,props:{items:readonly Item[]}){this.state.active="";const owner=this;return()=> <ul>{props.items.map(function(item){return <Leaf key={item.id} text={item.label} active={owner.state.active===item.id} onEnter={()=>owner.state.active=item.id}/>})}</ul>}`},
		{"QueryFunction", `import type {Component} from "@exactjs/core";
function Leaf(props:{text:string;active:boolean;onEnter:()=>void}){return()=> <li onMouseEnter={props.onEnter}>{props.text}{props.active ? " active":""}</li>;}
export function List(this:Component<{active:string}>,props:{items:readonly {id:string,label:string}[]}){type LocalItem={readonly id:string;readonly label:string;children?:readonly LocalItem[]}; function read(row:(typeof props.items)[number]){return row.label.trim();} const items:readonly LocalItem[]=props.items;this.state.active="";return()=> <ul>{items.map(item=><Leaf key={item.id} text={read(item)} active={this.state.active===item.id} onEnter={()=>this.state.active=item.id}/>)}</ul>}`},
		{"GenericDefaultDeeper", `import type {Component} from "@exactjs/core";
function Leaf(props:{text:string;active:boolean;onEnter:()=>void}){return()=> <li onMouseEnter={props.onEnter}>{props.text}{props.active ? " active":""}</li>;}
export function List(this:Component<{active:string}>,props:{items:readonly {id:string,label:string}[]}){type Box<T=string>={value:T;next?:Box<T>};type LocalItem={readonly id:string;readonly label:string;children?:readonly LocalItem[]; box?:Box<number>}; const items:readonly LocalItem[]=props.items;this.state.active="";return()=> <ul>{items.map(item=><Leaf key={item.id} text={item.box?.next?.next?.value.toFixed() ?? item.label} active={this.state.active===item.id} onEnter={()=>this.state.active=item.id}/>)}</ul>}`},
		{"UnusedPropsAlias", `import type {Component} from "@exactjs/core";
function Leaf(props:{text:string;active:boolean;onEnter:()=>void}){return()=> <li onMouseEnter={props.onEnter}>{props.text}{props.active ? " active":""}</li>;}
export function List(this:Component<{active:string}>,props:{items:readonly {id:string,label:string}[]}){const source=props;type LocalItem={readonly id:string;readonly label:string;children?:readonly LocalItem[]}; const items:readonly LocalItem[]=props.items;this.state.active="";return()=> <ul>{items.map(item=><Leaf key={item.id} text={item.label} active={this.state.active===item.id} onEnter={()=>this.state.active=item.id}/>)}</ul>}`},
		{"GuardedUnionChildren", `import type {Component,RenderResult} from "@exactjs/core";
function Leaf(props:{text:string;active:boolean;onEnter:()=>void}){return()=> <li onMouseEnter={props.onEnter}>{props.text}{props.active ? " active":""}</li>;}
export function List(this:Component<{active:string}>,props:({kind:"a";children?:RenderResult}|{kind:"b"})&{items:readonly {id:string,label:string}[]}){const source=props;type LocalItem={readonly id:string;readonly label:string;children?:readonly LocalItem[]}; const items:readonly LocalItem[]=props.items;this.state.active="";return()=> <ul>{items.map(item=><Leaf key={item.id} text={item.label} active={this.state.active===item.id} onEnter={()=>this.state.active=item.id}/>)}{'children' in props ? props.children : undefined}</ul>}`},
	}
	for _, test := range cases {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(test.name+"/"+string(target), func(t *testing.T) {
				response := NewSession().Execute(Request{ID: "extracted-lexical.tsx", Kind: "compile", Target: target, ServerComponents: true, ComponentContractProjection: ComponentContractProjectionHydrate, Diagnostics: "semantic", Source: test.source})
				if response.Error != "" || len(response.Diagnostics) != 0 || response.Code == "" {
					t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
				}
				for _, resumption := range response.Analysis.Resumptions {
					for _, capture := range resumption.Client.ValueCaptures {
						if capture == "owner" {
							t.Fatalf("component receiver entered data transport: %#v", resumption.Client.ValueCaptures)
						}
					}
				}
			})
		}
	}
}
