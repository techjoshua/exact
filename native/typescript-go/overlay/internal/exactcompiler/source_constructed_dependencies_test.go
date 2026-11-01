package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// Source New relationships preserve field acquisition separately from current
// object writes and later member/serialization consumers.
func TestConstructedSourceDependencies(t *testing.T) {
	for _, test := range []struct{ name, source, want string }{
		{"safe", `class C{nested={value:'safe'}}export const value=JSON.stringify(new C());`, "isomorphic"},
		{"getter", `class C{nested={get value(){return document.title}}}export const value=JSON.stringify(new C());`, "client"},
		{"scalar snapshot", `const input={value:'safe'};class C{value=input.value}const box=new C();input.value=document.title;export const value=box.value;`, "isomorphic"},
		{"live object", `const input={value:'safe'};class C{nested=input}const box=new C();input.value=document.title;export const value=JSON.stringify(box);`, "client"},
		{"field replacement", `class C{nested={get value(){return document.title}}}const box=new C();box.nested={value:'safe'};export const value=JSON.stringify(box);`, "isomorphic"},
	} {
		t.Run(test.name, func(t *testing.T) { assertClosurePlacement(t, test.source, test.want) })
	}
}

// A known source shape cannot release an unproven result Get or an escaped
// receiver's operations. Known donors survive overlapping unknown effects.
func TestConstructedSourceResiduals(t *testing.T) {
	for _, source := range []string{
		`const C:any=()=>document.title;export function read(){return new C()}`,
		`export function read(){class Holder{nested={get value(){return document.title}};constructor(){throw 9}}return JSON.stringify(new Holder())}`,
	} {
		response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/constructed-phase.ts", Source: source, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatal(response.Error, response.Diagnostics)
		}
		summary := executableSummary(t, response, "read")
		if summary.Effect != "neutral" {
			t.Fatalf("unperformed body effect: %+v", summary)
		}
	}
	assertSymbolicInitializerDonors(t, `declare function mutate(value:unknown):void;class C{nested={get value(){return document.title}}}const box=new C();mutate(box);export const value=JSON.stringify(box);`)
	assertSymbolicInitializerDonors(t, `declare function mutate(value:unknown):void;class C{nested={get value(){return document.title}}}const box=new C();mutate(box);box.nested={value:'safe'};export const value=JSON.stringify(box);`)
	source := `declare const foreign:C;class C{value='safe';constructor(){return foreign}}export const value=(new C()).value;`
	response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/constructed-foreign.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	found := false
	for _, export := range response.Analysis.Exports {
		if export.Name == "value" {
			found = true
			if export.Placement != "unknown" {
				t.Fatalf("foreign constructor result Get lost unknown: %s", export.Placement)
			}
		}
	}
	if !found {
		t.Fatal("missing constructed foreign Get")
	}
}

// An abrupt field prefix preserves Throw and skips later initializers. Unknown
// foreign code may instead supply an inherited value and allow serialization.
func TestConstructedSourcePhaseRuntime(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, fixture := range []struct {
			name, source                  string
			inherited, projection, abrupt bool
		}{
			{"direct throw", `function stop():never{throw 9}export function read(){class Holder{first=stop();later=document.title}return JSON.stringify(new Holder())}`, false, false, true},
			{"constructor throw", `export function read(){class Holder{nested={get value(){return document.title}};constructor(){throw 9}}return JSON.stringify(new Holder())}`, false, false, true},
			{"nonconstructible arrow", `const C:any=()=>document.title;export function read(){return new C()}`, false, false, false},
			{"nested throw", `function stop():never{throw 9}export function read(){class Inner{value=document.title}class Holder{first=stop();later=new Inner()}return JSON.stringify(new Holder())}`, false, false, true},
			{"whole undefined", constructedPhaseSource(false), false, false, false},
			{"whole inherited", constructedPhaseSource(false), true, false, false},
			{"later undefined", constructedPhaseSource(true), false, true, false},
			{"later inherited", constructedPhaseSource(true), true, true, false},
		} {
			t.Run(string(target)+"/"+fixture.name, func(t *testing.T) {
				response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/constructed-phase.ts", Source: fixture.source, Target: target, Diagnostics: "semantic"})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatal(response.Error, response.Diagnostics)
				}
				file := filepath.Join(t.TempDir(), "phase.mts")
				if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
					t.Fatal(err)
				}
				ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				defer cancel()
				const runner = `import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';const doc=Object.getOwnPropertyDescriptor(globalThis,'document'),fn=Object.getOwnPropertyDescriptor(globalThis,'foreign'),prefix=Object.getOwnPropertyDescriptor(Object.prototype,'prefix');let reads=0;try{Object.defineProperty(globalThis,'document',{configurable:true,value:Object.defineProperty({},'title',{get(){reads++;return 'browser'}})});Object.defineProperty(globalThis,'foreign',{configurable:true,value:()=>{if(process.argv[2]==='true')Object.defineProperty(Object.prototype,'prefix',{configurable:true,value:{value:'safe'},writable:true});return undefined}});const m=await import(pathToFileURL(process.argv[1]).href);if(process.argv[4]==='true'){assert.throws(()=>m.read(),e=>e===9);assert.equal(reads,0)}else if(process.argv[2]==='true'){assert.deepEqual(JSON.parse(m.read()),process.argv[3]==='true'?{value:'safe'}:{prefix:{value:'browser'},later:{value:'safe'}});assert.equal(reads,process.argv[3]==='true'?0:1)}else{assert.throws(()=>m.read(),TypeError);assert.equal(reads,0)}}finally{for(const[o,k,d]of[[globalThis,'document',doc],[globalThis,'foreign',fn],[Object.prototype,'prefix',prefix]]){if(d)Object.defineProperty(o,k,d);else delete o[k]}}assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis,'document'),doc);assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis,'foreign'),fn);assert.deepEqual(Object.getOwnPropertyDescriptor(Object.prototype,'prefix'),prefix);`
				b := func(v bool) string {
					if v {
						return "true"
					}
					return "false"
				}
				if output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file, b(fixture.inherited), b(fixture.projection), b(fixture.abrupt)).CombinedOutput(); err != nil {
					t.Fatalf("emitted phase: %v %s", err, output)
				}
			})
		}
	}
}

func constructedPhaseSource(projection bool) string {
	source := `declare function foreign():unknown;export function read(){class Inner{value:unknown=(this as unknown as {prefix:{value:string}}).prefix.value}class Holder{prefix={get value(){return document.title}};first=foreign();later=new Inner()}return JSON.stringify(new Holder()`
	if projection {
		source += `.later`
	}
	return source + `)}`
}
