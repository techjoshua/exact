package exactcompiler

import (
	"strings"
	"testing"
)

func TestStandardTypedArrayMemberEffects(t *testing.T) {
	for _, name := range []string{"Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array", "Int32Array", "Uint32Array", "Float32Array", "Float64Array", "BigInt64Array", "BigUint64Array"} {
		t.Run(name, func(t *testing.T) {
			value := "1"
			if strings.HasPrefix(name, "Big") {
				value = "1n"
			}
			source := `export function Page(){const bytes=new ` + name + `(2);bytes.fill(` + value + `);const part=bytes.subarray(0,1);return()=> <p>{String(part[0])}</p>;}`
			response := NewSession().Execute(Request{ID: "typed-array.tsx", Kind: "analyze", Source: source})
			if response.Error != "" || len(response.Analysis.Components) != 1 || response.Analysis.Components[0].EnvironmentEffect != "neutral" {
				t.Fatalf("standard member lost portable authority: error=%s, components=%d", response.Error, len(response.Analysis.Components))
			}
			for _, target := range []Target{TargetClient, TargetServer} {
				compiled := NewSession().Execute(Request{ID: "typed-array.tsx", Kind: "compile", Target: target, Source: source})
				if compiled.Error != "" || compiled.Code == "" {
					t.Fatalf("%s: %s", target, compiled.Error)
				}
			}
		})
	}
}

func TestTypedArrayMembersRetainDeclarationAuthority(t *testing.T) {
	for _, test := range []struct{ name, source, placement string }{
		{"shadow", `class Uint8Array{fill(value:number){return window.location.href;}}export function Page(){const bytes=new Uint8Array();const value=bytes.fill(1);return()=> <p>{value}</p>;}`, "client"},
		{"override", `class Bytes extends Uint8Array{fill(value:number){void window.location.href;return this;}}export function Page(){const bytes=new Bytes(2);bytes.fill(1);return()=> <p/>;}`, "client"},
		{"augmentation", `export {};declare global{interface Uint8Array<TArrayBuffer extends ArrayBufferLike=ArrayBufferLike>{custom():number;}}export function Page(){const bytes=new Uint8Array(2);bytes.custom();return()=> <p/>;}`, "unknown"},
		{"unrelated-augmentation", `export {};declare global{interface Uint8Array<TArrayBuffer extends ArrayBufferLike=ArrayBufferLike>{custom():number;}}export function Page(){const bytes=new Uint8Array(2);bytes.fill(1);return()=> <p/>;}`, "isomorphic"},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{ID: "typed-array-control.tsx", Kind: "analyze", Source: test.source})
			if response.Error != "" || len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != test.placement {
				t.Fatalf("method ownership changed: error=%s, components=%d", response.Error, len(response.Analysis.Components))
			}
		})
	}
}

func TestStandardByteStorageMemberEffects(t *testing.T) {
	for _, test := range []struct{ name, body string }{
		{"buffer", `const storage=new ArrayBuffer(4);const part=storage.slice(0,2);`},
		{"view", `const storage=new ArrayBuffer(4);const view=new DataView(storage);view.setUint8(0,1);const value=view.getUint8(0);`},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{ID: "byte-storage.tsx", Kind: "analyze", Source: `export function Page(){` + test.body + `return()=> <p/>;}`})
			if response.Error != "" || len(response.Analysis.Components) != 1 || response.Analysis.Components[0].EnvironmentEffect != "neutral" {
				t.Fatalf("byte storage lost portable authority: error=%s, components=%d", response.Error, len(response.Analysis.Components))
			}
		})
	}
}

// Numeric conversion belongs to the task using the byte storage. DataView
// converts its endian flag to a boolean without invoking an object method.
func TestTaskByteStorageArgumentEffects(t *testing.T) {
	root, config := formsSourceFixture(t)
	const lateField = `let input={value:'safe'};class Child extends Uint8Array{field=input.value;/* species */};const b=new Child(2);input={get value(){return document.title}};`
	for _, row := range []struct {
		name, body string
		browser    bool
	}{
		{"fill-value", "const b=new Uint8Array(2);b.fill(1)", false},
		{"own-method", "const b=new Uint8Array(2);b.fill=function(){document.title;return this};b.fill(1)", true},
		{"not-yet-replaced", "const b=new Uint8Array(2);b.fill(1);b.fill=function(){document.title;return this}", false},
		{"fill-conversion", "const b=new Uint8Array(2);b.fill({valueOf(){document.title;return 1}} as any)", true},
		{"offset", "const v=new DataView(new ArrayBuffer(4));v.getUint8({valueOf(){document.title;return 0}} as any)", true},
		{"endian", "const v=new DataView(new ArrayBuffer(4));v.getUint16(0,{valueOf(){document.title;return 1}} as any)", false},
		{"fill-dormant", `const b=new Uint8Array(2);Object.defineProperty(b,"constructor",{get(){document.title;return Uint8Array}});b.fill(1)`, false},
		{"own-subarray", `const b=new Uint8Array(2);b.subarray=()=>new Uint8Array(0);Object.defineProperty(b,"constructor",{get(){document.title;return Uint8Array}});b.subarray(0,1)`, false},
		{"defined-subarray", `const b=new Uint8Array(2);Object.defineProperty(b,"constructor",{get(){document.title;return Uint8Array}});Object.defineProperty(b,"subarray",{value:()=>new Uint8Array(0)});b.subarray(0,1)`, false},
		{"bracket-subarray", `const b=new Uint8Array(2);Object.defineProperty(b,"constructor",{get(){document.title;return Uint8Array}});b["subarray"](0,1)`, true},
		{"constructor-alias", `const Base=Uint8Array;const b=new Base(2);Object.defineProperty(b,"constructor",{get(){document.title;return Uint8Array}});b.subarray(0,1)`, true},
		{"species-get", `const b=new Uint8Array(2);Object.defineProperty(b,"constructor",{value:{get [Symbol.species](){document.title;return Uint8Array}}});b.subarray(0,1)`, true},
		{"species-new", `const b=new Uint8Array(2);Object.defineProperty(b,"constructor",{value:{[Symbol.species]:class extends Uint8Array{constructor(...args:any[]){super(1);document.title}}}});b.subarray(0,1)`, true},
		{"delete", `const b=new Uint8Array(2);b.subarray=()=>new Uint8Array(0);delete (b as any).subarray;Object.defineProperty(b,"constructor",{get(){document.title;return Uint8Array}});b.subarray(0,1)`, true},
		{"replace-again", `const b=new Uint8Array(2);b.subarray=()=>new Uint8Array(0);b.subarray=Uint8Array.prototype.subarray;Object.defineProperty(b,"constructor",{get(){document.title;return Uint8Array}});b.subarray(0,1)`, true},
		{"cond", `const b=new Uint8Array(2);if(Math.random()>0.5)b.subarray=()=>new Uint8Array(0);Object.defineProperty(b,"constructor",{get(){document.title;return Uint8Array}});b.subarray(0,1)`, true},
		{"setter", `const b=new Uint8Array(2);const method=b.subarray;Object.defineProperty(b,"subarray",{get(){return method},set(v){}});b.subarray=()=>new Uint8Array(0);Object.defineProperty(b,"constructor",{get(){document.title;return Uint8Array}});b.subarray(0,1)`, true},
		{"class-field", `const b=new Uint8Array(2);Object.defineProperty(b,"constructor",{value:{[Symbol.species]:class extends Uint8Array{public tag=document.title}}});b.subarray(0,1)`, true},
		{"subclass", `class Child extends Uint8Array{static get [Symbol.species](){document.title;return Uint8Array}};new Child(2).subarray(0,1)`, true},
		{"subclass-own-method", `class Child extends Uint8Array{static get [Symbol.species](){document.title;return Uint8Array};subarray(start?:number,end?:number){return new Uint8Array(0)}};new Child(2).subarray(0,1)`, false},
		{"conditional-constructor", `class Child extends Uint8Array{static get [Symbol.species](){document.title;return Uint8Array}};const b=new Child(2);if(Math.random()>0.5)Object.defineProperty(b,"constructor",{value:Uint8Array});b.subarray(0,1)`, true},
		{"defined-constructor", `class Child extends Uint8Array{static get [Symbol.species](){document.title;return Uint8Array}};const b=new Child(2);Object.defineProperty(b,"constructor",{value:Uint8Array});b.subarray(0,1)`, false},
		{"inherited-map", `class Base extends Uint8Array{static get [Symbol.species](){document.title;return Uint8Array}};class Child extends Base{};new Child(2).map(value=>value)`, true},
		{"inherited-aliased-base", `const Base=Uint8Array;class Child extends Base{static get [Symbol.species](){document.title;return Uint8Array}};new Child(2).subarray(0,1)`, true},
		{"default-species-current-field", lateField + `b.map(value=>value)`, true},
		{"default-species-dormant", lateField, false},
		{"explicit-species-bypasses-current-field", strings.Replace(lateField, "/* species */", `static get [Symbol.species](){return Uint8Array}`, 1) + `b.map(value=>value)`, false},
		{"factory-subclass", `function make(v:{value:string}){return new (class extends Uint8Array{static get [Symbol.species](){void v.value;return Uint8Array}})(2)};const b=make({get value(){return document.title}});b.subarray(0,1)`, true},
		{"quiet-factory-subclass", `function make(v:{value:string}){return new (class extends Uint8Array{static get [Symbol.species](){void v.value;return Uint8Array}})(2)};const b=make({value:'safe'});b.subarray(0,1)`, false},
		{"safe-field", `function make(obj:{v:string}){return class extends Uint8Array{tag=obj.v;}}; const C=make({v:'ok'});const b=new Uint8Array(2);Object.defineProperty(b,"constructor",{value:{[Symbol.species]:C}});b.subarray(0,1);`, false},
		{"browser-field", `function make(obj:{v:string}){return class extends Uint8Array{tag=obj.v;}}; const C=make({get v(){return document.title}});const b=new Uint8Array(2);Object.defineProperty(b,"constructor",{value:{[Symbol.species]:C}});b.subarray(0,1);`, true},
		{"browser-ctor", `function make(obj:{v:string}){return class extends Uint8Array{constructor(...x:any[]){super(0);void obj.v;}}}; const C=make({get v(){return document.title}});const b=new Uint8Array(2);Object.defineProperty(b,"constructor",{value:{[Symbol.species]:C}});b.subarray(0,1);`, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := "import {type Component,TaskContext} from '@exactjs/core';export function Page(this:Component<{}>){function run(task:TaskContext=TaskContext.server()){" + row.body + "}return ()=> <button onClick={()=>run()}>run</button>}"
			for _, target := range []Target{TargetClient, TargetServer} {
				result := formsCompileSource(t, root, config, source, target)
				refused := containsDiagnosticCode(result.Diagnostics, "EXACT2001") && strings.Contains(strings.Join(formsDiagnosticDetails(result.Diagnostics), " "), "document")
				if refused != row.browser || (result.Code == "") != row.browser || !row.browser && hasErrorDiagnostic(result.Diagnostics) {
					t.Fatalf("%s emitted=%t diagnostics=%v", target, result.Code != "", formsDiagnosticDetails(result.Diagnostics))
				}
			}
		})
	}
}
