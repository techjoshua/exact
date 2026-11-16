package exactcompiler

import "testing"

// These source controls distinguish invocation from passing or storing a value.
// They bind actuals at the use edge, never specialize the reusable definition.
func TestRelativeBinderInvocationEffects(t *testing.T) {
	for _, row := range []struct {
		name, setup, body string
		browser           bool
	}{
		{"missing-default", `function invoke(read=browser){return read()}`, `return invoke()`, true},
		{"undefined-default", `function invoke(read=browser){return read()}`, `return invoke(undefined)`, true},
		{"supplied-bypasses-default", `function invoke(read=browser){return read()}`, `return invoke(safe)`, false},
		{"rest-first", `function invoke(...reads:(()=>string)[]){return reads[0]()}`, `return invoke(browser,safe)`, true},
		{"rest-second", `function invoke(...reads:(()=>string)[]){return reads[1]()}`, `return invoke(browser,safe)`, false},
		{"stored-not-invoked", `function store(read:()=>string){return {read}}`, `store(browser);return 'safe'`, false},
		{"passed-not-invoked", `function ignore(read:()=>string){return 'safe'}`, `return ignore(browser)`, false},
		{"method-receiver", `const box={read:browser,invoke(){return this.read()}}`, `return box.invoke()`, true},
		{"call-receiver", `function invoke(this:{read:()=>string}){return this.read()}`, `return invoke.call({read:browser})`, true},
		{"apply-receiver", `function invoke(this:{read:()=>string}){return this.read()}`, `return invoke.apply({read:browser},[])`, true},
		{"arrow-lexical-receiver", `const box={read:browser,make(){return ()=>this.read()}}`, `const saved=box.make();return saved.call({read:safe})`, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `function browser(){return document.title}function safe(){return 'safe'}` + row.setup + `;export function work(){` + row.body + `}`
			r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/relative-binder-" + row.name + ".ts", Source: source, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			summary := findCallable(t, r.Analysis.Callables, "work")
			browser := false
			for _, effect := range summary.EffectSources {
				browser = browser || effect.Environment == "browser"
			}
			if browser != row.browser {
				t.Fatalf("browser=%v want %v: %+v", browser, row.browser, summary.EffectSources)
			}
		})
	}
}

// Emitted behavior protects evaluation order and receiver ownership independently
// of the analysis facts. A supplied callback remains dormant until selected.
func TestRelativeBinderEmittedOrder(t *testing.T) {
	const source = `export function run(){const events:string[]=[];const callback=(name:string)=>()=>{events.push(name);return name};function invoke(first=callback('default'),...rest:(()=>string)[]){return [first(),rest[1]()]};const box={name:'lexical',make(){return ()=>this.name}};const saved=box.make();const result=invoke(undefined,callback('dormant'),callback('selected'));return {result,receiver:saved.call({name:'dynamic'}),events}}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/relative-binder-order.ts", Source: source, Target: target, Diagnostics: "semantic", PreserveOrdinaryModules: true})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			sourceNodeScript(t, r.Code, `const fs=require('node:fs'),vm=require('node:vm'),out={};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:out});const actual=JSON.stringify(out.run());const expected=JSON.stringify({result:['default','selected'],receiver:'lexical',events:['default','selected']});if(actual!==expected)throw Error(actual);`)
		})
	}
}

// Unknown supplied callbacks may be undefined and activate the default. That
// uncertainty must not erase the default donor or become required producer work.
func TestRelativeBinderUnknownDefault(t *testing.T) {
	const source = `function browser(){return document.title}function invoke(read=browser){return read()}export function work(foreign:()=>string){return invoke(foreign)}`
	r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/relative-unknown-default.ts", Source: source, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	summary := findCallable(t, r.Analysis.Callables, "work")
	browser, unknown := false, false
	for _, effect := range summary.EffectSources {
		browser = browser || effect.Environment == "browser"
		unknown = unknown || effect.Environment == "unknown"
	}
	if !browser || !unknown {
		t.Fatalf("unknown default lost independent donor: %+v", summary.EffectSources)
	}
}
