/** Authored programs protecting mutation typing, suspension and task callable contracts. */
export const mutationContractCases = [
	{
		name: 'array-direct-dot',
		source:
			"import {TaskContext,peek,type Component} from '@exactjs/core';export function Probe(this:Component<{values:number[];count:number;trace:string}>){this.state.values=[];this.state.count=0;this.state.trace='';return ()=> <section><output>{String(this.state.values.length)}</output><button onClick={()=>{this.state.values.push(1);}}>Next</button></section>;}",
		invalid:
			"import {TaskContext,peek,type Component} from '@exactjs/core';export function Probe(this:Component<{values:number[];count:number;trace:string}>){this.state.values=[];this.state.count=0;this.state.trace='';return ()=> <section><output>{String(this.state.values.length)}</output><button onClick={()=>{this.state.values.push('bad');}}>Next</button></section>;}"
	},
	{
		name: 'custom-runtime-push',
		source:
			"import {TaskContext,peek,type Component} from '@exactjs/core';export function Probe(this:Component<{custom:{push(value:number):number};count:number}>){this.state.count=0;this.state.custom={push:(value:number)=>{this.state.count+=value;return this.state.count;}};return ()=> <section><output>{String(this.state.count)}</output><button onClick={()=>{this.state.custom.push(1);}}>Next</button></section>;}"
	},
	{
		name: 'task-client-direct-context',
		source:
			"import {TaskContext,peek,type Component} from '@exactjs/core';export function Probe(this:Component<{values:number[];count:number;trace:string}>){this.state.values=[];this.state.count=0;this.state.trace='';const run=async(task:TaskContext=TaskContext.client())=>{this.state.values.sort((a,b)=>a-b);};return ()=> <section><output>{String(this.state.count)}</output><button onClick={()=>{void run();}}>Next</button></section>;}",
		invalid:
			"import {TaskContext,peek,type Component} from '@exactjs/core';export function Probe(this:Component<{values:number[];count:number;trace:string}>){this.state.values=[];this.state.count=0;this.state.trace='';const run=async(task:TaskContext=TaskContext.client())=>{this.state.values.sort((a,b)=>a.missing);};return ()=> <section><output>{String(this.state.count)}</output><button onClick={()=>{void run();}}>Next</button></section>;}"
	},
	{
		name: 'task-client-direct-result',
		source:
			"import {TaskContext,peek,type Component} from '@exactjs/core';export function Probe(this:Component<{values:number[];count:number;trace:string}>){this.state.values=[];this.state.count=0;this.state.trace='';const run=async(task:TaskContext=TaskContext.client())=>{const result:number=this.state.values.push(1);void result;};return ()=> <section><output>{String(this.state.count)}</output><button onClick={()=>{void run();}}>Next</button></section>;}",
		invalid:
			"import {TaskContext,peek,type Component} from '@exactjs/core';export function Probe(this:Component<{values:number[];count:number;trace:string}>){this.state.values=[];this.state.count=0;this.state.trace='';const run=async(task:TaskContext=TaskContext.client())=>{const result:string=this.state.values.push(1);void result;};return ()=> <section><output>{String(this.state.count)}</output><button onClick={()=>{void run();}}>Next</button></section>;}"
	},
	{
		name: 'suspension-client-task-compound',
		source:
			"import {TaskContext,peek,type Component} from '@exactjs/core';export function Probe(this:Component<{values:number[];map:Map<string,number>;nested:{count:number};count:number;trace:string}>){this.state.values=[];this.state.map=new Map();this.state.nested={count:0};this.state.count=0;this.state.trace='';const run=async(task:TaskContext=TaskContext.client().latest())=>{this.state.count+=await Promise.resolve(1);};return ()=> <section><output>{String(this.state.count)}</output><button onClick={()=>{void run();}}>Next</button></section>;}",
		invalid:
			"import {TaskContext,peek,type Component} from '@exactjs/core';export function Probe(this:Component<{values:number[];map:Map<string,number>;nested:{count:number};count:number;trace:string}>){this.state.values=[];this.state.map=new Map();this.state.nested={count:0};this.state.count=0;this.state.trace='';const run=async(task:TaskContext=TaskContext.client().latest())=>{this.state.count+=await Promise.resolve('bad');};return ()=> <section><output>{String(this.state.count)}</output><button onClick={()=>{void run();}}>Next</button></section>;}"
	},
	{
		name: 'suspension-client-task-logical',
		source:
			"import {TaskContext,peek,type Component} from '@exactjs/core';export function Probe(this:Component<{values:number[];map:Map<string,number>;nested:{count:number};count:number;trace:string}>){this.state.values=[];this.state.map=new Map();this.state.nested={count:0};this.state.count=0;this.state.trace='';const run=async(task:TaskContext=TaskContext.client().latest())=>{this.state.count ||= await Promise.resolve(1);};return ()=> <section><output>{String(this.state.count)}</output><button onClick={()=>{void run();}}>Next</button></section>;}",
		invalid:
			"import {TaskContext,peek,type Component} from '@exactjs/core';export function Probe(this:Component<{values:number[];map:Map<string,number>;nested:{count:number};count:number;trace:string}>){this.state.values=[];this.state.map=new Map();this.state.nested={count:0};this.state.count=0;this.state.trace='';const run=async(task:TaskContext=TaskContext.client().latest())=>{this.state.count ||= await Promise.resolve('bad');};return ()=> <section><output>{String(this.state.count)}</output><button onClick={()=>{void run();}}>Next</button></section>;}"
	},
	{
		name: 'suspension-client-task-push',
		source:
			"import {TaskContext,peek,type Component} from '@exactjs/core';export function Probe(this:Component<{values:number[];map:Map<string,number>;nested:{count:number};count:number;trace:string}>){this.state.values=[];this.state.map=new Map();this.state.nested={count:0};this.state.count=0;this.state.trace='';const run=async(task:TaskContext=TaskContext.client().latest())=>{this.state.values.push(await Promise.resolve(1));};return ()=> <section><output>{String(this.state.count)}</output><button onClick={()=>{void run();}}>Next</button></section>;}",
		invalid:
			"import {TaskContext,peek,type Component} from '@exactjs/core';export function Probe(this:Component<{values:number[];map:Map<string,number>;nested:{count:number};count:number;trace:string}>){this.state.values=[];this.state.map=new Map();this.state.nested={count:0};this.state.count=0;this.state.trace='';const run=async(task:TaskContext=TaskContext.client().latest())=>{this.state.values.push(await Promise.resolve('bad'));};return ()=> <section><output>{String(this.state.count)}</output><button onClick={()=>{void run();}}>Next</button></section>;}"
	},
	{
		name: 'task-signature-client-default',
		source:
			"import {TaskContext,peek,type Component} from '@exactjs/core';export function Probe(this:Component<{values:number[];map:Map<string,number>;nested:{count:number};count:number;trace:string}>){this.state.values=[];this.state.map=new Map();this.state.nested={count:0};this.state.count=0;this.state.trace='';const run=async(value:number=1,task:TaskContext=TaskContext.client().latest())=>{void value;this.state.count++;};return ()=> <section><output>{String(this.state.count)}</output><button onClick={()=>{void run();}}>Next</button></section>;}"
	},
	{
		name: 'task-signature-client-object-default',
		source:
			"import {TaskContext,peek,type Component} from '@exactjs/core';export function Probe(this:Component<{values:number[];map:Map<string,number>;nested:{count:number};count:number;trace:string}>){this.state.values=[];this.state.map=new Map();this.state.nested={count:0};this.state.count=0;this.state.trace='';const run=async(value:{count:number}={count:1},task:TaskContext=TaskContext.client().latest())=>{void value;this.state.count++;};return ()=> <section><output>{String(this.state.count)}</output><button onClick={()=>{void run();}}>Next</button></section>;}"
	},
	{
		name: 'task-signature-client-tuple-default',
		source:
			"import {TaskContext,peek,type Component} from '@exactjs/core';export function Probe(this:Component<{values:number[];map:Map<string,number>;nested:{count:number};count:number;trace:string}>){this.state.values=[];this.state.map=new Map();this.state.nested={count:0};this.state.count=0;this.state.trace='';const run=async(value:[number]=[1],task:TaskContext=TaskContext.client().latest())=>{void value;this.state.count++;};return ()=> <section><output>{String(this.state.count)}</output><button onClick={()=>{void run();}}>Next</button></section>;}"
	},
	{
		name: 'server-optimistic-latest-none',
		source:
			"import {TaskContext,peek,type Component} from '@exactjs/core';export function Probe(this:Component<{values:number[];map:Map<string,number>;nested:{count:number};count:number;trace:string}>){this.state.values=[];this.state.map=new Map();this.state.nested={count:0};this.state.count=0;this.state.trace='';const run=async(task:TaskContext=TaskContext.server().latest())=>{task.optimistic(()=>{this.state.count++;});};return ()=> <section><output>{String(this.state.count)}</output><button onClick={()=>{void run();}}>Next</button></section>;}"
	},
	{
		name: 'narrow-neighbor-ternary',
		source:
			'import {TaskContext,peek,type Component} from \'@exactjs/core\';function label(value:string|number){return typeof value==="string"?value.length:0;}export function Probe(this:Component<{value:string|number}>){this.state.value="ok";return ()=> <section><output>{String(typeof this.state.value==="string"?this.state.value.length:0)}</output><button onClick={()=>{}}>Next</button></section>;}',
		invalid:
			'import {TaskContext,peek,type Component} from \'@exactjs/core\';function label(value:string|number){return typeof value==="string"?value.length:0;}export function Probe(this:Component<{value:string|number}>){this.state.value="ok";return ()=> <section><output>{String(typeof this.state.value==="string"?this.state.value.missing:0)}</output><button onClick={()=>{}}>Next</button></section>;}'
	},
	{
		name: 'map-chain-result',
		source:
			'import {TaskContext,peek,type Component} from \'@exactjs/core\';export function Probe(this:Component<{collection:Map<string,number>;count:number}>){this.state.collection=new Map();this.state.count=0;return ()=> <section><output>{String(this.state.count)}</output><button onClick={()=>{this.state.collection.set("a",1).set("b",2);this.state.count=this.state.collection.size;}}>Next</button></section>;}'
	},
	{
		name: 'set-chain-result',
		source:
			"import {TaskContext,peek,type Component} from '@exactjs/core';export function Probe(this:Component<{collection:Set<number>;count:number}>){this.state.collection=new Set();this.state.count=0;return ()=> <section><output>{String(this.state.count)}</output><button onClick={()=>{this.state.collection.add(1).add(2);this.state.count=this.state.collection.size;}}>Next</button></section>;}"
	},
	{
		name: 'direct destination',
		source:
			"import type {Component} from '@exactjs/core';export function Probe(this:Component<{count:number;record:{value:number;optional?:number;readonly fixed:number};values:number[];callback:(value:number)=>number}>){this.state.count=0;this.state.record={value:0,fixed:0};this.state.values=[];this.state.callback=value=>value;return ()=> <button onClick={()=>{this.state.count=1;}}>Next</button>;}",
		invalid:
			"import type {Component} from '@exactjs/core';export function Probe(this:Component<{count:number;record:{value:number;optional?:number;readonly fixed:number};values:number[];callback:(value:number)=>number}>){this.state.count=0;this.state.record={value:0,fixed:0};this.state.values=[];this.state.callback=value=>value;return ()=> <button onClick={()=>{this.state.count='bad';}}>Next</button>;}"
	},
	{
		name: 'nested destination',
		source:
			"import type {Component} from '@exactjs/core';export function Probe(this:Component<{count:number;record:{value:number;optional?:number;readonly fixed:number};values:number[];callback:(value:number)=>number}>){this.state.count=0;this.state.record={value:0,fixed:0};this.state.values=[];this.state.callback=value=>value;return ()=> <button onClick={()=>{this.state.record.value=1;}}>Next</button>;}",
		invalid:
			"import type {Component} from '@exactjs/core';export function Probe(this:Component<{count:number;record:{value:number;optional?:number;readonly fixed:number};values:number[];callback:(value:number)=>number}>){this.state.count=0;this.state.record={value:0,fixed:0};this.state.values=[];this.state.callback=value=>value;return ()=> <button onClick={()=>{this.state.record.value='bad';}}>Next</button>;}"
	},
	{
		name: 'readonly destination',
		source:
			"import type {Component} from '@exactjs/core';export function Probe(this:Component<{count:number;record:{value:number;optional?:number;readonly fixed:number};values:number[];callback:(value:number)=>number}>){this.state.count=0;this.state.record={value:0,fixed:0};this.state.values=[];this.state.callback=value=>value;return ()=> <button onClick={()=>{void this.state.record.fixed;}}>Next</button>;}",
		invalid:
			"import type {Component} from '@exactjs/core';export function Probe(this:Component<{count:number;record:{value:number;optional?:number;readonly fixed:number};values:number[];callback:(value:number)=>number}>){this.state.count=0;this.state.record={value:0,fixed:0};this.state.values=[];this.state.callback=value=>value;return ()=> <button onClick={()=>{this.state.record.fixed=1;}}>Next</button>;}"
	},
	{
		name: 'computed property',
		source:
			'import type {Component} from \'@exactjs/core\';export function Probe(this:Component<{count:number;record:{value:number;optional?:number;readonly fixed:number};values:number[];callback:(value:number)=>number}>){this.state.count=0;this.state.record={value:0,fixed:0};this.state.values=[];this.state.callback=value=>value;return ()=> <button onClick={()=>{const key="value";this.state.record[key]=1;}}>Next</button>;}',
		invalid:
			'import type {Component} from \'@exactjs/core\';export function Probe(this:Component<{count:number;record:{value:number;optional?:number;readonly fixed:number};values:number[];callback:(value:number)=>number}>){this.state.count=0;this.state.record={value:0,fixed:0};this.state.values=[];this.state.callback=value=>value;return ()=> <button onClick={()=>{const key="missing";this.state.record[key]=1;}}>Next</button>;}'
	},
	{
		name: 'required delete',
		source:
			"import type {Component} from '@exactjs/core';export function Probe(this:Component<{count:number;record:{value:number;optional?:number;readonly fixed:number};values:number[];callback:(value:number)=>number}>){this.state.count=0;this.state.record={value:0,fixed:0};this.state.values=[];this.state.callback=value=>value;return ()=> <button onClick={()=>{delete this.state.record.optional;}}>Next</button>;}",
		invalid:
			"import type {Component} from '@exactjs/core';export function Probe(this:Component<{count:number;record:{value:number;optional?:number;readonly fixed:number};values:number[];callback:(value:number)=>number}>){this.state.count=0;this.state.record={value:0,fixed:0};this.state.values=[];this.state.callback=value=>value;return ()=> <button onClick={()=>{delete this.state.record.value;}}>Next</button>;}"
	},
	{
		name: 'compound constraint',
		source:
			"import type {Component} from '@exactjs/core';export function Probe(this:Component<{count:number;record:{value:number;optional?:number;readonly fixed:number};values:number[];callback:(value:number)=>number}>){this.state.count=0;this.state.record={value:0,fixed:0};this.state.values=[];this.state.callback=value=>value;return ()=> <button onClick={()=>{this.state.count+=1;}}>Next</button>;}",
		invalid:
			"import type {Component} from '@exactjs/core';export function Probe(this:Component<{count:number;record:{value:number;optional?:number;readonly fixed:number};values:number[];callback:(value:number)=>number}>){this.state.count=0;this.state.record={value:0,fixed:0};this.state.values=[];this.state.callback=value=>value;return ()=> <button onClick={()=>{this.state.count+='bad';}}>Next</button>;}"
	},
	{
		name: 'callback context',
		source:
			"import type {Component} from '@exactjs/core';export function Probe(this:Component<{count:number;record:{value:number;optional?:number;readonly fixed:number};values:number[];callback:(value:number)=>number}>){this.state.count=0;this.state.record={value:0,fixed:0};this.state.values=[];this.state.callback=value=>value;return ()=> <button onClick={()=>{this.state.callback=value=>value+1;}}>Next</button>;}",
		invalid:
			"import type {Component} from '@exactjs/core';export function Probe(this:Component<{count:number;record:{value:number;optional?:number;readonly fixed:number};values:number[];callback:(value:number)=>number}>){this.state.count=0;this.state.record={value:0,fixed:0};this.state.values=[];this.state.callback=value=>value;return ()=> <button onClick={()=>{this.state.callback=value=>value.missing;}}>Next</button>;}"
	},
	{
		name: 'typed assignment result',
		source:
			"import type {Component} from '@exactjs/core';export function Probe(this:Component<{count:number;record:{value:number;optional?:number;readonly fixed:number};values:number[];callback:(value:number)=>number}>){this.state.count=0;this.state.record={value:0,fixed:0};this.state.values=[];this.state.callback=value=>value;return ()=> <button onClick={()=>{const result:number=(this.state.count=1);void result;}}>Next</button>;}",
		invalid:
			"import type {Component} from '@exactjs/core';export function Probe(this:Component<{count:number;record:{value:number;optional?:number;readonly fixed:number};values:number[];callback:(value:number)=>number}>){this.state.count=0;this.state.record={value:0,fixed:0};this.state.values=[];this.state.callback=value=>value;return ()=> <button onClick={()=>{const result:string=(this.state.count=1);void result;}}>Next</button>;}"
	},
	{
		name: 'suspension-event-destructure-array-rhs',
		source:
			"import {type Component} from '@exactjs/core';export function Probe(this:Component<{values:number[];map:Map<string,number>;nested:{count:number};count:number;trace:string}>){this.state.values=[];this.state.map=new Map();this.state.nested={count:0};this.state.count=0;this.state.trace='';return ()=> <button onClick={()=>{const run=async()=>{[this.state.count]=[await Promise.resolve(1)];};void run();}}>Next</button>;}",
		invalid:
			"import {type Component} from '@exactjs/core';export function Probe(this:Component<{values:number[];map:Map<string,number>;nested:{count:number};count:number;trace:string}>){this.state.values=[];this.state.map=new Map();this.state.nested={count:0};this.state.count=0;this.state.trace='';return ()=> <button onClick={()=>{const run=async()=>{[this.state.count]=[await Promise.resolve('bad')];};void run();}}>Next</button>;}"
	},
	{
		name: 'suspension-event-destructure-awaited-rhs',
		source:
			"import {type Component} from '@exactjs/core';export function Probe(this:Component<{values:number[];map:Map<string,number>;nested:{count:number};count:number;trace:string}>){this.state.values=[];this.state.map=new Map();this.state.nested={count:0};this.state.count=0;this.state.trace='';return ()=> <button onClick={()=>{const run=async()=>{[this.state.count]=await Promise.resolve([1]);};void run();}}>Next</button>;}",
		invalid:
			"import {type Component} from '@exactjs/core';export function Probe(this:Component<{values:number[];map:Map<string,number>;nested:{count:number};count:number;trace:string}>){this.state.values=[];this.state.map=new Map();this.state.nested={count:0};this.state.count=0;this.state.trace='';return ()=> <button onClick={()=>{const run=async()=>{[this.state.count]=await Promise.resolve(['bad']);};void run();}}>Next</button>;}"
	},
	{
		name: 'suspension-event-destructure-object-rhs',
		source:
			"import {type Component} from '@exactjs/core';export function Probe(this:Component<{values:number[];map:Map<string,number>;nested:{count:number};count:number;trace:string}>){this.state.values=[];this.state.map=new Map();this.state.nested={count:0};this.state.count=0;this.state.trace='';return ()=> <button onClick={()=>{const run=async()=>{({count:this.state.count}={count:await Promise.resolve(1)});};void run();}}>Next</button>;}",
		invalid:
			"import {type Component} from '@exactjs/core';export function Probe(this:Component<{values:number[];map:Map<string,number>;nested:{count:number};count:number;trace:string}>){this.state.values=[];this.state.map=new Map();this.state.nested={count:0};this.state.count=0;this.state.trace='';return ()=> <button onClick={()=>{const run=async()=>{({count:this.state.count}={count:await Promise.resolve('bad')});};void run();}}>Next</button>;}"
	},
	{
		name: 'task-default-before-required',
		source:
			"import {TaskContext,type Component} from '@exactjs/core';export function Probe(this:Component<{count:number}>){this.state.count=0;const run=(first:number=1,second:number,task:TaskContext=TaskContext.client())=>{this.state.count=first+second;};return()=> <button onClick={()=>run(undefined,2)}>{this.state.count}</button>;}",
		invalid:
			"import {TaskContext,type Component} from '@exactjs/core';export function Probe(this:Component<{count:number}>){this.state.count=0;const run=(first:number=1,second:number,task:TaskContext=TaskContext.client())=>{this.state.count=first+second;};return()=> <button onClick={()=>run()}>{this.state.count}</button>;}"
	}
] as const;
