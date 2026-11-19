package exactcompiler

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Every assertion observes the exact Get fact, not the earlier writer's fact.
func TestMemberWriterOriginalCallInputs(t *testing.T) {
	for _, c := range []struct {
		name, writer, setup, suffix string
		browser                     bool
	}{
		{"writer-owned-getter", `box.field={get value(){return next.value}};`, `put(box,{get value(){return document.title}});`, "", true},
		{"writer-owned-safe-last", `box.field={get value(){return next.value}};`, `put(box,{get value(){return document.title}});put(box,{value:'safe'});`, "", false},
		{"writer-owned-browser-last", `box.field={get value(){return next.value}};`, `put(box,{value:'safe'});put(box,{get value(){return document.title}});`, "", true},
		{"writer-owned-current-member", `box.field={get value(){return next.value}};`, `const input={value:'safe'};put(box,input);input.value=document.title;`, "", true},
		{"writer-owned-acquired-object", `box.field={get value(){return next.value}};`, `let input={get value(){return document.title}};put(box,input);input={value:'safe'};`, "", true},
		{"browser-last", "", `put(box,{value:'safe'});put(box,{get value(){return document.title}});`, "", true},
		{"safe-last", "", `put(box,{get value(){return document.title}});put(box,{value:'safe'});`, "", false},
		{"read-between-browser", "", `put(box,{get value(){return document.title}});`, `put(box,{value:'safe'});`, true},
		{"read-between-safe", "", `put(box,{value:'safe'});`, `put(box,{get value(){return document.title}});`, false},
		{"throw-before-Put", `throw 9;box.field=next;`, `try{put(box,{get value(){return document.title}})}catch{}`, "", false},
		{"throw-after-Put", `box.field=next;throw 9;`, `try{put(box,{get value(){return document.title}})}catch{}`, "", true},
		{"scalar-snapshot", `box.field={value:next as unknown as string};`, `let text='safe';put(box,text as unknown as {value:string});text=document.title;`, "", false},
		{"object-snapshot", "", `let input={get value(){return document.title}};put(box,input);input={value:'safe'};`, "", true},
		{"object-safe-snapshot", "", `let input={value:'safe'};put(box,input);input={get value(){return document.title}};`, "", false},
		{"object-current-member", "", `const input={value:'safe'};put(box,input);input.value=document.title;`, "", true},
		{"argument-getter-cut", "", `const args={get target(){return box},get input(){return {get value(){return document.title}}}};put(args.target,args.input);`, "", true},
		{"argument-scalar-getter-snapshot", "", `let chosen={value:'safe'};const args={get input(){return chosen}};put(box,args.input);chosen={get value(){return document.title}};`, "", false},
		{"argument-effect-not-replayed", "", `const args={get input(){document.title;return {value:'safe'}}};put(box,args.input);`, "", false},
		{"argument-Throw-before-Put", "", `const args={get input():{value:string}{throw 9}};try{put(box,args.input)}catch{}`, "", false},
		{"conditional", "", `declare const choose:boolean;if(choose)put(box,{get value(){return document.title}});`, "", true},
		{"unknown-overlap", "", `declare function mutate(box:unknown):void;put(box,{get value(){return document.title}});mutate(box);`, "", true},
	} {
		t.Run(c.name, func(t *testing.T) {
			writer := c.writer
			if writer == "" {
				writer = "box.field=next;"
			}
			source := `export{};class Box{field={value:'safe'}}function put(box:{field:{value:string}},next:{value:string}){` + writer + `}const box=new Box();` + c.setup + `export const value=box.field.value;` + c.suffix
			_, _, summary := currentProxyCaller(t, source, "export const value")
			browser := false
			for _, effect := range summary.EffectSources {
				browser = browser || effect.Environment == "browser"
			}
			if browser != c.browser {
				t.Fatal("writer original Call/input/phase relation", summary.EffectSources)
			}
		})
	}
}

// The same declared field law applies through the factory's creating scope.
// The writer proof observes the later original read, never the earlier New.
func TestMemberWriterFactoryReplacement(t *testing.T) {
	for _, c := range []struct {
		name, setup, suffix string
		browser             bool
	}{
		{"safe-last", `put(box,{get value(){return document.title}});put(box,{value:'safe'});`, "", false},
		{"browser-last", `put(box,{value:'safe'});put(box,{get value(){return document.title}});`, "", true},
		{"read-between-safe", `put(box,{value:'safe'});`, `put(box,{get value(){return document.title}});`, false},
		{"read-between-browser", `put(box,{get value(){return document.title}});`, `put(box,{value:'safe'});`, true},
	} {
		t.Run(c.name, func(t *testing.T) {
			source := `function make(){class Box{field={value:'safe'}}return new Box()}function put(box:{field:{value:string}},next:{value:string}){box.field=next}const box=make();` + c.setup + `export const value=box.field.value;` + c.suffix
			_, _, summary := currentProxyCaller(t, source, "export const value")
			browser := false
			for _, e := range summary.EffectSources {
				browser = browser || e.Environment == "browser"
			}
			if browser != c.browser || !c.browser && len(summary.EffectSources) != 0 {
				t.Fatal("factory original reader cut", summary.EffectSources)
			}
		})
	}
}

// A source Call occurrence alone cannot order a deferred write before a later
// proved writer followed by suspension. Preserve the known donor beside that
// timing uncertainty. The activated continuation can precede the resumed read.
func TestMemberWriterUnprovedCallTiming(t *testing.T) {
	const source = `class Box{field={value:'safe'}}async function later(box:Box){await 0;box.field={get value(){return document.title}}}function put(box:Box){box.field={value:'safe'}}const box=new Box();later(box);put(box);await 0;export const value=box.field.value;`
	assertSymbolicInitializerDonors(t, source)
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/writer-timing.ts", Source: source, Target: target, Diagnostics: "semantic"})
		denied := false
		for _, d := range response.Diagnostics {
			denied = denied || d.Code == "EXACT2101"
		}
		if response.Error != "" || response.Code != "" || !denied {
			t.Fatal("unproved writer timing granted artifact", target, response.Error, response.Diagnostics, response.Code)
		}
	}
}

func TestMemberWriterDefaultPhase(t *testing.T) {
	for _, c := range []struct {
		name, call string
		browser    bool
	}{
		{"activated", `put(box)`, true},
		{"supplied", `put(box,{value:'safe'})`, false},
		{"dormant", ``, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			source := `export{};class Box{field={value:'safe'}}function put(box:Box,next:{value:string}={get value(){return document.title}}){box.field=next}const box=new Box();` + c.call + `;export const value=box.field.value;`
			_, _, summary := currentProxyCaller(t, source, "export const value")
			browser := false
			for _, e := range summary.EffectSources {
				browser = browser || e.Environment == "browser"
			}
			if browser != c.browser {
				t.Fatal("writer default phase", summary.EffectSources)
			}
		})
	}
}

// The ordinary exported function is executed by its host. These emitted checks
// protect argument acquisition once, abrupt completion and reads between Calls.
func TestMemberWriterEmittedPhase(t *testing.T) {
	const source = `export function read(fail=false){function make(){class Box{field={value:'safe'}}return new Box()}function put(box:{field:{value:string}},next:{value:string}){box.field=next}const box=make();const events:string[]=[];const args={get input(){events.push('argument');if(fail)throw 9;return {get value(){events.push('value');return 'browser'}}}};try{put(box,args.input)}catch(e){return {events,error:e,value:box.field.value}}const first=box.field.value;put(box,{value:'safe'});const second=box.field.value;return {events,first,second}}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/member-writer-phase.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(response.Error, response.Diagnostics)
			}
			file := filepath.Join(t.TempDir(), "writer.mts")
			if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			const runner = `import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';const{read}=await import(pathToFileURL(process.argv[1]).href);assert.deepEqual(read(),{events:['argument','value'],first:'browser',second:'safe'});assert.deepEqual(read(true),{events:['argument'],error:9,value:'safe'});`
			if output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput(); err != nil {
				t.Fatalf("writer phase %v %s", err, output)
			}
		})
	}
}

// Member alternatives retain their originating writer across ordinary container
// paths as well as constructed fields. A source capture is not just an AST node.
func TestMemberWriterCapturedDestinations(t *testing.T) {
	for _, row := range []struct{ name, setup, read string }{
		{"literal", `const box={field:{value:'safe'}};function put(box:{field:{value:string}},next:{value:string}){box.field={get value(){return next.value}}}`, `box.field.value`},
		{"array", `const box=[{value:'safe'}];function put(box:{value:string}[],next:{value:string}){box[0]={get value(){return next.value}}}`, `box[0].value`},
	} {
		for _, browser := range []bool{false, true} {
			name := row.name + "-safe"
			if browser {
				name = row.name + "-browser"
			}
			t.Run(name, func(t *testing.T) {
				input := `{value:'safe'}`
				if browser {
					input = `{get value(){return document.title}}`
				}
				source := row.setup + `;put(box,` + input + `);export const value=` + row.read + `;`
				placement := "isomorphic"
				if browser {
					placement = "client"
				}
				t.Run("donor", func(t *testing.T) {
					_, _, summary := currentProxyCaller(t, source, "export const value")
					got := false
					for _, effect := range summary.EffectSources {
						got = got || effect.Environment == "browser"
					}
					if got != browser {
						t.Fatal("writer capture lost at container delivery", summary.EffectSources)
					}
				})
				t.Run("placement", func(t *testing.T) { assertClosurePlacement(t, source, placement) })
			})
		}
	}
}

// Strict target artifacts consume the captured getter only at the original
// exported read. Server pruning must not perform its browser Get.
func TestMemberWriterCapturedEmission(t *testing.T) {
	const source = `class Box{field={value:'safe'}}function put(box:Box,next:{value:string}){box.field={get value(){return next.value}}}const box=new Box();put(box,{get value(){return document.title}});export const value=box.field.value;export const stable='stable';`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/writer-captured-emission.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(response.Error, response.Diagnostics)
			}
			file := filepath.Join(t.TempDir(), "captured.mts")
			if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			const runner = `import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';let reads=0;const before=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{configurable:true,value:{get title(){reads++;return 'browser'}}});try{const m=await import(pathToFileURL(process.argv[1]).href);assert.equal(m.stable,'stable');const client=process.argv[2]==='client';assert.equal(reads,client?1:0);assert.equal(Object.hasOwn(m,'value'),client);if(client)assert.equal(m.value,'browser')}finally{if(before)Object.defineProperty(globalThis,'document',before);else delete globalThis.document}`
			if output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file, string(target)).CombinedOutput(); err != nil {
				t.Fatalf("captured writer emission %v %s", err, output)
			}
		})
	}
}

// Refusing a Call's complete input relation cannot erase a separately indexed
// possible write. Known non-invoking bodies and dormant definitions stay deferred.
func TestMemberWriterRefusedInputs(t *testing.T) {
	for _, row := range []struct {
		name, setup      string
		browser, unknown bool
	}{
		{"opaque-callback", `declare function invoke(fn:()=>void):void;invoke(()=>{box.field={get value(){return document.title}}});`, true, true},
		{"opaque-callback-after-write", `declare function invoke(fn:()=>void):void;invoke(()=>{box.field={get value(){return document.title}}});box.field={value:'safe'};await 0;`, true, true},
		{"known-callback", `function invoke(fn:()=>void){fn()}invoke(()=>{box.field={get value(){return document.title}}});`, true, false},
		{"nested-known-callback", `function invoke(fn:()=>void){fn()}function forward(fn:()=>void){invoke(fn)}forward(()=>{box.field={get value(){return document.title}}});`, true, false},
		{"stored-callback", `let saved:(()=>void)|undefined;function store(fn:()=>void){saved=fn}store(()=>{box.field={get value(){return document.title}}});`, false, false},
		{"deferred-generator", `function* invoke(fn:()=>void){fn()}invoke(()=>{box.field={get value(){return document.title}}});`, false, false},
		{"activated-default-callback", `function invoke(fn=()=>{box.field={get value(){return document.title}}}){fn()}invoke();`, true, false},
		{"bypassed-default-callback", `function invoke(fn=()=>{box.field={get value(){return document.title}}}){fn()}invoke(()=>{});`, false, false},
		{"recursive-callback", `function invoke(fn:()=>void,n:number){if(n===0){fn();return}invoke(fn,n-1)}invoke(()=>{box.field={get value(){return document.title}}},1);`, true, false},
		{"ignored-callback", `function ignore(fn:()=>void){}ignore(()=>{box.field={get value(){return document.title}}});`, false, false},
		{"throw-before-callback", `function invoke(fn:()=>void){throw 9}try{invoke(()=>{box.field={get value(){return document.title}}})}catch{}`, false, false},
		{"dormant-writer", `function write(){box.field={get value(){return document.title}}}declare function opaque():void;opaque();`, false, false},
		{"mixed-selection", `function write(){box.field={get value(){return document.title}}}declare function opaque():void;declare const choose:boolean;const selected=choose?write:opaque;selected();`, true, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			_, _, summary := currentProxyCaller(t, `const box={field:{value:'safe'}};`+row.setup+`export const value=box.field.value;`, "export const value")
			browser, unknown := false, false
			for _, effect := range summary.EffectSources {
				browser = browser || effect.Environment == "browser"
				unknown = unknown || effect.Environment == "unknown"
			}
			if browser != row.browser || row.unknown && !unknown {
				t.Fatal("refused writer lost MAY coverage or entered a dormant body", summary.EffectSources)
			}
		})
	}
}

// Source replacement must not reuse an earlier wrapper's invocation relation.
func TestMemberWriterCallbackSourceReplacement(t *testing.T) {
	session := NewSession()
	for _, called := range []bool{true, false, true} {
		body := ""
		if called {
			body = "fn()"
		}
		source := `const box={field:{value:'safe'}};function invoke(fn:()=>void){` + body + `}invoke(()=>{box.field={get value(){return document.title}}});export const value=box.field.value;`
		response := session.Execute(Request{Kind: "analyze", ID: "/virtual/writer-callback-replace.ts", Source: source, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatal(response.Error, response.Diagnostics)
		}
		found, browser := false, false
		for _, fact := range response.Analysis.Callables {
			if fact.Name == fmt.Sprint("module@", strings.Index(source, "export const value")) {
				found = true
				for _, effect := range fact.EffectSources {
					browser = browser || effect.Environment == "browser"
				}
			}
		}
		if !found || browser != called {
			t.Fatal("stale callback source input", response.Analysis)
		}
	}
}

func TestMemberWriterCallbackEmitted(t *testing.T) {
	const source = `export function read(){const events:string[]=[];const box={field:{value:'safe'}};function invoke(fn:()=>void){fn()}function forward(fn:()=>void){invoke(fn)}forward(()=>{events.push('callback');box.field={get value(){events.push('get');return 'browser'}}});return {value:box.field.value,events}}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/writer-callback.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(response.Error, response.Diagnostics)
			}
			file := filepath.Join(t.TempDir(), "callback.mts")
			if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			const runner = `import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';const{read}=await import(pathToFileURL(process.argv[1]).href);assert.deepEqual(read(),{value:'browser',events:['callback','get']});`
			if output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput(); err != nil {
				t.Fatalf("callback emitted phase %v %s", err, output)
			}
		})
	}
}

// An unavailable Call result still owns its source binding. Indexed possible
// writes through that same binding remain visible without a fresh-object proof.
func TestMemberWriterOpaqueResultOrigin(t *testing.T) {
	for _, row := range []struct {
		name, creation, setup, suffix string
		browser                       bool
	}{
		{"ambient-result", `declare function make():{field:{value:string}};const box=make();`, `put(box);`, ``, true},
		{"create-result", `const box=Object.create(null) as {field:{value:string}};`, `put(box);`, ``, true},
		{"returned-create-result", `function make(){return Object.create(null) as {field:{value:string}}}const box=make();`, `put(box);`, ``, true},
		{"later-writer", `declare function make():{field:{value:string}};const box=make();`, ``, `put(box);`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := row.creation + `function put(box:{field:{value:string}}){box.field={get value(){return document.title}}}` + row.setup + `export const value=box.field.value;` + row.suffix
			_, _, summary := currentProxyCaller(t, source, "export const value")
			browser, unknown := false, false
			for _, effect := range summary.EffectSources {
				browser = browser || effect.Environment == "browser"
				unknown = unknown || effect.Environment == "unknown"
			}
			if browser != row.browser || !unknown {
				t.Fatal("opaque result lost original binding or residual", summary.EffectSources)
			}
		})
	}
}

// A residual receiver cannot turn recursive getter projection into unbounded
// origin acquisition. Retain the reached donor while widening the recursive read.
func TestMemberWriterOpaqueResultRecursion(t *testing.T) {
	const source = `declare function make():any;const box=make();function put(box:any){box.field={get value():string{document.title;return box.field.value}}}put(box);export const value=box.field.value;`
	assertSymbolicInitializerDonors(t, source)
}

// Opaque invocation keeps a callback's captured RHS while withholding performed
// Call authority. Replacing that captured value invalidates earlier donor facts.
func TestMemberWriterRefusedCapturedValues(t *testing.T) {
	for _, rhs := range []string{"v", "{get value(){return v.value}}"} {
		t.Run(rhs, func(t *testing.T) {
			session := NewSession()
			for _, browser := range []bool{true, false, true} {
				value := "{value:'safe'}"
				if browser {
					value = "{get value(){return document.title}}"
				}
				source := `declare function invoke(fn:()=>void):void;const box={field:{value:'safe'}};function make(v:{value:string}){return ()=>{box.field=` + rhs + `}}const write=make(` + value + `);invoke(write);export const value=box.field.value;`
				response := session.Execute(Request{Kind: "analyze", ID: "/virtual/refused-captured-value.ts", Source: source, Diagnostics: "semantic"})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
					t.Fatal(response.Error, response.Diagnostics)
				}
				found, gotBrowser, unknown := false, false, false
				for _, fact := range response.Analysis.Callables {
					if fact.Name != fmt.Sprint("module@", strings.Index(source, "export const value")) {
						continue
					}
					found = true
					for _, effect := range fact.EffectSources {
						gotBrowser = gotBrowser || effect.Environment == "browser"
						unknown = unknown || effect.Environment == "unknown"
					}
				}
				if !found || gotBrowser != browser || !unknown {
					t.Fatal("refused callback lost captured RHS or independent residual", response.Analysis)
				}
			}
		})
	}
}

// The server placement decision needs the getter captured by a possible
// writer even when its caller is opaque. A plain captured field can still emit.
func TestComponentRefusedWriterPlacement(t *testing.T) {
	for _, row := range []struct {
		name, value, invoke string
		browser             bool
	}{
		{"getter", "{get value(){return document.title}}", "invoke(write);", true},
		{"plain", "{value:'safe'}", "invoke(write);", false},
		{"guarded argument with callee getter", "{value:'safe'}", `const store={get get(){void document.title;return (_:object)=>0}};
   function read(value:unknown){return typeof value==='object' && value!==null ? store.get(value) : undefined}
   read({});invoke(write);`, true},
		{"reassigned object", "{get value(){return document.title}}", "let value:object={};value=write;invoke(value as ()=>void);", true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `import {TaskContext,type Component} from '@exactjs/core';
declare function invoke(fn:()=>void):void;
export function Page(this:Component<{label:string}>){
 this.state.label='';
 const run=(task:TaskContext=TaskContext.server())=>{
  const box={field:{value:'safe'}};
  function make(v:{value:string}){return ()=>{box.field=v}}
  const write=make(` + row.value + `);` + row.invoke + `
  this.state.label=box.field.value;
 };
 return()=> <button onClick={()=>run()}>{this.state.label}</button>;
}`
			response := NewSession().Execute(Request{Kind: "compile", ID: "refused-writer-placement.tsx", Source: source, Target: TargetServer, Diagnostics: "semantic"})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if row.browser {
				for _, diagnostic := range response.Diagnostics {
					if diagnostic.Code == "EXACT2001" && strings.Contains(diagnostic.Message, "document") && response.Code == "" {
						return
					}
				}
				t.Fatal("expected server placement refusal naming the captured getter", response.Diagnostics)
			}
			if response.Code == "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatal("plain captured field failed to emit", response.Diagnostics)
			}
		})
	}
}
