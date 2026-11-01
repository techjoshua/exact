package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// These authored sources distinguish the actual global acquisition from a
// same-spelling declaration, a structural type, and an observable replacement.
func TestFunctionPrototypeSourceIdentity(t *testing.T) {
	for _, test := range []struct {
		name, source, placement string
	}{
		{"standard", `export const value=Function.prototype;`, "isomorphic"},
		{"globalThis", `export const value=globalThis.Function.prototype;`, "isomorphic"},
		{"shadow-getter", `const Function={get prototype(){return document.title}};export const value=Function.prototype;`, "client"},
		{"foreign", `declare const foreign:{prototype:object};export const value=foreign.prototype;`, "unknown"},
		{"declaration-only", `declare const Function:FunctionConstructor;export const value=Function.prototype;`, "unknown"},
		{"replaced-global", `declare const replacement:FunctionConstructor;globalThis.Function=replacement;export const value=Function.prototype;`, "unknown"},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/function-prototype-" + test.name + ".ts", Source: `export {};` + test.source, Diagnostics: "semantic"})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			// Unavailable external authority may already reject the owning
			// initializer. A TypeScript setup error is never a passing refusal.
			refused := false
			for _, diagnostic := range response.Diagnostics {
				if diagnostic.Severity != "error" {
					continue
				}
				if test.placement == "unknown" && diagnostic.Code == "EXACT2101" {
					refused = true
				} else {
					t.Fatal("invalid source witness", response.Diagnostics)
				}
			}
			if refused {
				return
			}
			found := false
			for _, exported := range response.Analysis.Exports {
				if exported.Name == "value" {
					found = true
					if exported.Placement != test.placement {
						t.Fatalf("placement=%s want=%s", exported.Placement, test.placement)
					}
				}
			}
			if !found {
				t.Fatal("missing authored export")
			}
		})
	}
}

// A completed earlier occurrence cannot pay a real recursive edge, unknown
// reference work or an intervening call's independent browser/unknown effects.
func TestCompletedPropertyPrefixRefusals(t *testing.T) {
	const declaration = `function read(){return 1}function install(){Object.defineProperty(Function.prototype,'apply',{get(){return ()=> 'installed'},configurable:true});return 1}`
	for _, test := range []struct {
		name, source string
		browser      bool
	}{
		{"recursive", `function read(){return 1}function install():number{Object.defineProperty(Function.prototype,'apply',{get(){return ()=> 'installed'},configurable:true});return install()}install();install();export const value=read.apply(undefined,[]);`, false},
		{"unknown-thenable", `declare const foreign:PromiseLike<number>;async function pending(){return await foreign}` + declaration + `install();pending();install();export const value=read.apply(undefined,[]);`, false},
		{"intervening-effects", `declare function foreign(value:unknown):void;` + declaration + `install();foreign(document.title='kept');install();export const value=read.apply(undefined,[]);`, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", Target: TargetServer, ID: "/virtual/property-prefix-" + test.name + ".ts", Source: test.source, Diagnostics: "semantic"})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			refused := false
			for _, diagnostic := range response.Diagnostics {
				if diagnostic.Severity == "error" {
					if diagnostic.Code != "EXACT2101" {
						t.Fatal("invalid source witness", response.Diagnostics)
					}
					refused = true
				}
			}
			unknown, browser := false, false
			for _, fact := range response.Analysis.Callables {
				if fact.Kind != "module-initializer" {
					continue
				}
				for _, effect := range fact.EffectSources {
					unknown = unknown || effect.Environment == "unknown"
					browser = browser || effect.Environment == "browser"
				}
			}
			if !refused || !unknown || test.browser && !browser {
				t.Fatalf("refused=%t unknown=%t browser=%t", refused, unknown, browser)
			}
		})
	}
}

// Run prototype mutation in an owned child and restore its exact descriptor
// before assertions or output. The installed getter must remain the actual
// runtime method source, including in a server-targeted emitted module.
func TestFunctionPrototypeGetterEmittedRestoration(t *testing.T) {
	for _, test := range []struct{ name, source string }{
		{"direct-install", `export let observed=0;function read(){return 1}Object.defineProperty(Function.prototype,'apply',{get(){observed++;return ()=> 'installed'},configurable:true});export const value=read.apply(undefined,[]);`},
		{"earlier-call-install", `export let observed=0;function read(){Object.defineProperty(Function.prototype,'apply',{get(){observed++;return ()=> 'installed'},configurable:true});return 1}export const first=read.call(undefined);export const value=read.apply(undefined,[]);`},
		{"entered-install", `export let observed=0;function read(){return 1}function install(){Object.defineProperty(Function.prototype,'apply',{get(){observed++;return ()=> 'installed'},configurable:true});return 1}install();export const value=read.apply(undefined,[]);`},
		{"repeated-installation", `export let observed=0;function read(){return 1}function install(){Object.defineProperty(Function.prototype,'apply',{get(){observed++;return ()=> 'installed'},configurable:true});return 1}install();install();export const value=read.apply(undefined,[]);`},
		{"own-function", `export let observed=0;function read(){return 1}Object.defineProperty(read,'apply',{get(){observed++;return ()=> 'installed'},configurable:true});export const value=read.apply(undefined,[]);`},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(test.name+"/"+string(target), func(t *testing.T) {
				response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/prototype-restoration.ts", Source: test.source, Target: target, Diagnostics: "semantic"})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatal(response.Error, response.Diagnostics)
				}
				module := filepath.Join(t.TempDir(), "prototype.mts")
				if err := os.WriteFile(module, []byte(response.Code), 0600); err != nil {
					t.Fatal(err)
				}
				ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
				t.Cleanup(cancel)
				const runner = `import assert from 'node:assert/strict';
	import {pathToFileURL} from 'node:url';
	const before=Object.getOwnPropertyDescriptor(Function.prototype,'apply');
	let result;
	try { result=await import(pathToFileURL(process.argv[1]).href); }
	finally { Object.defineProperty(Function.prototype,'apply',before); }
	assert.deepEqual(Object.getOwnPropertyDescriptor(Function.prototype,'apply'),before);
	assert.equal(result.value,'installed');
	assert.equal(result.observed,1);
	if ('first' in result) assert.equal(result.first,1);
	console.log('restored');`
				command := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, module)
				output, err := command.Output()
				if err != nil || strings.TrimSpace(string(output)) != "restored" {
					t.Fatalf("prototype restoration: %v %s", err, output)
				}
			})
		}
	}
}
