package exactcompiler

import (
	"encoding/json"
	"strings"
	"testing"
)

// Erased wrappers must not turn a direct eval into an unreachability proof.
func TestPolicyArtifactWrappedDirectEval(t *testing.T) {
	for _, callee := range []string{`eval`, `(eval)`, `((eval))`, `(eval as typeof eval)`, `(<typeof eval>eval)`, `(eval!)`, `(eval satisfies typeof eval)`} {
		t.Run(callee, func(t *testing.T) {
			source := `export {};const unused=class{
/** @exact keep=secret */ value='PRIVATE_REVIEW_PAYLOAD'};export function work(){return ` + callee + `('unused')}`
			r := NewSession().Execute(Request{Kind: "compile", ID: "wrapped-eval.ts", Source: source, Target: TargetClient, SourceMap: true, PreserveOrdinaryModules: true})
			if r.Error != "" || !hasDiagnosticCode(r.Diagnostics, "EXACT3022") || r.Code != "" || r.SourceMap != nil {
				t.Fatalf("direct eval: error=%s diagnostics=%#v code=%v map=%v", r.Error, r.Diagnostics, r.Code != "", r.SourceMap != nil)
			}
		})
	}
}

// A stored structural contract remains authoritative across an unqualified alias.
func TestPolicyArtifactStructuralAlias(t *testing.T) {
	for _, field := range []string{`value:Tagged=payload`, `value:Readonly<Tagged>=payload`, `value:Tagged[]=[payload]`, `value:Promise<Tagged>=Promise.resolve(payload)`, `value:Map<string,Tagged>=new Map([['key',payload]])`, `value:Bag<Tagged>={data:payload}`, `value:{[key:string]:Tagged}={item:payload}`, `value:{prototype:Tagged}={prototype:payload}`} {
		t.Run(field, func(t *testing.T) {
			source := artifactStoredAliasPrefix() + `const record={label:'public',factory:class{` + field + `}};export function work(){console.log(record.label)}`
			r := NewSession().Execute(Request{Kind: "compile", ID: "structural-alias.ts", Source: source, Target: TargetClient, SourceMap: true})
			if r.Error != "" || !hasDiagnosticCode(r.Diagnostics, "EXACT3022") || r.Code != "" || r.SourceMap != nil {
				t.Fatalf("stored alias: error=%s diagnostics=%#v code=%v contains=%v", r.Error, r.Diagnostics, r.Code != "", strings.Contains(r.Code, "PRIVATE_REVIEW_PAYLOAD"))
			}
		})
	}
}

func artifactStoredAliasPrefix() string {
	return `export {};interface Tagged{
/** @exact keep=secret */ value:string}
interface Bag<T>{data:T}
const payload={value:'PRIVATE_REVIEW_PAYLOAD'};`
}

// Constructor prototypes are checker instance views, not stored instance fields.
// Callable outputs and unused generic arguments remain separate obligations.
func TestPolicyArtifactStoredDataPublicControls(t *testing.T) {
	for _, definition := range []string{
		`class Instance{declare value:Tagged;}const record={label:'public',factory:class{value:typeof Instance=Instance}};`,
		`declare const deferred:{load:()=>Tagged;make:new()=>Tagged};const record={label:'public',factory:class{value=deferred}};`,
		`interface Phantom<T>{label:string;brand?:()=>T}const record={label:'public',factory:class{value:Phantom<Tagged>={label:'public'}}};`,
		`interface Phantom<T>{label:string}const record={label:'public',factory:class{value:Promise<Phantom<Tagged>>=Promise.resolve({label:'public'})}};`,
		`declare const stored:Tagged & {label:string};const record={label:'public',factory:class{value=stored.label}};`,
	} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "stored-public.ts", Source: `export {};interface Tagged{
/** @exact keep=secret */ value:string}` + definition + `export function work(){console.log(record.label);return 'public'}`, Target: TargetClient, SourceMap: true})
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
			t.Fatalf("public stored contract rejected (%s): %s %#v", definition, r.Error, r.Diagnostics)
		}
	}
}

// Indirect eval cannot access module lexicals. Removing an unused private
// definition preserves its result, without interpreting the eval string.
func TestPolicyArtifactIndirectEvalPruning(t *testing.T) {
	for _, callee := range []string{`(0,eval)`, `globalThis.eval`, `eval?.`} {
		call := callee + `('typeof unused')`
		if callee == `eval?.` {
			call = `eval?.('typeof unused')`
		}
		source := `export {};const unused=class{
/** @exact keep=secret */ value='PRIVATE_REVIEW_PAYLOAD'};export function work(){return ` + call + `}`
		r := NewSession().Execute(Request{Kind: "compile", ID: "indirect-eval.ts", Source: source, Target: TargetClient, SourceMap: true, PreserveOrdinaryModules: true})
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
			t.Fatalf("indirect eval %s: %s %#v", callee, r.Error, r.Diagnostics)
		}
		data, _ := json.Marshal(r.SourceMap)
		if strings.Contains(r.Code, "PRIVATE_REVIEW_PAYLOAD") || strings.Contains(string(data), "PRIVATE_REVIEW_PAYLOAD") {
			t.Fatal("dead private source retained")
		}
		artifactEvalNode(t, r.Code, `const result=sandbox.exports.work();if(result!=='undefined')throw Error(String(result));`)
	}
}

// Public direct eval retains its lexical class. The server retains the private
// class too, without constructing it or evaluating its deferred field initializer.
func TestPolicyArtifactDirectEvalEmittedSemantics(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		annotation := ""
		if target == TargetServer {
			annotation = "/** @exact keep=secret */"
		}
		source := `export {};let constructed=0;const unused=class{
` + annotation + ` value='public';constructor(){constructed++}};export function work(){const result=(eval as typeof eval)('unused');return {kind:typeof result,constructed}}`
		r := NewSession().Execute(Request{Kind: "compile", ID: "direct-eval-runtime.ts", Source: source, Target: target, PreserveOrdinaryModules: true})
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
			t.Fatalf("eval semantics: %s %#v", r.Error, r.Diagnostics)
		}
		artifactEvalNode(t, r.Code, `const r=sandbox.exports.work();if(r.kind!=='function'||r.constructed!==0)throw Error(JSON.stringify(r));`)
	}
}

// Use a module wrapper so indirect eval does not see the VM script's global
// lexical environment. Official TS7 erasure remains owned by sourceNodeScript.
func artifactEvalNode(t *testing.T, code, assertion string) {
	t.Helper()
	sourceNodeScript(t, code, `const fs=require('node:fs'),vm=require('node:vm');const sandbox={exports:{},console};vm.runInNewContext('(function(exports){'+fs.readFileSync(process.argv[1],'utf8')+'\n})(exports)',sandbox);`+assertion)
}

// An open template branch cannot suppress independently stored secret evidence.
// An unrelated free parameter cannot discharge a closed expanding obligation.
func TestPolicyArtifactTemplateObligations(t *testing.T) {
	for _, contract := range []string{
		`interface Chain<T>{next:Chain<Promise<T>>;private:Tagged}function make<T>(input:T):Chain<T>{return {} as Chain<T>} `,
		`type Closed<U extends unknown[]>=Array<Closed<[...U,0]>>;type Deferred<A,B>=B extends string?A:Promise<B>;interface Chain<T>{next:Chain<Deferred<Closed<[]>,T>>;value:T}function make<T>(input:T):Chain<T>{return {} as Chain<T>} `,
		`interface Growing<T,U extends unknown[]>{next:Growing<T,[...U,0]>;value:U['length'] extends 12?Tagged:string}function make<T>(input:T):Growing<T,[]>{return {} as Growing<T,[]>} `,
		`interface Growing<U extends unknown[]>{next:Growing<[...U,0]>;value:U['length'] extends 12?Tagged:string}function make<T>(input:T):Growing<[T]>{return {} as Growing<[T]>} `,
		`interface Growing<T extends unknown[]>{next:Growing<[...T,0]>;value:T['length'] extends 12?Tagged:string}interface Mixed<T>{open:T;closed:Growing<[]>}function make<T>(input:T):Mixed<T>{return {} as Mixed<T>} `,
	} {
		source := artifactStoredAliasPrefix() + contract + `export function work(){void make;return "public"}`
		// Retained asserted bodies are obligations even when the public caller
		// does not execute them during module initialization.
		r := NewSession().Execute(Request{Kind: "compile", ID: "template-obligation.ts", Source: source, Target: TargetClient, SourceMap: true})
		if r.Error != "" || !hasDiagnosticCode(r.Diagnostics, "EXACT3022") || r.Code != "" || r.SourceMap != nil {
			t.Fatalf("template obligation: %s %#v", r.Error, r.Diagnostics)
		}
	}
}

func TestPolicyArtifactProjectedDynamicScope(t *testing.T) {
	source := `export {};import {TaskContext,type Component} from '@exactjs/core';const unused=class{
/** @exact keep=secret */ value='PRIVATE_REVIEW_PAYLOAD'};
export function Page(this:Component<{}>){const run=(task:TaskContext=TaskContext.server())=>{(eval as typeof eval)('unused')};return()=> <button onClick={()=>run()}>Run</button>;}`
	r := NewSession().Execute(Request{Kind: "compile", ID: "projected-eval.tsx", Source: source, Target: TargetClient, SourceMap: true, PreserveOrdinaryModules: true})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
		t.Fatalf("projected eval: %s %#v", r.Error, r.Diagnostics)
	}
	data, _ := json.Marshal(r.SourceMap)
	if strings.Contains(r.Code, "PRIVATE_REVIEW_PAYLOAD") || strings.Contains(string(data), "PRIVATE_REVIEW_PAYLOAD") {
		t.Fatal("projected source delivered")
	}
}

// Replacement and reset must not reuse the previous source's containment facts.
func TestPolicyArtifactAliasGeneration(t *testing.T) {
	session := NewSession()
	for i, secret := range []bool{true, false, true, false} {
		annotation := ""
		if secret {
			annotation = "/** @exact keep=secret */"
		}
		source := `export {};interface Tagged{
` + annotation + ` value:string}const payload={value:'public'};const record={label:'public',factory:class{value:Tagged=payload}};export function work(){return record.label}`
		r := session.Execute(Request{Kind: "compile", ID: "alias-replacement.ts", Source: source, Target: TargetClient, SourceMap: true})
		if r.Error != "" || hasDiagnosticCode(r.Diagnostics, "EXACT3022") != secret {
			t.Fatalf("generation %d: %s %#v", i, r.Error, r.Diagnostics)
		}
		if secret {
			if r.Code != "" || r.SourceMap != nil {
				t.Fatal("private generation delivered")
			}
		} else {
			if r.Code == "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatalf("public replacement: %#v", r.Diagnostics)
			}
			artifactEvalNode(t, r.Code, `if(sandbox.exports.work()!=='public')throw Error('replacement');`)
		}
		if i == 1 {
			session.Execute(Request{Kind: "reset"})
		}
	}
}

// Server ownership can retain the same structural contract without executing a
// deferred constructor. Public field reads still occur exactly once.
func TestPolicyArtifactStructuralServerSemantics(t *testing.T) {
	source := artifactStoredAliasPrefix() + `let reads=0,constructed=0;const record={get label(){reads++;return 'public'},factory:class{value:Tagged=payload;constructor(){constructed++}}};export function work(){const label=record.label;return {label,reads,constructed}}`
	r := NewSession().Execute(Request{Kind: "compile", ID: "structural-server.ts", Source: source, Target: TargetServer})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
		t.Fatalf("server alias: %s %#v", r.Error, r.Diagnostics)
	}
	artifactEvalNode(t, r.Code, `const r=sandbox.exports.work();if(r.label!=='public'||r.reads!==1||r.constructed!==0)throw Error(JSON.stringify(r));`)
}
