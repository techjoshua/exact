package exactcompiler

import (
	"fmt"
	"strings"
	"testing"
)

// The event payload optimization must describe the selected callable, including mutable bindings.
func TestEventArgumentOwnershipAcrossHandlerForms(t *testing.T) {
	for _, test := range []struct {
		name, setup, handler string
		closed               bool
	}{
		{"arrow", "", `()=>{}`, true},
		{"typed-arrow", "", `(event: MouseEvent)=>{void event.type;}`, false},
		{"function-expression", "", `function(){}`, true},
		{"arguments", "", `function(){void arguments[0];}`, false},
		{"arrow-arguments", "", `function(){const read=()=>arguments[0];void read();}`, false},
		{"default-parameter", "", `(event: MouseEvent|undefined=undefined)=>{void event;}`, false},
		{"rest-parameter", "", `(...events: MouseEvent[])=>{void events;}`, false},
		{"const-arrow", `const handler=()=>{};`, "handler", true},
		{"const-function", `const handler=function(){};`, "handler", true},
		{"declaration", `function handler(){}`, "handler", true},
		{"mutable-variable", `let handler:(event?:MouseEvent)=>void=()=>{};handler=event=>{void event?.type;};`, "handler", false},
		{"mutable-function", `function handler(){ } handler=function(){void arguments[0];};`, "handler", false},
		{"hoisted-reassignment", `handler=function(){void arguments[0];};function handler(){}`, "handler", false},
		{"destructured-reassignment", `let handler:(event?:MouseEvent)=>void=()=>{};({handler}={handler:(event?:MouseEvent)=>{void event?.type;}});`, "handler", false},
		{"declared-function", `declare function handler():void;`, "handler", false},
		{"declared-handler", `declare const handler:(event:MouseEvent)=>void;`, "handler", false},
		{"member", `const handlers={run(event:MouseEvent){void event.type;}};`, "handlers.run", false},
	} {
		for _, host := range []string{"button", "my-button"} {
			t.Run(test.name+"/"+host, func(t *testing.T) {
				id := "event-owner.tsx"
				if test.name == "mutable-function" || test.name == "hoisted-reassignment" {
					id = "event-owner.jsx"
				}
				response := NewSession().Execute(Request{ID: id, Kind: "compile", Target: TargetClient,
					Source: test.setup + `export function Page(){return()=> <` + host + ` onClick={` + test.handler + `}>Run</` + host + `>;}`})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
					t.Fatalf("handler rejected: %s %#v", response.Error, response.Diagnostics)
				}
				if strings.Contains(response.Code, "__exactClosedInteraction:onClick") != test.closed {
					t.Fatalf("incorrect event omission proof:\n%s", response.Code)
				}
			})
		}
	}
}

// Source variants exercise defaults, dynamic props, conditional classes and contextual callback lowering.
func TestPropsSubsystemSourceContracts(t *testing.T) {
	cases := []struct{ name, source string }{
		{"defaults", `const __exactSuppliedProps=0;const __exactSuppliedProps1=1;export function Page({label:heading="fallback",enabled=true,"data-name":name="name"}:{label?:string;enabled?:boolean;"data-name"?:string}){return()=> <span title={heading}>{enabled?name:heading}</span>;}`},
		{"expression-body", `export const Page=({label="fallback"}:{label?:string})=>()=> <span>{label}</span>;`},
		{"async-defaults", `import type {Component} from '@exactjs/core';export function Page(this:Component<{text:string}>,{label="fallback"}:{label?:string}){this.state.text="";this.state.text=await Promise.resolve(label);return()=> <span>{this.state.text}{label}</span>;}`},
		{"escaped-props", `function text(props:{a:string;b?:string}){return props.a+props.b;}export function Page(props:{a:string;b?:string}){const key="b" as string;return()=> <span title={props[key]}>{text(props)}</span>;}`},
		{"static-conditional", `export function Page(){return()=> <span className="base" className:active className:next/>;}`},
		{"truthy-conditional", `export function Page(props:{flag:number}){return()=> <span className="base" className:active={props.flag} className:next="next"/>;}`},
		{"boolean-conditional", `export function Page(props:{flag:boolean}){return()=> <span className="base" className:a={true} className:b={false} className:c={!props.flag} className:d={props.flag==true} className:e={props.flag!=false} className:f={props.flag!==false}/>;}`},
		{"general-classes", `export function Page(props:{flag:boolean}){return()=> <my-span className={props.flag?"base":"other"} className:active={props.flag}/>;}`},
		{"empty-classes", `export function Page(){return()=> <span className="" className:active={true}/>;}`},
		{"proto-classes", `export function Page(props:{flag:boolean}){return()=> <my-span className="base" className:__proto__={props.flag}/>;}`},
		{"event-types", `export function Page(){return()=> <button onClick={function(event){void event.currentTarget;}} onFocus={(event:FocusEvent)=>{void event.type;}} onDoubleClickCapture={event=>{void event.type;}}/>;}`},
		{"callback-context", `function Child(props:{onValue:(value:string,index:number)=>void}){return()=> <button onClick={()=>props.onValue("next",1)}/>;}export function Page(){return()=> <Child onValue={function(value,index){void value.toUpperCase();void index.toFixed();}}/>;}`},
		{"native-spreads", `const CLASSNAME="base";const attrs={CLASSNAME:"shared",tabindex:1};function Child(props:{CLASSNAME:string;tabindex:number}){return()=> <span>{props.CLASSNAME}</span>;}export function Page(){return()=> <><div {...{CLASSNAME}}/><input {...attrs}/><Child {...attrs}/><my-host {...attrs}/><svg {...{viewbox:"0 0 1 1",strokeWidth:1}}/><math display="block"/></>;}`},
		{"nested-spread", `const attrs={CLASSNAME:"nested"};export function Page(){return()=> <div {...{...attrs}}/>;}`},
		{"event-spread", `export function Page(){return()=> <button {...{onclick:(event:MouseEvent)=>{void event.type;}}}/>;}`},
		{"temporal-spread", `export function Page(props:{type:string;value:string}){return()=> <input type={props.type} value={props.value}/>;}`},
		{"long-props-program", longPropsUpdateSource()},
	}
	for _, test := range cases {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(test.name+"/"+string(target), func(t *testing.T) {
				response := NewSession().Execute(Request{ID: "props-contract.tsx", Kind: "compile", Target: target, Source: test.source})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
					t.Fatalf("valid props rejected: %s %#v", response.Error, response.Diagnostics)
				}
				if len(response.Analysis.Components) == 0 || response.Code == "" {
					t.Fatalf("missing component lowering: %#v", response)
				}
				if test.name == "proto-classes" && target == TargetClient && !strings.Contains(response.Code, `["__proto__"]`) {
					t.Fatalf("conditional token became a prototype setter: %s", response.Code)
				}
			})
		}
	}
}

func longPropsUpdateSource() string {
	var fields, children strings.Builder
	for index := 0; index < 70; index++ {
		fmt.Fprintf(&fields, "p%d:string;", index)
		fmt.Fprintf(&children, "<span title={props.p%d}>{props.p%d}</span>", index, index)
	}
	return `export function Page(props:{` + fields.String() + `}){return()=> <main>` + children.String() + `</main>;}`
}

// Rejection controls protect collisions and handler validation alongside newly covered valid forms.
func TestPropsSubsystemRejectionContracts(t *testing.T) {
	for _, test := range []struct{ source, code string }{
		{`export function Page(){return()=> <span className="base base" className:other/>;}`, "EXACT_CLASS_NAME"},
		{`export function Page(){return()=> <span className:base className:base={true}/>;}`, "EXACT_CLASS_NAME"},
		{`export function Page(){return()=> <span className="base" className:base={true}/>;}`, "EXACT_CLASS_NAME"},
		{`export function Page(props:{handler:(()=>void)|string}){return()=> <button onClick={props.handler}/>;}`, "EXACT_NATIVE_PROP"},
		{`export function Page(props:{bag:{onClick:(()=>void)|string}}){return()=> <button {...props.bag}/>;}`, "EXACT_NATIVE_PROP"},
		{`export function Page({nested:{value}}:{nested:{value:string}}){return()=> <span>{value}</span>;}`, ""},
		{`export function Page({...props}:{label:string}){return()=> <span>{props.label}</span>;}`, ""},
	} {
		t.Run(test.source, func(t *testing.T) {
			response := NewSession().Execute(Request{ID: "props-rejected.tsx", Kind: "compile", Target: TargetClient, Source: test.source})
			if test.code == "" {
				if response.Error == "" {
					t.Fatalf("unsupported pattern emitted: %s", response.Code)
				}
				return
			}
			found := false
			for _, d := range response.Diagnostics {
				found = found || d.Code == test.code
			}
			if !found || response.Code != "" {
				t.Fatalf("missing rejection %s: %s %#v", test.code, response.Error, response.Diagnostics)
			}
		})
	}
}
