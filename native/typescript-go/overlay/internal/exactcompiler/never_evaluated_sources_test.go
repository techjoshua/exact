package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Source witnesses cover unvisited alternatives without fabricating checker or lowering facts.
func TestNeverEvaluatedSourceContracts(t *testing.T) {
	root, config := neverEvaluatedFixture(t)
	cases := []struct{ name, source, diagnostic, emitted string }{
		{"native-date-number", `export function Page(props:{stamp:number}){const date=new Date(props.stamp);return()=> <p>{date.toISOString()}</p>}`, "", "Date"},
		{"native-date-string-control", `export function Page(props:{stamp:string}){const date=new Date(props.stamp);return()=> <p>{date.toISOString()}</p>}`, "EXACT2202", ""},
		{"local-mapper-mutation", `export function Page(props:{values:number[]}){const labels=props.values.map(value=>{let count=value;count++;return count});return()=> <p>{labels.join(',')}</p>}`, "", "count"},
		{"external-mapper-mutation", `let count=0;export function Page(props:{values:number[]}){const labels=props.values.map(value=>{count++;return value});return()=> <p>{labels.join(',')}</p>}`, "EXACT2202", ""},
		{"second-array-binding", `export function Page(props:{values:number[]}){const [,second]=props.values;return()=> <p>{second}</p>}`, "", "second"},
		{"dynamic-one-child", `import {createDynamicComponent} from '@exactjs/core';function Panel(props:{children?:unknown}){return()=> <article>{props.children}</article>}export function Page(){const Selected=createDynamicComponent(()=>Panel);return()=> <Selected><p>child</p></Selected>}`, "", "child"},
		{"dynamic-many-children", `import {createDynamicComponent} from '@exactjs/core';function Panel(props:{children?:unknown}){return()=> <article>{props.children}</article>}export function Page(){const Selected=createDynamicComponent(()=>Panel);return()=> <Selected><p>first</p><p>second</p></Selected>}`, "", "DynamicComponent"},
		{"static-alias-chain", `function Panel(){return()=> <p>panel</p>}const First=Panel;const Second=First;export function Page(){return()=> <Second/>}`, "", "panel"},
		{"micro-one-child", `export function Page(){const Panel=(props:{children?:unknown})=><article>{props.children}</article>;return()=> <Panel><p>child</p></Panel>}`, "", "child"},
		{"micro-many-children", `export function Page(){const Panel=(props:{children?:unknown})=><article>{props.children}</article>;return()=> <Panel><p>first</p><p>second</p></Panel>}`, "", "second"},
		{"root-import-partial-retention", `import {render,unmount} from '@exactjs/dom';export function Page(){return()=> <p>root</p>}export function run(host:Element){render(<Page/>,host);return unmount(host)}`, "", "unmount"},
		{"published-root-props", `import {readPublishedRootProps} from '@exactjs/hydrate/root';export function Page(){return()=> <p>root</p>}export function run(host:Element){return readPublishedRootProps(host)}`, "", "read"},
		{"context-typed-options", `import {createContext} from '@exactjs/core';declare const options:{scope:'request'};export const Context=createContext('value', options)`, "", "createContext"},
		{"mathml-known-integration", `export function Page(){return()=> <math><annotation-xml encoding="text/html"><div>text</div></annotation-xml></math>}`, "", "annotation"},
		{"mathml-dynamic-integration", `export function Page(props:{encoding:string}){return()=> <math><annotation-xml encoding={props.encoding}><div>text</div></annotation-xml></math>}`, "", "encoding"},
		{"fragment-browser-state", `import type {Component} from '@exactjs/core';export function Page(this:Component<{count:number}>){this.state.count=0;return()=> <><button onClick={()=>this.state.count++}>{this.state.count}</button><p>tail</p></>}`, "", "tail"},
		{"nullish-browser-child", `export function Page(props:{label:string|null}){return()=> <section onClick={()=>undefined}>{props.label ?? 'fallback'}</section>}`, "", "fallback"},
		{"snapshot-selected-operators", `import {peek} from '@exactjs/core';export function Page(props:{a:boolean;b:string|null}){const label=peek(()=>props.a && (props.b || 'fallback'));return()=> <p>{label}</p>}`, "", "fallback"},
		{"optional-call-non-null", `export function Page(props:{read?:()=>number}){return()=> <button onClick={()=>props.read?.()!}>read</button>}`, "", "read"},
		{"default-destructured-target", `export function Page({label='fallback'}:{label?:string}={}){return()=> <_target title={label}/>}`, "", "children"},
		{"target-this-parameter", `import type {Component} from '@exactjs/core';export function Page(this:Component<{}>){return()=> <_target title="target"/>}`, "", "children"},
		{"target-explicit-children", `export function Page(props:{children:unknown}){return()=> <_target> {props.children} </_target>}`, "EXACT6021", ""},
		{"state-array-second-alias", `import type {Component} from '@exactjs/core';export function Page(this:Component<{rows:{value:number}[]}>){this.state.rows=[{value:1},{value:2}];const [,second]=this.state.rows;return()=> <button onClick={()=>second.value++}>{second.value}</button>}`, "", "second"},
		{"state-rest-assignment", `import type {Component} from '@exactjs/core';export function Page(this:Component<{fields:{a:number;b:number};rest:{b:number};a:number}>){this.state.fields={a:1,b:2};this.state.rest={b:0};this.state.a=0;({a:this.state.a,...this.state.rest}=this.state.fields);return()=> <p>{this.state.a}:{this.state.rest.b}</p>}`, "", "rest"},
		{"computed-non-null-task", `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{rows:({value:number}|undefined)[];index:number;value:number}>){this.state.rows=[{value:1}];this.state.index=0;this.state.value=0;function run(task:TaskContext=TaskContext.client()){this.state.value=this.state.rows[this.state.index]!.value}return()=> <button onClick={()=>run()}>{this.state.value}</button>}`, "", "value"},
		{"optional-call-receiver", `export function Page(props:{service?:{read:()=>number}}){return()=> <p>{props.service?.read()}</p>}`, "", "read"},
		{"invoked-arrow-task-status", `import {TaskContext} from '@exactjs/core';export function Page(){const run=(task:TaskContext=TaskContext.client())=>1;run();return()=> <button>{run.pending}</button>}`, "", "button"},
		{"fragment-state-inputs", `import type {Component} from '@exactjs/core';export function Page(this:Component<{count:number}>,props:{initial:number;label:string}){this.state.count=props.initial;const label=props.label;return()=> <><button onClick={()=>this.state.count++}>{label}:{this.state.count}</button><p>{label}</p></>}`, "", "label"},
		{"keyed-svg-list", `export function Page(props:{values:{id:string;label:string}[]}){return()=> <svg>{props.values.map(value=><text key={value.id}>{value.label}</text>)}</svg>}`, "", "svg"},
		{"keyed-contextual-list", `export function Page(props:{values:{id:string;label:string}[]}){return()=> <>{props.values.map(value=><g key={value.id}><text>{value.label}</text></g>)}</>}`, "", "label"},
		{"tracked-parameter", `/** @exact pure */ declare function observe(/** @exact track */ callback:()=>number):number;export function Page(props:{value:number}){const value=observe(()=>props.value);return()=> <p>{value}</p>}`, "", "observe"},
		{"explicit-shared-projection", `/** @exact keep=server */ declare const record:{label:string};
/** @exact shared */ const label=record.label;export function Page(){return()=> <p>{label}</p>}`, "", "label"},
		{"secret-assignment-rest", `/** @exact keep=secret */ declare const record:{label:string;token:string};let label='';let rest={token:''};({label,...rest}=record);export function Page(){return()=> <p>public</p>}`, "EXACT3003", ""},
		{"state-qualified-property", `import type {Component} from '@exactjs/core';declare const marker:unique symbol;
/** @exact keep=secret */ type Protected=string&{readonly[marker]:true};export function Page(this:Component<{credential:Protected}>){return()=> <p>public</p>}`, "", "public"},
		{"state-annotated-qualified-property", `import type {Component} from '@exactjs/core';declare const marker:unique symbol;
/** @exact keep=secret */ type Protected=string&{readonly[marker]:true};interface State{
/** @exact keep=server */ credential:Protected}export function Page(this:Component<State>){return()=> <p>public</p>}`, "", "public"},
		{"static-component-local-alias", `import {createDynamicComponent} from '@exactjs/core';export function Page(){function Panel(){return()=> <p>panel</p>}const First=Panel;const Second=First;const Selected=createDynamicComponent(()=>Second);return()=> <Selected/>}`, "EXACT2216", ""},
		{"secret-state-client-capture", `import type {Component} from '@exactjs/core';declare const marker:unique symbol;
/** @exact keep=secret */ type Protected=string&{readonly[marker]:true};export function Page(this:Component<{credential:Protected}>){return()=> <button onClick={()=>console.log(this.state.credential)}>public</button>}`, "EXACT3020", ""},
		{"module-secret-consumption", `declare function opaque(value:unknown):unknown;import {secret,consume} from '@exactjs/secrets';const value=secret('TOKEN','configured');opaque(consume(value));export const result=1;`, "", "consume"},
		{"prepared-intl-time-projections", `import * as intl from '@exactjs/intl/enhancements' with {type:'exact-enhancement'};import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};import {prepareIntlActivation as __exactPrepareIntl} from '@exactjs/intl/internal';declare const descriptor:Parameters<typeof __exactPrepareIntl>[0];export function Page(){return()=> <p intl:message={__exactPrepareIntl(descriptor,[Math.floor(Date.now()/1000)],[(__intlChildren:Parameters<import("@exactjs/intl").IntlElementFactory>[0])=><time time:update>{__intlChildren}</time>,(__intlChildren:Parameters<import("@exactjs/intl").IntlElementFactory>[0])=><em>{__intlChildren}</em>,(__intlChildren:Parameters<import("@exactjs/intl").IntlElementFactory>[0])=><strong>{__intlChildren}</strong>],__intlContent=><p>{__intlContent}</p>)}><time time:update>{Math.floor(Date.now()/1000)}</time><em>elapsed</em><strong>ready</strong></p>}`, "", "createTimeActivation"},
		{"escaped-setup-resource", `class Resource{[Symbol.dispose](){}}declare let escaped:Resource;export function Page(){escaped=new Resource();return()=> <p>resource</p>}`, "EXACT2001", ""},
		{"target-literal-children", `export function Page(){return()=> <_target>invalid</_target>}`, "EXACT6021", ""},
	}
	for _, c := range cases {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(c.name+"/"+string(target), func(t *testing.T) {
				entry := filepath.Join(root, "Entry.tsx")
				if err := os.WriteFile(entry, []byte(c.source), 0600); err != nil {
					t.Fatal(err)
				}
				response := NewSession().Execute(Request{ID: entry, Kind: "compile", Target: target, Source: c.source, ConfigFile: config, Diagnostics: "semantic"})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				if c.diagnostic != "" || (c.name == "module-secret-consumption" && target == TargetClient) {
					code := c.diagnostic
					if c.name == "module-secret-consumption" && target == TargetClient {
						code = "EXACT3004"
					}
					if c.name == "secret-state-client-capture" && target == TargetServer {
						code = "EXACT3021"
					}
					if !hasDiagnosticCode(response.Diagnostics, code) {
						t.Fatalf("missing rejection %s: %#v", c.diagnostic, response.Diagnostics)
					}
					return
				}
				if len(response.Diagnostics) != 0 {
					t.Fatalf("source rejected: %#v", response.Diagnostics)
				}
				if c.emitted != "" && !strings.Contains(response.Code, c.emitted) {
					t.Fatalf("source value lost: %s", response.Code)
				}
			})
		}
	}
}

// Local fixtures resolve the real workspace declarations and clean up immediately on failure.
func neverEvaluatedFixture(t *testing.T) (string, string) {
	t.Helper()
	root, err := os.MkdirTemp(".", ".never-evaluated-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(root) })
	root, err = filepath.Abs(root)
	if err != nil {
		t.Fatal(err)
	}
	config := filepath.Join(root, "tsconfig.json")
	if err := os.WriteFile(config, []byte(`{"compilerOptions":{"target":"ESNext","module":"ESNext","moduleResolution":"Bundler","jsx":"preserve","jsxImportSource":"@exactjs/jsx","skipLibCheck":true}}`), 0600); err != nil {
		t.Fatal(err)
	}
	return root, config
}
