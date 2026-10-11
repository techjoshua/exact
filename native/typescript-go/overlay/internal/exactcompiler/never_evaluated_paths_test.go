package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Placement and emitted ownership must agree across server-component projection and ordinary builds.
func TestNeverEvaluatedProjectionContracts(t *testing.T) {
	root, config := neverEvaluatedFixture(t)
	cases := []struct{ name, source string }{
		{"forwarded-fragment", `export function Shell(props:{children?:unknown;label:string}){this.state.count=0;return()=> <><button onClick={()=>this.state.count++}>{props.label}:{this.state.count}</button>{props.children}<p>{this.state.count}</p></>}`},
		{"forwarded-nullish", `export function Shell(props:{children?:unknown}){return()=> <section onClick={()=>undefined}>{props.children ?? 'fallback'}</section>}`},
		{"forwarded-computed-nullish", `export function Shell(props:{children?:unknown;key:string}){return()=> <section onClick={()=>undefined}>{props[props.key as 'children'] ?? 'fallback'}</section>}`},
		{"client-own-descendant", `function Child(){window.addEventListener('resize',()=>undefined);return()=> <p>child</p>}export function Page(){window.addEventListener('resize',()=>undefined);return()=> <Child/>}`},
		{"client-conditional-template", `import {TaskContext} from '@exactjs/core';function Shell(props:{children?:unknown}){return()=> <section onClick={()=>undefined}>{props.children}</section>}function Server(){const load=async(task:TaskContext=TaskContext.server())=> 'loaded';load();return()=> <p>server</p>}function Client(){window.addEventListener('resize',()=>undefined);return()=> <p>client</p>}export function Page(props:{active:boolean}){return()=> <Shell>{props.active ? <Server/> : <Client/>}</Shell>}`},
		{"observable-ref-host", `export function Page(){const binding=this.ref<HTMLInputElement>();this.ref<HTMLInputElement>();return()=> <><input ref={binding}/><output>{binding.current?.value}</output></>}`},
		{"island-class-name", `export function Page(){this.state.active=true;return()=> <section className={{active:this.state.active}} onClick={()=>this.state.active=!this.state.active}>class</section>}`},
		{"named-function-task-status", `import {TaskContext} from '@exactjs/core';export function Page(){const run=(task:TaskContext=TaskContext.client())=>1;return()=> <button onClick={()=>run()}>{run.pending}</button>}`},
		{"task-snapshot-and", `import {TaskContext,peek} from '@exactjs/core';export function Page(props:{a:boolean;input:number}){const snapshot=()=>props.input;function run(task:TaskContext=TaskContext.client()){this.state.value=peek(props.a && snapshot || snapshot)}return()=> <button onClick={()=>run()}>run</button>}`},
		{"task-snapshot-or", `import {TaskContext,peek} from '@exactjs/core';export function Page(props:{a:(()=>number)|undefined;input:number}){const snapshot=()=>props.input;function run(task:TaskContext=TaskContext.client()){this.state.value=peek(props.a || snapshot)}return()=> <button onClick={()=>run()}>run</button>}`},
		{"task-snapshot-nullish", `import {TaskContext,peek} from '@exactjs/core';export function Page(props:{a:(()=>number)|undefined;input:number}){const snapshot=()=>props.input;function run(task:TaskContext=TaskContext.client()){this.state.value=peek(props.a ?? snapshot)}return()=> <button onClick={()=>run()}>run</button>}`},
		{"setup-call-task-context", `import {TaskContext} from '@exactjs/core';export function Page(props:{input:number}){this.state.value=((value:number,task:TaskContext=TaskContext.auto())=>value+Number(task.signal.aborted))(props.input);return()=> <p>{this.state.value}</p>}`},
		{"derived-call-result", `export function Page(props:{read:()=>number}){const value=props.read();return()=> <button onClick={()=>console.log(value)}>value</button>}`},
		{"destructuring-state-rest", `export function Page(){this.state.fields={a:1,b:2};const local={...this.state.fields};return()=> <button onClick={()=>this.state.fields.a++}>{local.a}</button>}`},
		{"transparent-fragment-inputs", `export function Page(props:{initial:number;label:string;children?:unknown}){this.state.count=props.initial;const label=props.label;return()=> <_ onClick={()=>this.state.count++}>{label}:{this.state.count}{props.children}<p>tail</p></_>}`},
		{"conditional-client-slot", `function Client(props:{children?:unknown}){window.addEventListener('resize',()=>undefined);return()=> <section>{props.children}</section>}function A(){return()=> <p>a</p>}function B(){return()=> <p>b</p>}export function Page(props:{active:boolean}){return()=> <Client>{props.active?<A/>:<B/>}</Client>}`},
		{"fragment-capture-state-connection", `export function Page(props:{initial:number;label:string;children?:unknown}){this.state.count=props.initial;const label=props.label;return()=> <><button onClick={()=>this.state.count++}>{label}</button><p>{this.state.count}:{label}</p>{props.children}</>}`},
		{"optional-setup-computation", `export function Page(props:{active:boolean;value:number}){const service=props.active?{read:()=>props.value}:undefined;this.state.value=service?.read();return()=> <p>{this.state.value}</p>}`},
		{"closed-ssr-local-root", `import {renderToString} from '@exactjs/ssr';function Page(){return()=> <button onClick={()=>undefined}>local</button>}export function render(){return renderToString(<Page/>,{markers:false})}`},
		{"closed-ssr-exported-root", `import {renderToString} from '@exactjs/ssr';export function Page(){return()=> <button onClick={()=>undefined}>exported</button>}export function render(){return renderToString(<Page/>,{markers:false})}`},
		{"closed-ssr-universal-call", `import {renderToString} from '@exactjs/ssr';function Page(){return()=> <button onClick={()=>undefined}>local</button>}export function render(props:{value:unknown}){renderToString(props.value as never);return renderToString(<Page/>,{markers:false})}`},
		{"policy-parameter-computation", `import {TaskContext} from '@exactjs/core';export function Page(props:{value:number}){((value:number,task:TaskContext=TaskContext.auto())=>{this.state.value=value+Number(task.signal.aborted)})(props.value);return()=> <p>{this.state.value}</p>}`},
		{"closed-ssr-continuation-False-False", `import {TaskContext} from '@exactjs/core';import {renderToString} from '@exactjs/ssr';function Root(){return()=> <p>root</p>}function Other(props:{input:number}){this.state.value=0;async function run(task:TaskContext=TaskContext.auto().blocking()){this.state.value=await Promise.resolve(props.input)}run();return()=> <p>{this.state.value}</p>}export function render(value:unknown){return renderToString(<Root/>,{markers:false})}`},
		{"closed-ssr-continuation-False-True", `import {TaskContext} from '@exactjs/core';import {renderToString} from '@exactjs/ssr';function Root(){return()=> <p>root</p>}function Other(props:{input:number}){this.state.value=0;async function run(task:TaskContext=TaskContext.auto().blocking()){this.state.value=await Promise.resolve(props.input)}run();return()=> <p>{this.state.value}</p>}export function render(value:unknown){renderToString(value as never);return renderToString(<Root/>,{markers:false})}`},
		{"closed-ssr-continuation-True-False", `import {TaskContext} from '@exactjs/core';import {renderToString} from '@exactjs/ssr';function Root(){return()=> <p>root</p>}export function Other(props:{input:number}){this.state.value=0;async function run(task:TaskContext=TaskContext.auto().blocking()){this.state.value=await Promise.resolve(props.input)}run();return()=> <p>{this.state.value}</p>}export function render(value:unknown){return renderToString(<Root/>,{markers:false})}`},
		{"closed-ssr-continuation-True-True", `import {TaskContext} from '@exactjs/core';import {renderToString} from '@exactjs/ssr';function Root(){return()=> <p>root</p>}export function Other(props:{input:number}){this.state.value=0;async function run(task:TaskContext=TaskContext.auto().blocking()){this.state.value=await Promise.resolve(props.input)}run();return()=> <p>{this.state.value}</p>}export function render(value:unknown){renderToString(value as never);return renderToString(<Root/>,{markers:false})}`},
		{"foreign-fragment-state-connection", `import {Fragment} from 'react';export function Page(){this.state.count=0;return()=> <Fragment><button onClick={()=>this.state.count++}>{this.state.count}</button><p>{this.state.count}</p></Fragment>}`},
		{"client-foreign-descendant", `import {Fragment} from 'react';function Child(){return()=> <p>child</p>}export function Page(){window.addEventListener('resize',()=>undefined);return()=> <Fragment><Child/></Fragment>}`},
		{"dormant-external-render", `declare function view():unknown;export function Page(){return view}`},
		{"dormant-render-alias", `function view(){return <p>view</p>}export function Page(){return view}`},
		{"dormant-local-render-alias", `export function Page(){const view=()=> <p>view</p>;const selected=view;return selected}`},
		{"policy-signal-direct-assignment", `import {TaskContext} from '@exactjs/core';export function Page(props:{value:number}){((value:number,task:TaskContext=TaskContext.auto())=>{this.state.value=task.signal.aborted?0:value})(props.value);return()=> <p>{this.state.value}</p>}`},
		{"cursor-bounded-svg", `function Child(){return()=> <g/>}export function Page(props:{value:string}){return()=> <section><Child/><svg/><div><div><div><div><div><div><div><div title={props.value}>deep</div></div></div></div></div></div></div></div></section>}`},
		{"cursor-bounded-contextual", `function Child(){return()=> <g/>}export function Page(props:{value:string}){return()=> <><Child/><g/><div><div><div><div><div><div><div><div title={props.value}>deep</div></div></div></div></div></div></div></div></>}`},
		{"document-direct-list", `export function Page(props:{values:{id:string;label:string}[]}){return()=> <html><head/><body>{props.values.map(value=><p key={value.id}>{value.label}</p>)}</body></html>}`},
		{"opaque-duration-helper", `import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};
const duration=new Intl.DurationFormat('en-US');function format(value:{minutes:number;seconds:number}){return duration.format(value)}export function Page(){return()=> <time time:update>{format({minutes:Math.floor(Date.now()/60000),seconds:Math.floor(Date.now()/1000)})}</time>}`},
		{"module-secret-consumer", `/** @exact keep=secret */ declare const credential:string;
const size=credential.length;export function Page(){return()=> <p>public</p>}`},
		{"dormant-called-immutable-alias", `export function Page(){function read(){return 1}const alias=read;return()=> <p>{alias()}</p>}`},
		{"module-outer-keyed-inner-list", `const rows=[1];export function Page(props:{values:{id:string;label:string}[]}){return()=> <>{rows.map(row=><section key={row}>{props.values.map(value=><p key={value.id}>{value.label}</p>)}</section>)}</>}`},
		{"module-outer-fallback-keyed-inner-list", `const rows=[1];export function Page(props:{values:{id:string;label:string}[]}){return()=> <>{rows.map(row=><template key={row}>{props.values.map(value=><p key={value.id}>{value.label}</p>)}</template>)}</>}`},
		{"selfclosing-client-island-tail", `export function Page(){return()=> <section><input onClick={()=>undefined}/><p>tail</p></section>}`},
		{"selfclosing-client-island-only", `export function Page(){return()=> <section><input onClick={()=>undefined}/></section>}`},
		{"native-export-ref", `const value=1;export {value};`},
	}
	for _, c := range cases {
		for _, target := range []Target{TargetClient, TargetServer} {
			for _, serverComponents := range []bool{false, true} {
				t.Run(c.name+"/"+string(target)+"/"+fmtBool(serverComponents), func(t *testing.T) {
					entry := filepath.Join(root, "Entry.tsx")
					if err := os.WriteFile(entry, []byte(c.source), 0600); err != nil {
						t.Fatal(err)
					}
					response := NewSession().Execute(Request{ID: entry, Kind: "compile", Target: target, Source: c.source, ConfigFile: config, JSXInterop: &JSXInterop{AdapterModule: "@exactjs/react-compat", AdapterExport: "adaptReactComponent"}, ServerComponents: serverComponents, ComponentContractProjection: ComponentContractProjectionHydrate})
					if response.Error != "" {
						t.Fatal(response.Error)
					}
					if c.name == "opaque-duration-helper" {
						if !hasDiagnosticCode(response.Diagnostics, "EXACT_TIME_UNSAFE") {
							t.Fatalf("opaque formatter helper lost clock safety validation: %#v", response.Diagnostics)
						}
						return
					}
					if len(response.Diagnostics) != 0 {
						t.Fatalf("source rejected: %#v", response.Diagnostics)
					}
					if response.Code == "" {
						t.Fatal("missing executable artifact")
					}
					if strings.Contains(response.Code, "<_target") {
						t.Fatal("target syntax retained in executable artifact")
					}
				})
			}
		}
	}
}

func fmtBool(value bool) string {
	if value {
		return "islands"
	}
	return "ordinary"
}

// Renaming or selecting a real DOM export cannot erase its browser-only call contract.
func TestNeverEvaluatedDomDeclarationOwnership(t *testing.T) {
	root, config := neverEvaluatedFixture(t)
	for _, name := range []string{"render", "unmount", "dispose", "findComponentDomNode", "disposeOwnedSubtree"} {
		for _, shape := range []string{"direct", "renamed", "const-alias", "namespace", "literal-member", "wrapped-member"} {
			t.Run(name+"/"+shape, func(t *testing.T) {
				imported := `import {` + name + `} from '@exactjs/dom';`
				callee := name
				switch shape {
				case "renamed":
					imported = `import {` + name + ` as operation} from '@exactjs/dom';`
					callee = "operation"
				case "const-alias":
					imported += `const operation=` + name + `;`
					callee = "operation"
				case "namespace":
					imported = `import * as DOM from '@exactjs/dom';`
					callee = "DOM." + name
				case "literal-member":
					imported = `import * as DOM from '@exactjs/dom';`
					callee = `DOM['` + name + `']`
				case "wrapped-member":
					imported = `import * as DOM from '@exactjs/dom';`
					callee = "(DOM." + name + ")"
				}
				source := imported + `const operationType=` + callee + `;declare const args:Parameters<typeof operationType>;export function Page(){` + callee + `(...args);return()=> <p>browser</p>}`
				entry := filepath.Join(root, "Entry.tsx")
				if err := os.WriteFile(entry, []byte(source), 0600); err != nil {
					t.Fatal(err)
				}
				response := NewSession().Execute(Request{ID: entry, Kind: "compile", Target: TargetClient, Source: source, ConfigFile: config, Diagnostics: "semantic"})
				if response.Error != "" || len(response.Diagnostics) != 0 {
					t.Fatalf("invalid source control: %s %#v", response.Error, response.Diagnostics)
				}
				for _, component := range response.Analysis.Components {
					if component.Name == "Page" {
						if component.Placement != "client" {
							t.Fatalf("DOM import lost browser ownership: %#v", component)
						}
						return
					}
				}
				t.Fatal("component disappeared")
			})
		}
	}
	// Ordinary authored functions do not acquire framework platform authority from their names.
	source := `function unmount(){return false}function dispose(){return false}export function Page(){unmount();dispose();return()=> <p>ordinary</p>}`
	entry := filepath.Join(root, "Entry.tsx")
	if err := os.WriteFile(entry, []byte(source), 0600); err != nil {
		t.Fatal(err)
	}
	response := NewSession().Execute(Request{ID: entry, Kind: "compile", Target: TargetClient, Source: source, ConfigFile: config, Diagnostics: "semantic"})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("ordinary control rejected: %s %#v", response.Error, response.Diagnostics)
	}
	formsRequirePortable(t, response)
}
