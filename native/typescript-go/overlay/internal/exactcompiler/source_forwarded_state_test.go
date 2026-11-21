package exactcompiler

import (
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"testing"
)

// forwardedStateComponent gives the helper an event that can mutate two
// different component-state paths, including through a reordered argument.
func forwardedStateComponent(t *testing.T, source, arguments string) Response {
	t.Helper()
	root, config := formsSourceFixture(t)
	source += `
import {type Component} from '@exactjs/core';
type Box={value:number,inner:{value:number}};
export function Page(this:Component<{left:Box,right:Box}>){
 this.state={left:{value:0,inner:{value:0}},right:{value:1,inner:{value:1}}};
 return()=> <button onClick={()=>run(` + arguments + `)}>{this.state.right.value}</button>
}`
	return formsCompileSource(t, root, config, source, TargetClient)
}

// Source effect traversal must preserve the caller's parameter relation. A known
// write must not gain an unrelated unknown receiver when helpers forward it.
func TestForwardedStateEffectBindings(t *testing.T) {
	for _, test := range []struct {
		name, source string
		indices      []int
		path         string
	}{
		{"direct", `export function run(left:{value:number},right:{value:number}){right.value=1}`, []int{1}, "value"},
		{"forwarded", `function write(value:{value:number}){value.value=1}export function run(left:{value:number},right:{value:number}){write(right)}`, []int{1}, "value"},
		{"reordered", `function write(value:{value:number}){value.value=1}function forward(first:{value:number},second:{value:number}){write(first)}export function run(left:{value:number},right:{value:number}){forward(right,left)}`, []int{1}, "value"},
		{"separate-calls", `function write(value:{value:number}){value.value=1}export function run(left:{value:number},right:{value:number}){write(left);write(right)}`, []int{0, 1}, "value"},
		{"forwarded-contexts", `function write(value:{value:number}){value.value=1}function forward(first:{value:number},second:{value:number}){write(first)}export function run(left:{value:number},right:{value:number}){forward(left,right);forward(right,left)}`, []int{0, 1}, "value"},
		{"forwarded-alias", `function write(value:{value:number}){value.value=1}function forward(first:{value:number},second:{value:number}){write(second)}export function run(left:{value:number},right:{value:number}){const alias=right;forward(left,alias)}`, []int{1}, "value"},
		{"forwarded-member", `function write(value:{value:number}){value.value=1}function forward(first:{inner:{value:number}},second:{inner:{value:number}}){write(first.inner)}export function run(left:{inner:{value:number}},right:{inner:{value:number}}){forward(right,left)}`, []int{1}, "inner.value"},
		{"ordinary-object", `const ordinary={value:0};function write(value:{value:number}){value.value=1}export function run(left:{value:number},right:{value:number}){write(ordinary)}`, nil, "value"},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := forwardedStateComponent(t, test.source, "this.state.left,this.state.right")
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatalf("analysis: %s %#v", response.Error, response.Diagnostics)
			}
			summary := executableSummary(t, response, "run")
			var indices []int
			for _, write := range summary.StateWrites {
				if write.Receiver == nil || write.Receiver.Kind != "parameter" {
					if len(test.indices) != 0 {
						t.Fatalf("lost forwarded receiver %v on %s (%s): %#v", write.Receiver, write.Path, write.Confidence, summary.StateWrites)
					}
					continue
				}
				if write.Path != test.path || write.Confidence != "exact" || write.Receiver.Root != "value" {
					t.Fatalf("lost leaf or receiver precision: %#v", write)
				}
				indices = append(indices, write.Receiver.Index)
			}
			sort.Ints(indices)
			if !reflect.DeepEqual(indices, test.indices) {
				t.Fatalf("parameter writes %v, want %v: %#v", indices, test.indices, summary.StateWrites)
			}
		})
	}
}

// A known parameter alternative does not account for a separate ordinary object.
// Retain both receiver relations, regardless of conditional alternative order.
func TestForwardedStateUnknownAlternative(t *testing.T) {
	for _, argument := range []string{"flag?right:ordinary", "flag?ordinary:right"} {
		source := `const ordinary={value:0};function write(value:{value:number}){value.value=1}function forward(value:{value:number}){write(value)}export function run(left:{value:number},right:{value:number},flag:boolean){forward(` + argument + `)}`
		response := forwardedStateComponent(t, source, "this.state.left,this.state.right,this.state.left.value>0")
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatalf("analysis: %s %#v", response.Error, response.Diagnostics)
		}
		known, unknown := false, false
		for _, write := range executableSummary(t, response, "run").StateWrites {
			if write.Path != "value" || write.Receiver == nil {
				t.Fatalf("lost mutation leaf: %#v", write)
			}
			known = known || write.Receiver.Kind == "parameter" && write.Receiver.Index == 1 && write.Confidence == "exact"
			unknown = unknown || write.Receiver.Kind == "unknown" && write.Confidence == "unknown"
		}
		if !known || !unknown {
			t.Fatalf("%s lost independent receiver relation: known=%t unknown=%t", argument, known, unknown)
		}
	}
}

func TestForwardedStateRuntime(t *testing.T) {
	source := `function write(value:{value:number}){value.value++}function forward(first:{value:number},second:{value:number}){write(first)}export function run(left:{value:number},right:{value:number}){forward(right,left)}`
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: filepath.Join(cwd, "forwarded-runtime.ts"), Source: source, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatalf("compile: %s %#v", response.Error, response.Diagnostics)
			}
			sourceNodeScript(t, response.Code, `const fs=require('node:fs'),vm=require('node:vm');const load=require('node:module').createRequire(process.cwd()+'/forwarded-test.cjs');const exports={};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports,require:load});const left={value:0},right={value:10};exports.run(left,right);if(left.value!==0||right.value!==11)throw Error(JSON.stringify({left,right}));`)
		})
	}
}
