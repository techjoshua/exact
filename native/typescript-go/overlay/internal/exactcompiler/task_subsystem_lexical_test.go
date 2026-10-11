package exactcompiler

import (
	"fmt"
	"testing"
)

// Continuation reconstruction preserves lexical scope, source typing, receiver
// ownership and suspension across ordinary TypeScript forms and both targets.
func TestTaskSubsystemLexicalSources(t *testing.T) {
	for _, c := range []struct{ name, setup, work, parameters, arguments string }{
		{"implicit-intl", "", "this.state.trace=new Intl.NumberFormat().format(props.input);", "", ""},
		{"prototype-intl", "", "this.state.trace=props.input.toLocaleString();", "", ""},
		{"props-helper", "const read=()=>props.input;", "this.state.value=read();", "", ""},
		{"destructured-helper", "const {offset}={offset:2};const read=()=>offset;", "this.state.value=read();", "", ""},
		{"parameter-helper", "const read=(value:number)=>value+2;", "this.state.value=read(1);", "", ""},
		{"nested-state-helper-alias", "const owner=this.state.nested;const read=()=>owner.value;", "this.state.trace=String(read());", "", ""},
		{"state-helper-alias", "const owner=this.state;const read=()=>owner.value;", "this.state.trace=String(read());", "", ""},
		{"explicit-helper-input", "const offset=2;const read=()=>offset;", "this.state.value=value+read();", "value:number,", "props.input"},
		{"partial-helper-default", "const offset=2;const read=()=>offset;", "this.state.value=value+next+read();", "value:number,next:number=props.input,", "1"},
		{"default-only-helper-local", "const offset=2;const read=()=>offset;", "this.state.value=value;", "value:number=read(),", ""},
		{"typed-helper-object", "type Options={offset:number};const settings:Options={offset:2};const read=()=>settings.offset;", "this.state.value=read();", "", ""},
		{"repeated-helper-capture", "const offset=2;const read=()=>offset+offset;", "this.state.value=read()+read();", "", ""},
		{"recursive-helper-capture", "const offset=2;const read=(value=1):number=>value?read(value-1):offset;", "this.state.value=read();", "", ""},
		{"derived-helper-capture", "const offset=this.state.value+1;const read=()=>offset;", "this.state.trace=''+read();", "", ""},
		{"multiple-state-helper-capture", "const owner=this.state;const nested=this.state.nested;const read=()=>owner.value+nested.value;", "this.state.trace=''+read();", "", ""},
		{"asserted-closure", "const offset=2;const read=(()=>offset) as (()=>number);", "this.state.value=read();", "", ""},
		{"satisfies-closure", "const offset=2;const read=(()=>offset) satisfies (()=>number);", "this.state.value=read();", "", ""},
		{"nonnull-closure", "const offset=2;const read=(()=>offset)!;", "this.state.value=read();", "", ""},
		{"wrapped-closure", "const offset=2;const read=((()=>offset) as (()=>number))!;", "this.state.value=read();", "", ""},
		{"constant-closure", "const offset=2;const read=()=>offset;", "this.state.value=read();", "", ""},
		{"object-closure", "const settings={offset:2};const read=()=>settings.offset;", "this.state.value=read();", "", ""},
		{"overloaded-helper", "function read(value:number):number;function read(value:string):number;function read(value:number|string){return Number(value);}", "this.state.value=read(2);", "", ""},
		{"nested-helper", "const read=()=>{function leaf(){return 2;}return leaf();};", "this.state.value=read();", "", ""},
		{"shadowed-helper", "const offset=2;const read=()=>{if(this.state.value){const offset=3;void offset;}return offset;};", "this.state.value=read();", "", ""},
		{"default-helper", "const read=()=>props.input+1;", "this.state.value=value;", "value:number=read(),", ""},
		{"duplicate-state-defaults", "", "this.state.value=first+second;", "first:number=this.state.value,second:number=this.state.value,", ""},
		{"state-default-alias", "const owner=this.state;", "this.state.value=value;", "value:number=owner.value,", ""},
		{"destructured-default", "", "this.state.value=value;", "{value}={value:props.input},", ""},
		{"tuple-default", "", "this.state.value=value;", "[value]=[props.input],", ""},
		{"generic-task", "", "this.state.value=Number(value);", "value:number,", "2"},
		{"inline-context-helper", "", "this.state.value=(()=>this.getContext(Public))();", "", ""},
		{"namespace-context", "const input=this.getContext(Tokens.Public);const read=()=>input;", "this.state.value=read();", "", ""},
		{"local-context-helper", "", "const read=()=>this.getContext(Public);this.state.value=read();", "", ""},
		{"uninvoked-context-helper", "", "const read=()=>this.getContext(Public);void read;this.state.value=2;", "", ""},
		{"destructuring-await-block", "", "({value:this.state.value}=await Promise.resolve({value:2}));", "", ""},
		{"tuple-await-block", "", "[this.state.value]=await Promise.resolve([2]);", "", ""},
		{"destructuring-await-nested", "", "if(props.input){({value:this.state.value}=await Promise.resolve({value:2}));}", "", ""},
		{"consumed-prefix", "", "this.state.value=1;const value=++this.state.value;this.state.trace=String(value);", "", ""},
		{"logical-and", "", "this.state.value=1;const value=(this.state.value&&=2);this.state.trace=String(value);", "", ""},
		{"logical-or", "", "this.state.value=0;const value=(this.state.value||=2);this.state.trace=String(value);", "", ""},
		{"ancestor-ready", "", "this.state.nested={value:1};this.state.nested.value=2;const value=(this.state.nested.value+=1);this.state.trace=String(value);", "", ""},
		{"duplicate-writes", "", "this.state.value=1;this.state.value=2;this.state.trace=String(this.state.value);", "", ""},
		{"object-assign", "", "Object.assign(this.state,{value:2});", "", ""},
		{"state-status", "", "this.state.trace=String(taskStatus(run).pending);this.state.value=2;", "", ""},
		{"native-super-pattern", "", "this.state.values.push(1);class Base{selected=0;set value(value:number){this.selected=value;}}class Child extends Base{read(){[super.value]=[3];[super['value']]=[4];return this.selected;}}this.state.value=new Child().read();", "", ""},
		{"native-private-pattern", "", "this.state.values.push(1);class Reader{#value=0;read(){[this.#value]=[3];return this.#value;}}this.state.value=new Reader().read();", "", ""},
		{"native-element-pattern", "", "this.state.values.push(1);const owner={value:0};[owner['value']=3]=[];this.state.value=owner.value;", "", ""},
		{"class-receivers", "", "class Local{static value=2;static{this.value++;}value=2;read(){return this.value;}get next(){return this.value+1;}}this.state.value=new Local().next+Local.value;", "", ""},
	} {
		for _, placement := range []string{"client", "server"} {
			for _, target := range []Target{TargetClient, TargetServer} {
				t.Run(fmt.Sprintf("%s/%s/%s", c.name, placement, target), func(t *testing.T) {
					r := NewSession().Execute(Request{Kind: "compile", ID: "task-subsystem-lexical.tsx", Target: target, Diagnostics: "semantic", Source: `import {TaskContext,taskStatus,createContext,type Component} from '@exactjs/core';const Public=createContext<number>('public',{keep:'shared'});const Tokens={Public};export function Page(this:Component<{value:number;trace:string;values:number[];nested:{value:number}}>,props:{input:number}){this.state.value=0;this.state.trace='';this.state.values=[];this.state.nested={value:0};` + c.setup + `async function run(` + c.parameters + `task:TaskContext=TaskContext.` + placement + `().blocking()){` + c.work + `}void run(` + c.arguments + `);return()=> <button onClick={()=>run(` + c.arguments + `)}>{this.state.value}:{this.state.trace}</button>;}`})
					if c.name == "object-assign" && placement == "server" {
						if !hasDiagnosticCode(r.Diagnostics, "EXACT2001") {
							t.Fatal("opaque publication escaped")
						}
						return
					}
					if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
						for _, d := range r.Diagnostics {
							t.Logf("%s %s", d.Code, d.Message)
						}
						t.Fatalf("valid lexical task rejected: %s", r.Error)
					}
					if len(r.Analysis.Tasks) != 2 || r.Analysis.Tasks[0].Placement != placement {
						t.Fatalf("task ownership lost: %#v", r.Analysis.Tasks)
					}
				})
			}
		}
	}
}

// Generic components and implicit setup computations retain authored type scopes,
// expression-bodied suspension and the separate task status projection.
func TestTaskSubsystemGenericAndSetupSources(t *testing.T) {
	for _, c := range []struct{ name, source string }{
		{"generic", `export function Page<T extends number=number>(this:Component<{value:T}>,props:{input:T}){this.state.value=props.input;const run=(value:T,task:TaskContext=TaskContext.server().blocking())=>{this.state.value=value;};return()=> <button onClick={()=>run(props.input)}>{this.state.value}</button>;}`},
		{"await-setup", `export async function Page(this:Component<{value:number}>){this.state.value=await Promise.resolve(2);return()=> <output>{this.state.value}</output>;}`},
		{"await-destructuring", `export async function Page(this:Component<{value:number}>){this.state.value=0;async function helper(this:{state:{value:number}}){({value:this.state.value}=await Promise.resolve({value:2}));}await helper.call(this);return()=> <output>{this.state.value}</output>;}`},
		{"await-expression-destructuring", `export async function Page(this:Component<{value:number}>){this.state.value=0;const helper=async()=>({value:this.state.value}=await Promise.resolve({value:2}));await helper();return()=> <output>{this.state.value}</output>;}`},
		{"await-block-destructuring", `export function Page(this:Component<{value:number}>){this.state.value=0;const helper=async()=>{const result=({value:this.state.value}=await Promise.resolve({value:2}));return result;};void helper();return()=> <output>{this.state.value}</output>;}`},
		{"setup-tuple-spread", `export function Page(this:Component<{value:number}>){this.state.value=0;const offset=2;const read=()=>offset;const args:[number]=[1];const run=(value:number,task:TaskContext=TaskContext.client().blocking())=>{this.state.value=value+read();};run(...args);return()=> <output>{this.state.value}</output>;}`},
		{"task-overload", `export function Page(this:Component<{value:number}>){this.state.value=0;function run(value:number):void;function run(value:string):void;function run(value:number|string,task:TaskContext=TaskContext.client().blocking()){this.state.value=Number(value);}run(1);return()=> <button onClick={()=>run('2')}>{this.state.value}</button>;}`},
		{"client-status-assertions", `export function Page(this:Component<{value:number}>){this.state.value=0;const run=(task:TaskContext=TaskContext.client())=>{this.state.value++;};const status=taskStatus((run satisfies typeof run));return()=> <button onClick={()=>run()}>{run.pending}:{run['pendingCount']}:{status.generation}:{String(status.result)}:{String(status.error)}</button>;}`},
		{"generated-capture-collision", `export function Page(this:Component<{value:number}>){this.state.value=0;const __exactHelperCapture0=2;const read=()=>__exactHelperCapture0;const run=(task:TaskContext=TaskContext.server().blocking())=>{this.state.value=read();};run();return()=> <button onClick={()=>run()}>{this.state.value}</button>;}`},
		{"client-status", `export function Page(this:Component<{value:number}>){this.state.value=0;const run=(task:TaskContext=TaskContext.client())=>{this.state.value++;};const status=taskStatus(run);return()=> <button onClick={()=>run()}>{status.pending}:{status['pendingCount']}:{String(status.cancel())}</button>;}`},
		{"direct-server-timer", `export function Page(this:Component<{value:number}>){this.state.value=0;function run(task:TaskContext=TaskContext.server()){const handle=setTimeout(()=>{},1);clearTimeout(handle);this.state.value=1;}run();return()=> <output>{this.state.value}</output>;}`},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(fmt.Sprintf("%s/%s", c.name, target), func(t *testing.T) {
				r := NewSession().Execute(Request{Kind: "compile", ID: "task-subsystem-setup.tsx", Target: target, Diagnostics: "semantic", Source: `import {TaskContext,taskStatus,type Component} from '@exactjs/core';` + c.source})
				if r.Error != "" || len(r.Diagnostics) != 0 || r.Code == "" {
					for _, d := range r.Diagnostics {
						t.Logf("%s %s", d.Code, d.Message)
					}
					t.Fatalf("supported setup scope rejected: %s", r.Error)
				}
			})
		}
	}
}
