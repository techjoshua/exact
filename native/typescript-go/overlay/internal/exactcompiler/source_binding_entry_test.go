package exactcompiler

import (
	"strings"
	"testing"
)

// Definite replacement selects the current value without acquiring an obsolete
// initializer at the later read. Other writes retain their original alternatives.
func TestSourceBindingEntryReplacement(t *testing.T) {
	for _, row := range []struct{ name, source, placement string }{
		{"current", `function make(input:{inner:{value:string}}){let alias=input.inner;alias={value:"safe"};return alias.value}export const value=make({inner:{get value(){return document.title}}});`, "isomorphic"},
		{"binding Get", `function make(input:{inner:{value:string}}){let alias=input.inner;alias={value:"safe"};return ()=>alias.value}export const value=make({get inner(){document.title;return {value:"old"}}})();`, "client"},
		{"captured current", `function make(input:{inner:{value:string}}){let alias=input.inner;const read=()=>alias.value;alias={get value(){return document.title}};return read}export const value=make({inner:{value:"old"}})();`, "client"},
		{"conditional false", `function make(input:{inner:{value:string}}){let alias=input.inner;if(false)alias={value:"safe"};return ()=>alias.value}export const value=make({inner:{get value(){return document.title}}})();`, "client"},
		{"conditional true", `function make(input:{inner:{value:string}}){let alias=input.inner;if(true)alias={value:"safe"};return ()=>alias.value}export const value=make({inner:{get value(){return document.title}}})();`, "isomorphic"},
		{"default Get", `function make(input:{inner:{value:string}}={get inner(){document.title;return {value:"old"}}}){let alias=input.inner;alias={value:"safe"};return ()=>alias.value}export const value=make()();`, "client"},
	} {
		t.Run(row.name, func(t *testing.T) { assertClosurePlacement(t, row.source, row.placement) })
	}
}

// Foreign and conditional alternatives cannot borrow definite replacement or
// erase a known browser donor. No normal Get output is supplied by this relation.
func TestSourceBindingEntryResiduals(t *testing.T) {
	for _, row := range []struct {
		name, source string
		unknown      bool
	}{
		{"conditional", `declare const choose:boolean;function make(input:{inner:{value:string}}){let alias=input.inner;if(choose)alias={value:"safe"};return ()=>alias.value}export const value=make({inner:{get value(){return document.title}}})();`, false},
		{"foreign", `declare function foreign():{value:string};function make(input:{inner:{value:string}}){let alias=input.inner;alias=foreign();return ()=>alias.value}export const value=make({get inner(){document.title;return {value:"old"}}})();`, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/binding-entry-residual.ts", Source: row.source, Diagnostics: "semantic"})
			browser, unknown := reentrantInitializerEffects(t, r, row.source, true)
			if !browser || unknown != row.unknown {
				t.Fatal("lost original donor or unresolved alternative", browser, unknown)
			}
		})
	}
}

// The original body still performs its initializer Get, independently of the
// later binding's value. Unknown receivers and possible writes remain conservative.
func TestSourceBindingEntryOriginalEffects(t *testing.T) {
	for _, row := range []struct {
		name, source     string
		browser, unknown bool
	}{
		{"plain", `function make(){return (input:{inner:{value:string}})=>{let inner=input.inner;inner={value:"safe"};return inner.value}}export const value=[make()][0]!({inner:{value:"old"}});`, false, false},
		{"binding getter", `function make(){return (input:{inner:{value:string}})=>{let inner=input.inner;inner={value:"safe"};return inner.value}}export const value=[make()][0]!({get inner(){document.title;return {value:"old"}}});`, true, false},
		{"foreign input", `declare function foreign():{inner:{value:string}};function make(){return (input:{inner:{value:string}})=>{let inner=input.inner;inner={value:"safe"};return inner.value}}export const value=[make()][0]!(foreign());`, false, true},
		{"proxy input", `function make(){return (input:{inner:{value:string}})=>{let inner=input.inner;inner={value:"safe"};return inner.value}}export const value=[make()][0]!(new Proxy({inner:{value:"old"}},{get(target,key){document.title;return Reflect.get(target,key)}}));`, true, true},
		{"read before replacement", `function make(){return (input:{inner:{value:string}})=>{let inner=input.inner;const seen=inner.value;inner={value:"safe"};return seen}}export const value=[make()][0]!({inner:{get value(){return document.title}}});`, true, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/binding-original-effects.ts", Source: row.source, Diagnostics: "semantic"})
			browser, unknown := reentrantInitializerEffects(t, r, row.source, true)
			if browser != row.browser || (row.name != "read before replacement" && unknown != row.unknown) {
				t.Fatal("original Get lost donor or residual", browser, unknown)
			}
		})
	}
}

// The exact original source emits and runs on both targets without observing
// the browser getter that the definite local replacement makes obsolete.
func TestSourceBindingEntryOriginalEmitted(t *testing.T) {
	const source = `function make(){return (input:{inner:{value:string}})=>{let inner=input.inner;inner={value:"safe"};return inner.value}}export const value=[make()][0]!({inner:{get value(){return document.title}}});`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/binding-original.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			sourceNodeScript(t, r.Code, `const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),out={};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:out});assert.equal(out.value,'safe');`)
		})
	}
}

// Source replacement invalidates the current binding's acquired inputs.
func TestSourceBindingEntrySourceReplacement(t *testing.T) {
	const base = `function make(input:{inner:{value:string}}){let alias=input.inner;alias={value:"safe"};return ()=>alias.value}export const value=make({inner:{value:"old"}})();`
	session := NewSession()
	for _, browser := range []bool{false, true, false} {
		source := base
		if browser {
			source = strings.Replace(source, `alias={value:"safe"}`, `alias={get value(){return document.title}}`, 1)
		}
		r := session.Execute(Request{Kind: "analyze", ID: "/virtual/binding-source-replacement.ts", Source: source, Diagnostics: "semantic"})
		got, unknown := reentrantInitializerEffects(t, r, source, true)
		if got != browser || unknown {
			t.Fatal("stale source binding", got, unknown)
		}
	}
}

// Acquisition, replacement and repeated reads preserve getter/setter order.
// An abrupt initializer prevents replacement and return, on both emitted targets.
func TestSourceBindingEntryEmitted(t *testing.T) {
	const source = `declare function record(value:string):void;export function run(fail:boolean){function make(input:{inner:{value:string}}){let alias=input.inner;const saved=alias;alias={get value(){record("get");return "safe"},set value(value:string){record("set:"+value)}};const read=()=>alias.value;alias.value="changed";input.inner={value:"replacement"};return ()=>saved.value+":"+read()}const read=make({get inner(){record("bind");if(fail)throw new Error("binding");return {get value(){record("old");return "old"}}},set inner(value:{value:string}){record("source-set")}});record("created");record(read());record(read())}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/binding-entry-emitted.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			sourceNodeScript(t, r.Code, `const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),out={},trace=[];vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:out,record:value=>trace.push(value)});out.run(false);assert.deepEqual(trace,['bind','set:changed','source-set','created','old','get','old:safe','old','get','old:safe']);trace.length=0;assert.throws(()=>out.run(true),/binding/);assert.deepEqual(trace,['bind']);`)
		})
	}
}
