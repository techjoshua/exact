package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// Native async settlement observes the selected getter after finally completion.
// Emitted code keeps getter effects/Throw and replacement ordering independently
// of the analyzer's conservative incomplete-result disposition.
func TestImplicitSettlementEmittedOrdering(t *testing.T) {
	for _, test := range []struct{ name, body, expected string }{
		{"getter-order", `const helper={get selected(){events.push('inner');window.name;return undefined}};async function make(){try{return {kind:'audit',get then(){events.push('outer');return helper.selected}}}finally{events.push('finally')}}`, `{"value":"audit","events":["finally","outer","inner"],"reads":1}`},
		{"getter-throw", `async function make(){return {kind:'audit',get then():undefined{events.push('getter');window.name;throw new Error('stop')}}}`, `{"error":"stop","events":["getter"],"reads":1}`},
		{"finally-reject", `async function make(){try{return {kind:'audit',get then(){events.push('getter');window.name;return undefined}}}finally{events.push('finally');throw new Error('stop')}}`, `{"error":"stop","events":["finally"],"reads":0}`},
		{"finally-replace", `async function make(){try{return {kind:'audit',get then(){events.push('getter');window.name;return undefined}}}finally{events.push('finally');return {kind:'failure',then:undefined}}}`, `{"value":"failure","events":["finally"],"reads":0}`},
	} {
		t.Run(test.name, func(t *testing.T) {
			source := `export const events:string[]=[];` + test.body + `export async function read(){return (await make()).kind}`
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/settlement-order-" + test.name + ".ts", Source: source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatalf("compile: %s %#v", response.Error, response.Diagnostics)
			}
			module := filepath.Join(t.TempDir(), "settlement.mts")
			if err := os.WriteFile(module, []byte(response.Code), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			defer cancel()
			const runner = `import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const before=Object.getOwnPropertyDescriptor(globalThis,'window');let reads=0;
Object.defineProperty(globalThis,'window',{configurable:true,value:{get name(){reads++;return 'browser'}}});
let result;try{const m=await import(pathToFileURL(process.argv[1]).href);try{result={value:await m.read()}}catch(error){result={error:error.message}}result.events=m.events;result.reads=reads;}finally{if(before)Object.defineProperty(globalThis,'window',before);else delete globalThis.window;}
assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis,'window'),before);assert.deepEqual(result,JSON.parse(process.argv[2]));`
			if output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, module, test.expected).CombinedOutput(); err != nil {
				t.Fatalf("settlement runtime: %v %s", err, output)
			}
		})
	}
}

// A nested allocating occurrence cannot borrow the direct module-New cut.
// A deferred class field is not execution of its prototype getter either.
func TestImplicitConstructionPrefixRefusals(t *testing.T) {
	for _, test := range []struct {
		name, prefix string
		incomplete   bool
	}{
		{"nested-new", `function keep(value:unknown){return value}class Entered{field=Object.defineProperty(Object.prototype,'then',{configurable:true,get(){window.name;return undefined}})}keep(new Entered());`, true},
		{"deferred-field", `class Entered{field=Object.defineProperty(Object.prototype,'then',{configurable:true,get(){window.name;return undefined}})}`, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/settlement-prefix-" + test.name + ".ts", Source: test.prefix + `async function make(){return {kind:'audit'}}export async function read(){return (await make()).kind}`, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatal(response.Error, response.Diagnostics)
			}
			found := false
			for _, c := range response.Analysis.Callables {
				if c.Name == "make" {
					found = true
					if settlementBrowser(c) || test.incomplete && c.Effect != "unknown" {
						t.Fatalf("unproved field/new prefix: %#v", c)
					}
				}
			}
			if !found {
				t.Fatal("producer missing")
			}
		})
	}
}
