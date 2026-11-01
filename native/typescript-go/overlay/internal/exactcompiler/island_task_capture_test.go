package exactcompiler

import (
	"encoding/json"
	"strings"
	"testing"
	"unicode/utf16"
)

func TestIslandTaskCapturePreservesEveryFunctionForm(t *testing.T) {
	for _, declaration := range []string{
		`async function save(value: string, task: TaskContext = TaskContext.client().latest()) { BODY }`,
		`const save = async (value: string, task: TaskContext = TaskContext.client().latest()) => { BODY };`,
		`const save = async function(value: string, task: TaskContext = TaskContext.client().latest()) { BODY };`,
	} {
		declaration = strings.ReplaceAll(declaration, "BODY", `task.optimistic(() => { this.state.value = value; }); try { await navigator.clipboard.writeText(value); } catch { this.state.value = ""; }`)
		response := NewSession().Execute(Request{ID: "capture.tsx", Kind: "compile", Target: TargetClient, ServerComponents: true, ComponentContractProjection: ComponentContractProjectionHydrate, Source: `
import {TaskContext, type Component} from '@exactjs/core';
export function Probe(this: Component<{value:string}>) {
 this.state.value = '';
 ` + declaration + `
 return () => <section><button onClick={() => save('next')}>Save</button><output>{this.state.value}</output></section>;
}`})
		if response.Error != "" || len(response.Diagnostics) != 0 {
			t.Fatalf("%s: %s %#v", declaration, response.Error, response.Diagnostics)
		}
		if strings.Contains(response.Code, "TaskContext.client()") || !strings.Contains(response.Code, `concurrency: "latest"`) || !strings.Contains(response.Code, "__exactTaskMutation") {
			t.Fatalf("Captured task lost its compiled policy or mutation fence: %s\n%s", declaration, response.Code)
		}
	}
}

// symbolStateSnapshotCases is one bounded authored-source family shared by diagnostic qualification.
func symbolStateSnapshotCases() []struct {
	name, source string
	rejected     bool
} {
	return []struct {
		name, source string
		rejected     bool
	}{
		{"client-newline", `import {type Component} from '@exactjs/core';const key:unique symbol=Symbol('x');
/** @exact client */ export function Probe(this:Component<{[key]:number}>){this.state[key]=0;return()=> <button onClick={()=>this.state[key]++}/>;}`, false},
		{"client-inferred", `import {type Component} from '@exactjs/core';const key:unique symbol=Symbol('x'); export function Probe(this:Component<{[key]:number}>){this.state[key]=window.innerWidth;return()=> <button onClick={()=>this.state[key]++}/>;}`, false},
		{"client-variable", `import {type Component} from '@exactjs/core';const key:unique symbol=Symbol('x');
/** @exact client */ export const Probe=function(this:Component<{[key]:number}>){this.state[key]=0;return()=> <button onClick={()=>this.state[key]++}/>;}`, false},
		{"client-arrow", `const key:unique symbol=Symbol('x');
/** @exact client */ export const Probe=({label='local'}:{label?:string})=>()=> <button onClick={()=>{void key;}}>{label}</button>;`, false},
		{"client-child", `import {type Component} from '@exactjs/core';const key:unique symbol=Symbol('x');
/** @exact client */ function Child(this:Component<{[key]:number}>){this.state[key]=0;return()=> <button onClick={()=>this.state[key]++}/>;}
export function Probe(){return()=> <Child/>;}`, false},
		{"client-parent", `import {type Component} from '@exactjs/core';const key:unique symbol=Symbol('x');
function Child(this:Component<{[key]:number}>){this.state[key]=0;return()=> <button onClick={()=>this.state[key]++}/>;}
/** @exact client */ export function Probe(){return()=> <Child/>;}`, true},
		{"absorbed-continuation", `import {TaskContext,type Component} from '@exactjs/core';const key:unique symbol=Symbol('x');export function Probe(this:Component<{[key]:number;count:number}>){this.state[key]=0;this.state.count=0;function save(task:TaskContext=TaskContext.server()){this.state.count++;}return()=> <section><button onClick={()=>this.state[key]++}/><button onClick={()=>save()}/></section>;}`, false},
		{"elided-local", `import {type Component} from '@exactjs/core';const key:unique symbol=Symbol('x');export function Probe(this:Component<{[key]:number}>){this.state[key]=0;const unused=()=> <button onClick={()=>this.state[key]++}/>;return()=> <p>static</p>;}`, false},
		{"original", `import {TaskContext,type Component} from '@exactjs/core';const key:unique symbol=Symbol('entry');export function Probe(this:Component<{[key]:number}>){this.state[key]=0;const run=async(task:TaskContext=TaskContext.client().latest())=>{await Promise.resolve();this.state[key]+=1;};return()=> <button onClick={()=>run()}/>;}`, true},
		{"named-computed", `import {TaskContext,type Component} from '@exactjs/core';const key='count';export function Probe(this:Component<{count:number}>){this.state[key]=0;const run=async(task:TaskContext=TaskContext.client().latest())=>{await Promise.resolve();this.state[key]+=1;};return()=> <button onClick={()=>run()}/>;}`, false},
		{"named", `import {TaskContext,type Component} from '@exactjs/core';export function Probe(this:Component<{count:number}>){this.state.count=0;const run=async(task:TaskContext=TaskContext.client().latest())=>{await Promise.resolve();this.state.count+=1;};return()=> <button onClick={()=>run()}/>;}`, false},
		{"alias", `import {TaskContext,type Component} from '@exactjs/core';const key:unique symbol=Symbol('entry');export function Probe(this:Component<{[key]:number}>){this.state[key]=0;const run=async(task:TaskContext=TaskContext.client().latest())=>{await Promise.resolve();const selected:typeof key=key;this.state[selected]+=1;};return()=> <button onClick={()=>run()}/>;}`, true},
		{"read-only", `import {TaskContext,type Component} from '@exactjs/core';const key:unique symbol=Symbol('entry');export function Probe(this:Component<{[key]:number}>){this.state[key]=0;const read=()=>this.state[key];const run=async(task:TaskContext=TaskContext.client().latest())=>{await Promise.resolve();void read();};return()=> <button onClick={()=>run()}/>;}`, true},
		{"derived", `import {TaskContext,type Component} from '@exactjs/core';const key:unique symbol=Symbol('entry');export function Probe(this:Component<{[key]:number}>){this.state[key]=0;const count=this.state[key]+1;const run=async(task:TaskContext=TaskContext.client().latest())=>{await Promise.resolve();void count;};return()=> <button onClick={()=>run()}>{count}</button>;}`, true},
		{"ancestor", `import {TaskContext,type Component} from '@exactjs/core';const key:unique symbol=Symbol('entry');export function Probe(this:Component<{record:{[key]:number}}>){this.state.record={[key]:0};const record=this.state.record;const run=async(task:TaskContext=TaskContext.client().latest())=>{await Promise.resolve();record[key]+=1;};return()=> <button onClick={()=>run()}/>;}`, true},
		{"symbol-ancestor", `import {TaskContext,type Component} from '@exactjs/core';const key:unique symbol=Symbol('entry');export function Probe(this:Component<{[key]:{count:number}}>){this.state[key]={count:0};const record=this.state[key];const run=async(task:TaskContext=TaskContext.client().latest())=>{await Promise.resolve();record.count+=1;};return()=> <button onClick={()=>run()}/>;}`, false},
		{"unselected", `import {TaskContext,type Component} from '@exactjs/core';const key:unique symbol=Symbol('entry');export function Probe(this:Component<{[key]:number;count:number}>){this.state[key]=0;this.state.count=0;const run=async(task:TaskContext=TaskContext.client().latest())=>{await Promise.resolve();this.state.count+=1;};return()=> <button onClick={()=>run()}/>;}`, false},
		{"static-SSR", `import{type Component}from'@exactjs/core';const key:unique symbol=Symbol('entry');export function Probe(this:Component<{[key]:number}>){this.state[key]=7;return()=> <output>{this.state[key]}</output>;}`, false},
		{"literal-star", `import {TaskContext,type Component} from '@exactjs/core';export function Probe(this:Component<{'*':number}>){this.state['*']=0;const run=async(task:TaskContext=TaskContext.client().latest())=>{await Promise.resolve();this.state['*']+=1;};return()=> <button onClick={()=>run()}/>;}`, false},
		{"numeric", `import {TaskContext,type Component} from '@exactjs/core';export function Probe(this:Component<{0:number}>){this.state[0]=0;const run=async(task:TaskContext=TaskContext.client().latest())=>{await Promise.resolve();this.state[0]+=1;};return()=> <button onClick={()=>run()}/>;}`, false},
		{"dedup-string-first", `import{type Component}from'@exactjs/core';const key:unique symbol=Symbol('entry');export function Probe(this:Component<Record<PropertyKey,number>>){this.state={x:0,[key]:0};const text:string='x'; return()=> <button onClick={()=>{this.state[text]++;this.state[key]++;}}/>;}`, true},
		{"dynamic-string", `import{type Component}from'@exactjs/core';const key:unique symbol=Symbol('entry');export function Probe(this:Component<Record<PropertyKey,number>>){this.state={x:0,[key]:0};const text:string='x'; return()=> <button onClick={()=>{this.state[text]++;}}/>;}`, false},
		{"narrow-string", `import{type Component}from'@exactjs/core';const key:unique symbol=Symbol('entry');export function Probe(this:Component<Record<PropertyKey,number>>){this.state={x:0,[key]:0}; return()=> <button onClick={()=>{const input:string|symbol=String(Date.now());if(typeof input==='string')this.state[input]++;}}/>;}`, false},
		{"symbol-union", `import{type Component}from'@exactjs/core';const key:unique symbol=Symbol('entry');export function Probe(this:Component<Record<PropertyKey,number>>){this.state={x:0,[key]:0}; return()=> <button onClick={()=>{const input:string|symbol=Date.now()?key:'x';this.state[input]++;}}/>;}`, true},
		{"symbol-intersection", `import {type Component} from '@exactjs/core';export function Probe(this:Component<Record<PropertyKey,number>>,props:{key:symbol&{readonly tag:'entry'}}){this.state={};return()=> <button onClick={()=>this.state[props.key]++}/>;}`, true},
		{"any", `import{type Component}from'@exactjs/core';const key:unique symbol=Symbol('entry');export function Probe(this:Component<Record<PropertyKey,number>>){this.state={x:0,[key]:0};const input:any='x'; return()=> <button onClick={()=>{this.state[input]++;}}/>;}`, false},
		{"invalid-value", `import {TaskContext,type Component} from '@exactjs/core';const key:unique symbol=Symbol('entry');export function Probe(this:Component<{[key]:number}>){this.state[key]=0;const run=async(task:TaskContext=TaskContext.client().latest())=>{await Promise.resolve();this.state[key]='bad';};return()=> <button onClick={()=>run()}/>;}`, true},
		{"readonly", `import {TaskContext,type Component} from '@exactjs/core';const key:unique symbol=Symbol('entry');export function Probe(this:Component<{[key]:number}>){this.state[key]=0;const run=async(task:TaskContext=TaskContext.client().latest())=>{await Promise.resolve();const view:Readonly<{[key]:number}>=this.state;view[key]=2;};return()=> <button onClick={()=>run()}/>;}`, true},
	}
}

func TestIslandSymbolStateSnapshotDiagnostic(t *testing.T) {
	for _, example := range symbolStateSnapshotCases() {
		for _, target := range []Target{"", TargetClient, TargetServer} {
			t.Run(example.name+"/"+string(target), func(t *testing.T) {
				response := NewSession().Execute(Request{ID: "maintained-receiver-facts.tsx", Kind: "compile", Target: target, ServerComponents: true, ComponentContractProjection: ComponentContractProjectionHydrate, Diagnostics: "semantic", Source: example.source})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				found := false
				for _, diagnostic := range response.Diagnostics {
					if diagnostic.Code == "EXACT2232" {
						found = true
						if diagnostic.Start < 0 || diagnostic.Length == 0 || len(diagnostic.Related) == 0 {
							t.Fatalf("lost authored attribution: %#v", diagnostic)
						}
					}
				}
				if found != (example.rejected && target == TargetServer) {
					t.Fatalf("snapshot diagnostic mismatch: %#v", response.Diagnostics)
				}
				if found {
					// Fatal requested-target admission precedes the independent authored proof.
					if len(response.Diagnostics) != 1 || response.Diagnostics[0].Severity != "error" || response.Code != "" {
						t.Fatalf("fatal snapshot admission changed: %#v", response)
					}
				} else if example.name == "invalid-value" || example.name == "readonly" {
					// Neutral and CLIENT retain ordinary TypeScript assignment/readonly checks.
					expected := "TS2322"
					if example.name == "readonly" {
						expected = "TS2540"
					}
					if len(response.Diagnostics) != 1 || response.Diagnostics[0].Code != expected || response.Diagnostics[0].Severity != "error" {
						t.Fatalf("lost authored TypeScript rejection %s: %#v", expected, response.Diagnostics)
					}
				} else if example.name == "symbol-ancestor" {
					if len(response.Diagnostics) != 1 || response.Diagnostics[0].Code != "EXACT2001" {
						t.Fatalf("lost derived-alias admission control: %#v", response.Diagnostics)
					}
				} else if !found {
					if response.Error != "" || len(response.Diagnostics) != 0 {
						t.Fatalf("valid control rejected: %s %#v", response.Error, response.Diagnostics)
					}
				}
				if example.name == "named-computed" && target == TargetServer && (!strings.Contains(response.Code, "count: this.state.count") || strings.Contains(response.Code, `this.state["*"]`)) {
					t.Fatalf("finite string key lost its snapshot value: %s", response.Code)
				}
				data, err := json.Marshal(response.Analysis.StateReads)
				if err != nil {
					t.Fatal(err)
				}
				if strings.Contains(string(data), "dynamicSegments") {
					t.Fatal("private authored key facts escaped analysis JSON")
				}
			})
		}
	}
}

// TestIslandSymbolDiagnosticAuthoredRange protects UTF-16 and normalized newlines at the key use.
func TestIslandSymbolDiagnosticAuthoredRange(t *testing.T) {
	source := ""
	for _, example := range symbolStateSnapshotCases() {
		if example.name == "original" {
			source = "// 😀\r\n" + example.source
		}
	}
	response := NewSession().Execute(Request{ID: "unicode-symbol.tsx", Kind: "compile", Target: TargetServer, ServerComponents: true, ComponentContractProjection: ComponentContractProjectionHydrate, Diagnostics: "semantic", Source: source})
	needle := "this.state[key]+=1"
	offset := strings.Index(source, needle) + len("this.state[")
	expected := len(utf16.Encode([]rune(source[:offset])))
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Code != "EXACT2232" {
			continue
		}
		if diagnostic.Start != expected || diagnostic.Length != 3 || diagnostic.Line != 2 || len(diagnostic.Related) != 1 {
			t.Fatalf("lost original UTF-16 source range: %#v, expected %d", diagnostic, expected)
		}
		return
	}
	t.Fatalf("missing causal diagnostic: %#v", response.Diagnostics)
}

// TestIslandSnapshotEmissionEligibility protects the artifact boundary, rather than potential plans.
func TestIslandSnapshotEmissionEligibility(t *testing.T) {
	for _, example := range symbolStateSnapshotCases() {
		if example.name != "client-newline" && example.name != "original" {
			continue
		}
		t.Run(example.name, func(t *testing.T) {
			response := NewSession().Execute(Request{ID: "snapshot-analysis.tsx", Kind: "analyze", Target: TargetServer, ServerComponents: true, ComponentContractProjection: ComponentContractProjectionHydrate, Source: example.source})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			for _, diagnostic := range response.Diagnostics {
				if diagnostic.Code == "EXACT2232" {
					t.Fatal("metadata-only analysis asserted an emitted snapshot")
				}
			}
			if len(response.Analysis.StateReads) == 0 {
				t.Fatal("analysis lost conservative state reads")
			}
		})
	}
	for _, diagnostics := range []string{"syntax", "semantic"} {
		for _, partitioned := range []bool{false, true} {
			source := ""
			// Find the unchanged authored original without tying this control to table order.
			for _, example := range symbolStateSnapshotCases() {
				if example.name == "original" {
					source = example.source
				}
			}
			response := NewSession().Execute(Request{ID: "snapshot-projection.tsx", Kind: "compile", Target: TargetServer, ServerComponents: partitioned, ComponentContractProjection: ComponentContractProjectionHydrate, Diagnostics: diagnostics, Source: source})
			found := false
			for _, diagnostic := range response.Diagnostics {
				if diagnostic.Code == "EXACT2232" {
					found = true
				}
			}
			if found != partitioned || response.Error != "" {
				t.Fatalf("snapshot projection mismatch (%t): %s %#v", partitioned, response.Error, response.Diagnostics)
			}
			if !partitioned && len(response.Diagnostics) != 0 {
				t.Fatalf("unpartitioned source rejected: %#v", response.Diagnostics)
			}
		}
	}
}
