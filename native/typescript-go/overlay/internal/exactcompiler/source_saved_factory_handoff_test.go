package exactcompiler

import (
	"encoding/json"
	"fmt"
	"testing"
)

// Two creations of one closure declaration must retain their own completed
// activation. Saving a member does not retarget it after replacement, and an
// uninvoked sibling contributes no execution effect.
func TestSavedFactoryGetCaptureHandoff(t *testing.T) {
	for _, row := range []struct {
		name, factory, body string
		browser, unknown    bool
	}{
		{"saved-browser", `return ()=>read()`, `const box={read:make(browser)};const sibling=make(safe);const saved=box.read;box.read=sibling;return saved()`, true, false},
		{"saved-safe-dormant-browser", `return ()=>read()`, `const box={read:make(safe)};const sibling=make(browser);const saved=box.read;box.read=sibling;return saved()`, false, false},
		{"unknown-beside-browser", `return ()=>read()`, `const box={read:make(browser)};const sibling=make(safe);const saved=flag?box.read:foreign;box.read=sibling;return saved()`, true, true},
		{"logical-known-and-unknown", `return ()=>read()`, `const box={read:make(browser)};const sibling=make(safe);const saved=(flag&&box.read)||foreign;box.read=sibling;return saved()`, true, true},
		{"nullish-known-and-unknown", `return ()=>read()`, `const box={read:make(browser)};const sibling=make(safe);const saved=(flag?box.read:undefined)??foreign;box.read=sibling;return saved()`, true, true},
		{"finally-safe", `try{return ()=>read()}finally{read=safe}`, `const box={read:make(browser)};const saved=box.read;box.read=make(browser);return saved()`, false, false},
		{"finally-browser", `try{return ()=>read()}finally{read=browser}`, `const box={read:make(safe)};const saved=box.read;box.read=make(safe);return saved()`, true, false},
		{"normal-detached", `return function(this:void){return read()}`, `const box={read:make(browser)};const saved=box.read;box.read=make(safe);return saved()`, true, false},
		{"missing-default", `return (selected=read)=>selected()`, `const box={read:make(browser)};const saved=box.read;box.read=make(safe);return saved()`, true, false},
		{"undefined-default", `return (selected=read)=>selected()`, `const box={read:make(browser)};const saved=box.read;box.read=make(safe);return saved(undefined)`, true, false},
		{"unknown-default", `return (selected=read)=>selected()`, `const box={read:make(browser)};const saved=box.read;box.read=make(safe);return saved(flag?undefined:foreign)`, true, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `function browser(){return document.title}function safe(){return 'safe'}function make(read:()=>string){` + row.factory + `}export function work(flag:boolean,foreign:()=>string){` + row.body + `}`
			r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/saved-factory-handoff.ts", Source: source, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			fact := findCallable(t, r.Analysis.Callables, "work")
			browser, unknown := false, false
			for _, effect := range fact.EffectSources {
				browser = browser || effect.Environment == "browser"
				unknown = unknown || effect.Environment == "unknown"
			}
			if browser != row.browser || unknown != row.unknown {
				t.Fatalf("browser=%v unknown=%v want browser=%v unknown=%v sources=%+v", browser, unknown, row.browser, row.unknown, fact.EffectSources)
			}
			application := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/saved-factory-handoff.ts", Source: source + `;work(true,()=> 'application');`, Diagnostics: "semantic"})
			if application.Error != "" || hasErrorDiagnostic(application.Diagnostics) {
				t.Fatal(application.Error, application.Diagnostics)
			}
			before, _ := json.Marshal(fact)
			after, _ := json.Marshal(findCallable(t, application.Analysis.Callables, "work"))
			if string(before) != string(after) {
				t.Fatal("application inputs changed the callable definition", string(before), string(after))
			}
			if row.name == "unknown-beside-browser" || row.name == "finally-safe" {
				want := "safe"
				reads := 0
				if row.browser {
					want = "browser"
					reads = 1
				}
				sourceNodeScript(t, source, fmt.Sprintf(`const fs=require('node:fs'),vm=require('node:vm'),out={};let reads=0;vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:out,document:{get title(){reads++;return 'browser'}}});const value=out.work(true,()=> 'foreign');if(value!==%q||reads!==%d)throw Error(JSON.stringify({value,reads}));`, want, reads))
			}
		})
	}
}

// One emitted composition protects saved branch direction, completed factory
// captures and default timing together, without duplicating every analysis row.
func TestSavedFactoryHandoffEmittedCompletedCapture(t *testing.T) {
	const source = `export function run(choose=true,foreign=()=> 'foreign'){const events:string[]=[];function make(label:string,read:()=>string){events.push('make:'+label);try{return (selected=read)=>selected()}finally{events.push('finally:'+label);read=()=>{events.push('call:'+label);return label}}}const box={read:make('original',()=> 'old')};const saved=choose?box.read:foreign;box.read=make('replacement',()=> 'new');const first=saved();const second=saved(undefined);return {first,second,events}}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/saved-factory-emitted.ts", Source: source, Target: target, Diagnostics: "semantic", PreserveOrdinaryModules: true})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			sourceNodeScript(t, r.Code, `const fs=require('node:fs'),vm=require('node:vm'),out={};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:out});const kept=out.run(),other=out.run(false);if(kept.first!=='original'||kept.second!=='original'||kept.events.join(',')!=='make:original,finally:original,make:replacement,finally:replacement,call:original,call:original'||other.first!=='foreign'||other.second!=='foreign'||other.events.join(',')!=='make:original,finally:original,make:replacement,finally:replacement')throw Error(JSON.stringify({kept,other}));`)
		})
	}
}
