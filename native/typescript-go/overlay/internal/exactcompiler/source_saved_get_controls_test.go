package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

const savedGetUnknownReturnSource = `declare const choose:boolean;declare const maybe:string|undefined;declare function foreign():void;function take({value=document.title}:{value?:string}){return value}export const value=take({get value(){foreign();return choose?"safe":maybe}});`

const savedGetKnownEffectSource = `declare function foreign():void;function take({value=document.title}:{value?:string}){return value}export const value=take({get value(){foreign();return "safe"}});`

const savedGetReverseSource = `function make(){return ({inner}:{inner:{read():string}})=>{const read=inner.read;inner={read(){return document.title}};return read()}}export const value=[make()][0]!({inner:{read(){return "safe"}}});`
const savedGetGetterSource = `function make(){return ({inner}:{inner:{read():string}})=>{const read=inner.read;inner={read(){return "safe"}};return read()}}export const value=[make()][0]!({inner:{get read(){return ()=>document.title}}});`
const savedGetRepeatedSource = `function make(){return ({inner}:{inner:{read():string}})=>{const read=inner.read;inner={read(){return "safe"}};return read()+read()}}export const value=[make()][0]!({inner:{read(){return document.title}}});`
const savedGetSeparateSource = `function make(){return ({inner}:{inner:{read():string}})=>{const read=inner.read;inner={read(){return "safe"}};return read()}}export const safeValue=[make()][0]!({inner:{read(){return "safe"}}});export const value=[make()][0]!({inner:{read(){return document.title}}});`
const savedGetUnknownSource = `declare const choose:boolean;declare const unknown:{read():string};function make(){return ({inner}:{inner:{read():string}})=>{const read=inner.read;inner={read(){return "safe"}};return read()}}export const value=[make()][0]!({inner:choose?{read(){return document.title}}:unknown});`
const savedGetThrowSource = `function make(){return ({inner}:{inner:{read():string}})=>{const read=inner.read;inner={read(){return document.title}};return read()}}export const value=[make()][0]!({inner:{get read():()=>string{throw 9}}});`
const savedGetDetachedSource = `function make(){return ({inner}:{inner:{read(this:void):unknown}})=>{const read=inner.read;return read()===undefined}}export const value=[make()][0]!({inner:{read(this:void):unknown{return this}}});`
const savedGetMethodSource = `function make(){return ({inner}:{inner:{read():unknown}})=>inner.read()===inner}export const value=[make()][0]!({inner:{read():unknown{return this}}});`
const savedGetOrderSource = `export function run(fail=false){const events:string[]=[];const original={get read():()=>string{events.push("get");if(fail)throw 9;return function(this:void){events.push(this===undefined?"detached":"attached");return "safe"}}};let inner:{read():string}=original;try{const read=inner.read;inner={read(){events.push("replacement");return "wrong"}};events.push("replace");return {value:read(),events}}catch(error){return {events,error}}}`

// Known donors retain their original receiver cut through the existing source
// query. Independent unknowns cannot be fulfilled by a known sibling outcome.
func TestSavedGetSelectionControls(t *testing.T) {
	for _, row := range []struct{ name, source, placement string }{
		{"reverse", savedGetReverseSource, "isomorphic"},
		{"getter", savedGetGetterSource, "client"},
		{"repeated", savedGetRepeatedSource, "client"},
		{"separate", savedGetSeparateSource, "client"},
		{"detached", savedGetDetachedSource, "isomorphic"},
		{"method", savedGetMethodSource, "isomorphic"},
	} {
		t.Run(row.name, func(t *testing.T) { assertClosurePlacement(t, row.source, row.placement) })
	}
	for _, row := range []struct {
		name, source     string
		browser, unknown bool
	}{
		{"unknown", savedGetUnknownSource, true, true},
		{"effect-known-return", savedGetKnownEffectSource, false, true},
		{"unknown-return", savedGetUnknownReturnSource, true, true},
		{"throw", savedGetThrowSource, false, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/closure.ts", Source: row.source, Diagnostics: "semantic"})
			browser, unknown := reentrantInitializerEffects(t, r, row.source, true)
			if browser != row.browser || row.name != "throw" && unknown != row.unknown {
				t.Fatalf("browser=%v unknown=%v, want %v %v", browser, unknown, row.browser, row.unknown)
			}
		})
	}
}

// Emitted JavaScript must acquire the getter once, retain detached this, and
// stop before receiver replacement or Call when the original Get throws.
func TestSavedGetEmittedOrder(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/saved-get-order.ts", Source: savedGetOrderSource, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			file := filepath.Join(t.TempDir(), "order.mts")
			if err := os.WriteFile(file, []byte(r.Code), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			const runner = `import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';const{run}=await import(pathToFileURL(process.argv[1]).href);assert.deepEqual(run(),{events:['get','replace','detached'],value:'safe'});assert.deepEqual(run(true),{events:['get'],error:9});`
			if output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput(); err != nil {
				t.Fatalf("emitted order: %v %s", err, output)
			}
		})
	}
}
