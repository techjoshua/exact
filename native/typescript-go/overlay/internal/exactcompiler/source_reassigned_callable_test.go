package exactcompiler

import (
	"path/filepath"
	"testing"
)

// A mutable callable's current acquired alternatives own invocation effects.
// Its declaration initializer is neither a permanent target nor a performed body.
func TestReassignedCallableRequirements(t *testing.T) {
	root, config := formsSourceFixture(t)
	for _, row := range []struct {
		name, source, required string
		unknown                bool
	}{
		{"replacement", `let notify:()=>string=()=>"safe";notify=()=>document.title;export const value=notify();`, "browser", false},
		{"obsolete body", `let notify:()=>string=()=>document.title;notify=()=>"safe";export const value=notify();`, "", false},
		{"later write", `let notify:()=>string=()=>"safe";export const value=notify();notify=()=>document.title;`, "", false},
		{"saved alias", `let notify:()=>string=()=>document.title;const saved=notify;notify=()=>"safe";export const value=saved();`, "browser", false},
		{"live capture", `let notify:()=>string=()=>"safe";const invoke=()=>notify();notify=()=>document.title;export const value=invoke();`, "browser", false},
		{"conditional foreign", `declare const choose:boolean;declare const foreign:()=>string;let notify:()=>string=()=>document.title;if(choose)notify=foreign;export const value=notify();`, "browser", true},
		{"reassigned formal", `function run(notify:()=>string){notify=()=>document.title;return notify()}export const value=run(()=>"safe");`, "browser", false},
		{"reordered formal", `function run(other:()=>string,notify:()=>string){notify=()=>document.title;return notify()}export const value=run(()=>"other",()=>"safe");`, "browser", false},
		{"server replacement", `/// <reference types="node"/>
let notify:()=>string=()=>"safe";notify=()=>process.cwd();export const value=notify();`, "server", true},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(row.name+"/"+string(target), func(t *testing.T) {
				r := NewSession().Execute(Request{Kind: "analyze", ID: filepath.Join(root, "reassigned-callable.ts"), ConfigFile: config, Source: row.source, Target: target, Diagnostics: "semantic"})
				if r.Error != "" {
					t.Fatal(r.Error, r.Diagnostics)
				}
				for _, diagnostic := range r.Diagnostics {
					if diagnostic.Severity == "error" && !(row.unknown && diagnostic.Code == "EXACT2101") {
						t.Fatal(r.Diagnostics)
					}
				}
				environments := map[string]bool{}
				for _, fact := range r.Analysis.Callables {
					if fact.Kind == "module-initializer" {
						for _, effect := range fact.EffectSources {
							environments[effect.Environment] = true
						}
					}
				}
				if row.required != "" && !environments[row.required] || row.unknown && !environments["unknown"] {
					t.Fatalf("lost required alternatives: %#v", environments)
				}
				if row.required == "" && (environments["browser"] || environments["server"]) {
					t.Fatalf("dormant or later body activated: %#v", environments)
				}
			})
		}
	}
}

// Paired artifacts must exclude a browser invocation on the server while
// retaining its initializer's original execution order and abrupt completion.
func TestReassignedCallableArtifacts(t *testing.T) {
	const source = `let notify:()=>string=()=>"safe";notify=()=>document.title;export const value=notify();`
	const runner = `const assert=require('node:assert/strict');let reads=0;globalThis.document={get title(){reads++;return 'browser'}};const m=require(process.argv[1]);if(process.argv[2]==='client'){assert.equal(m.value,'browser');assert.equal(reads,1)}else{assert.equal('value' in m,false);assert.equal(reads,0)}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/reassigned-artifact.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			sourceNodeScript(t, r.Code, runner, string(target))
		})
	}
}

// Dropping an obsolete body must not drop evaluation of the original initializer.
func TestReassignedCallableInitializerOrder(t *testing.T) {
	const source = `export function run(fail=false){const seen:string[]=[];try{let notify:()=>string=(()=>{seen.push('initialize');if(fail)throw Error('stop');return ()=>{seen.push('old body');return 'old'}})();notify=()=>{seen.push('replacement');return 'new'};return [notify(),seen]}catch(error){return [(error as Error).message,seen]}}`
	const runner = `const assert=require('node:assert/strict');const m=require(process.argv[1]);assert.deepEqual(m.run(),['new',['initialize','replacement']]);assert.deepEqual(m.run(true),['stop',['initialize']]);`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/reassigned-order.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			sourceNodeScript(t, r.Code, runner)
		})
	}
}
