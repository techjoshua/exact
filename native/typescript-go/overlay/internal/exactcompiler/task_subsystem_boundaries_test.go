package exactcompiler

import (
	"fmt"
	"strings"
	"testing"
)

// Work-local control flow cannot make earlier writes appear committed outside
// their executing branch. These witnesses accompany the emitted pending-state corpus.
func TestTaskSubsystemControlFlowSources(t *testing.T) {
	for _, body := range []string{
		`for(let index=0;index<2;index++)this.state.value+=await 1;this.state.trace=''+this.state.value;`,
		`for(const key in {a:1,b:1})this.state.value+=await 1;this.state.trace=''+this.state.value;`,
		`for(const item of [1,2])this.state.value+=await item;this.state.trace=''+this.state.value;`,
		`let index=0;while(index++<2)this.state.value+=await 1;this.state.trace=''+this.state.value;`,
		`let index=0;do this.state.value+=await 1;while(++index<2);this.state.trace=''+this.state.value;`,
		`++this.state.value;this.state.trace=''+this.state.value;`,
		`this.state.value&&=props.input;this.state.trace=''+this.state.value;`,
		`this.state.value||=props.input;this.state.trace=''+this.state.value;`,
		`this.state.nested={value:1};this.state.nested.value+=await 1;this.state.trace=''+this.state.nested.value;`,
		`this.state.value=1;this.state.value+=await 1;this.state.trace=''+this.state.value;`,
		`for(const key in {a:1}) this.state.value=key.length;this.state.trace=String(this.state.value);`,
		`let index=0;while(index++<2)this.state.value=index;this.state.trace=String(this.state.value);`,
		`let index=0;do this.state.value=++index;while(index<2);this.state.trace=String(this.state.value);`,
		`switch(props.input){case 1:this.state.value=1;break;default:this.state.value=2;}this.state.trace=String(this.state.value);`,
		`const value=props.input&&(this.state.value=1);this.state.trace=String(this.state.value)+value;`,
		`for(let index=0;index<2;index++){this.state.value+=index;this.state.trace=String(this.state.value);}`,
		`this.state.nested={value:1};this.state.nested.value++;this.state.trace=String(this.state.nested.value);`,
		`this.state.lookup.set('x',1);this.state.lookup.delete('x');this.state.members.add(1);this.state.members.delete(1);`,
		`const result=(this.state.value=await Promise.resolve(2));this.state.trace=String(result);`,
		`this.state.values.push(1);class Base{read(){return 2;}}class Child extends Base{value=super.read();}this.state.trace=String(new Child().value);`,
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(fmt.Sprintf("%s/%s", body, target), func(t *testing.T) {
				r := NewSession().Execute(Request{Kind: "compile", ID: "task-subsystem-control.tsx", Target: target, Diagnostics: "semantic", Source: `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:number;trace:string;nested:{value:number};values:number[];lookup:Map<string,number>;members:Set<number>}>,props:{input:number}){this.state.value=0;this.state.trace='';this.state.nested={value:0};this.state.values=[];this.state.lookup=new Map();this.state.members=new Set();const run=async(task:TaskContext=TaskContext.client().blocking())=>{` + body + `};return()=> <button onClick={()=>run()}>{this.state.trace}</button>;}`})
				if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
					for _, d := range r.Diagnostics {
						t.Logf("%s %s", d.Code, d.Message)
					}
					t.Fatalf("control flow rejected: %s", r.Error)
				}
			})
		}
	}
}

// Literal protocol paths, parameter collection mutations and optimistic captures
// preserve their rejection boundaries while ordinary source controls still emit.
func TestTaskSubsystemTransportControls(t *testing.T) {
	for _, c := range []struct {
		name, setup, body string
		invalid           bool
	}{
		{"dot-key", "", `this.state['a.b']=1;`, true},
		{"empty-key", "", `this.state['']=1;`, true},
		{"replace-literal-owner", "", `this.state.table={'a.b':1};`, false},
		{"parameter-map", "function mutate(value:Map<string,number>){value.set('x',1);}", `mutate(this.state.lookup);`, true},
		{"parameter-set", "function mutate(value:Set<number>){value.clear();value.add(1);}", `mutate(this.state.members);`, true},
		{"parameter-map-clear", "function mutate(value:Map<string,number>){value.clear();}", `mutate(this.state.lookup);`, true},
		{"server-kept-helper-capture", "\n/** @exact keep=server */\nconst localValue=7;const read=()=>localValue;", `this.state.value=read();`, true},
		{"direct-map", "", `this.state.lookup.set('x',1);`, false},
		{"optimistic-shorthand", "", `const local=1;task.optimistic(()=>{const value={local};void value;});`, true},
		{"optimistic-local", "", `task.optimistic(()=>{const local=1;const value={local};void value;});`, false},
		{"private-helper-capture", "const secretValue:Protected<number>=7 as Protected<number>;const read=()=>secretValue;", `this.state.value=read();`, true},
		{"public-helper-capture", "const publicValue=7;const read=()=>publicValue;", `this.state.value=read();`, false},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(fmt.Sprintf("%s/%s", c.name, target), func(t *testing.T) {
				r := NewSession().Execute(Request{Kind: "compile", ID: "task-subsystem-transport.tsx", Target: target, Source: `import {TaskContext,type Component} from '@exactjs/core';declare const marker:unique symbol;
/** @exact keep=secret */ type Protected<T>=T&{readonly[marker]:true};
export function Page(this:Component<{value:number;'a.b':number;'':number;table:{'a.b':number};lookup:Map<string,number>;members:Set<number>}>){this.state.value=0;this.state['a.b']=0;this.state['']=0;this.state.table={'a.b':0};this.state.lookup=new Map();this.state.members=new Set();` + c.setup + `const run=(task:TaskContext=TaskContext.server().blocking())=>{` + c.body + `};return()=> <button onClick={()=>run()}>{this.state.value}</button>;}`})
				if r.Error != "" || hasDiagnosticCode(r.Diagnostics, "EXACT2001") != c.invalid || (!c.invalid && len(r.Diagnostics) != 0) {
					for _, task := range r.Analysis.Tasks {
						t.Logf("writes=%#v helpers=%#v", task.Writes, task.helperCaptures)
					}
					t.Fatalf("transport boundary changed: %s %#v", r.Error, r.Diagnostics)
				}
			})
		}
	}
}

// Helper uncertainty is distinct from a proven class receiver incompatibility.
// Each native comparison operator and returned capture keeps that distinction.
func TestTaskSubsystemHelperViewControls(t *testing.T) {
	for _, body := range []string{`return value==original;`, `return value===original;`, `return value!=original;`, `return value!==original;`, `return ()=>value.value;`} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "task-subsystem-view.tsx", Target: TargetClient, Source: `import {TaskContext,type Component} from '@exactjs/core';const original={value:0};function inspect(value:{value:number}){` + body + `}export function Page(this:Component<{value:number}>){this.state.value=0;function run(task:TaskContext=TaskContext.client().blocking()){void inspect(this.state);}return()=> <button onClick={()=>run()}/>;}`})
		if r.Error != "" || !hasDiagnosticCode(r.Diagnostics, "EXACT2231") || hasDiagnosticCode(r.Diagnostics, "EXACT2230") {
			t.Fatalf("uncertainty lost: %s %#v", r.Error, r.Diagnostics)
		}
	}
}

// A server-local setup write has no transported patch. Neutral authored type
// proof must preserve that target distinction while checking ordinary type errors.
func TestTaskSubsystemServerLocalLiteralControls(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, invalidType := range []bool{false, true} {
			value := "3"
			if invalidType {
				value = "'invalid'"
			}
			r := NewSession().Execute(Request{Kind: "compile", ID: "local-literal.tsx", Target: target, Diagnostics: "semantic", Source: `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{'':number;trace:string}>){this.state.trace='';const run=async(task:TaskContext=TaskContext.server().blocking())=>{this.state['']=` + value + `;this.state.trace=String(this.state['']);};void run();return()=> <output>{this.state.trace}</output>;}`})
			if r.Error != "" || hasDiagnosticCode(r.Diagnostics, "EXACT2001") != (target == TargetClient) || hasDiagnosticCode(r.Diagnostics, "TS2322") != (invalidType && target == TargetServer) {
				t.Fatalf("%s invalid=%t: %s %#v", target, invalidType, r.Error, r.Diagnostics)
			}
		}
	}
}

// Indexed native collections retain broad effect authority in ordinary function
// tasks. Server transport rejects dynamic writes, while client ownership emits.
func TestTaskSubsystemIndexedCollectionControls(t *testing.T) {
	for _, owner := range []struct{ kind, value, keyType string }{
		{"Record<string,Map<string,number>>", "{first:new Map()}", "string"},
		{"Map<string,number>[]", "[new Map()]", "number"},
	} {
		for _, placement := range []string{"client", "server"} {
			for _, target := range []Target{TargetClient, TargetServer} {
				t.Run(fmt.Sprintf("%s/%s/%s", owner.kind, placement, target), func(t *testing.T) {
					r := NewSession().Execute(Request{Kind: "compile", Target: target, ID: "indexed-collections.tsx", Source: `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{table:` + owner.kind + `}>,props:{key:` + owner.keyType + `}){this.state.table=` + owner.value + `;function run(task:TaskContext=TaskContext.` + placement + `().blocking()){this.state.table[props.key]!.set('x',1);}return()=> <button onClick={()=>run()}>Run</button>;}`})
					if r.Error != "" || hasDiagnosticCode(r.Diagnostics, "EXACT2001") != (placement == "server") || (placement == "client" && len(r.Diagnostics) != 0) {
						t.Fatalf("dynamic collection authority changed: %s %#v", r.Error, r.Diagnostics)
					}
				})
			}
		}
	}
}

// Server component islands and generated slice names preserve source ownership
// across setup tasks, invoked tasks and authored names resembling compiler names.
func TestTaskSubsystemServerProjectionSources(t *testing.T) {
	for _, statement := range []string{"void run();", "const value=run();void value;"} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(fmt.Sprintf("%s/%s", statement, target), func(t *testing.T) {
				r := NewSession().Execute(Request{Kind: "compile", Target: target, ServerComponents: true, Diagnostics: "semantic", ID: "task-islands.tsx", Source: `import {TaskContext,createContext,type Component} from '@exactjs/core';const Private=createContext<number>('private',{keep:'server'});const __exact_server_task_slice_1=1;export function Page(this:Component<{value:number}>){this.state.value=0;const secret=this.getContext(Private);const run=(task:TaskContext=TaskContext.server().blocking())=>{this.state.value=secret+__exact_server_task_slice_1;return this.state.value;};` + statement + `return()=> <section><button onClick={()=>this.state.value++}>Next</button><output>{this.state.value}</output></section>;}`})
				if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
					t.Fatalf("server projection rejected: %s %#v", r.Error, r.Diagnostics)
				}
			})
		}
	}
}

// Key transport is a type contract, independent of TypeScript's display syntax.
// Arrays, callable objects and unique symbols cannot become server Map keys.
func TestTaskSubsystemMapKeyTypeContracts(t *testing.T) {
	for _, c := range []struct {
		definitions, key string
		invalid          bool
	}{
		{"", `[] as string[]`, true}, {"", `[1] as [number]`, true}, {"", `new Map<string,number>()`, true}, {"", `new Set<number>()`, true}, {"", `()=>1`, true}, {"", `{value:1}`, true}, {"", `Symbol('key')`, true}, {"", `1n`, true}, {"", `undefined`, true},
		{"", `null`, false}, {"", `true`, false}, {"", `1`, false}, {"", `'key'`, false}, {"", `'key' as string & {readonly brand:'key'}`, false},
		{`type Key=string[];const key:Key=[];`, `key`, true},
		{`declare const key:string|object;`, `key`, false},
		{`declare const key:any;`, `key`, false},
		{`interface Key{value:number}const key:Key={value:1};`, `key`, true},
		{`declare const key:object;`, `key`, true},
		{`declare const key:{value:number}&{brand:"key"};`, `key`, true},
		{`declare const key:symbol|object;`, `key`, true},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			r := NewSession().Execute(Request{Kind: "compile", ID: "task-map-key-types.tsx", Target: target, Diagnostics: "semantic", Source: `import{TaskContext,type Component}from'@exactjs/core';` + c.definitions + `export function Page(this:Component<{lookup:Map<unknown,number>}>){this.state.lookup=new Map();const run=(task:TaskContext=TaskContext.server().blocking())=>{this.state.lookup.set(` + c.key + `,1);};return()=> <button onClick={()=>run()}/>;}`})
			found := false
			for _, d := range r.Diagnostics {
				found = found || d.Code == "EXACT2001" && strings.Contains(d.Message, "Map key must be null")
			}
			if found != c.invalid || !c.invalid && (r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "") {
				t.Fatalf("Map key %s/%s: %s %#v", c.key, target, r.Error, r.Diagnostics)
			}
		}
	}
}

// Generic constraints retain the same key contract, while a primitive
// constraint does not become an object merely because its spelling is generic.
func TestTaskSubsystemConstrainedMapKeyTypes(t *testing.T) {
	for _, constraint := range []string{"object", "string", ""} {
		for _, target := range []Target{TargetClient, TargetServer} {
			r := NewSession().Execute(Request{Kind: "compile", ID: "constrained-map-key.tsx", Target: target, Diagnostics: "semantic", Source: `import{TaskContext,type Component}from'@exactjs/core';export function Page<T` + func() string {
				if constraint == "" {
					return ""
				}
				return " extends " + constraint
			}() + `>(this:Component<{lookup:Map<unknown,number>}>,props:{key:T}){this.state.lookup=new Map();function run(key:T,task:TaskContext=TaskContext.server().blocking()){this.state.lookup.set(key,1);}return()=> <button onClick={()=>run(props.key)}/>;}`})
			found := false
			for _, d := range r.Diagnostics {
				found = found || d.Code == "EXACT2001" && strings.Contains(d.Message, "Map key must be null")
			}
			if found != (constraint == "object") || constraint != "object" && (r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "") {
				t.Fatalf("constrained Map key %s/%s: %s %#v", constraint, target, r.Error, r.Diagnostics)
			}
		}
	}
}
