/** @vitest-environment jsdom */
import { expect, it, onTestFinished } from 'vitest';
import {
	createExactRuntimeInspectionOwner,
	type AnyComponentFunction,
	type ExactRuntimeInspectionOwner
} from '@exactjs/core';
import type { ExactRuntimeInspectionEvent } from '@exactjs/devtools-protocol';
import { createCompiledComponentInputReceipt } from '@exactjs/core/runtime/component-operations';
import { render, dispose } from '@exactjs/dom';
import { flushSync } from '@exactjs/reactive';
import { stateWriteArtifact } from '../test-support/state-write-artifact.js';
/** Runs an authored task through its mounted owner, retaining framework reports as failures. */
async function clientArtifact(source: string, inspection?: ExactRuntimeInspectionOwner) {
	const compiled = await stateWriteArtifact(source, 'client');
	const host = document.createElement('div');
	onTestFinished(() => {
		dispose(host, true);
		host.remove();
	});
	const reports: unknown[] = [];
	render(createCompiledComponentInputReceipt(compiled.Page as AnyComponentFunction, {}), host, {
		inspection,
		onErrorReport: (report) => reports.push(report)
	});
	host.querySelector('button')!.click();
	await new Promise((resolve) => setTimeout(resolve, 0));
	flushSync();
	expect(reports).toEqual([]);
	return { compiled };
}
/** Excludes framework input/output reads from the authored mutation's evaluation interval. */
function operationTrace(value: unknown) {
	const trace = value as unknown[];
	const begin = trace.indexOf('begin');
	const end = trace.indexOf('end');
	expect(begin).toBeGreaterThanOrEqual(0);
	expect(end).toBeGreaterThan(begin);
	return trace.slice(begin + 1, end);
}
for (const operator of ['||=', '&&=', '??='])
	for (const writing of [false, true])
		it(`preserves logical ${operator} ${writing ? 'writing' : 'skipping'} accessor arm`, async () => {
			const initial =
				operator === '&&='
					? writing
						? '1'
						: '0'
					: writing
						? operator === '??='
							? 'undefined'
							: '0'
						: '1';
			const { compiled } =
				await clientArtifact(`import {TaskContext,type Component} from '@exactjs/core';
export const trace:unknown[]=[];let stored:number|undefined=${initial};
export function Page(this:Component<{item:{value:number|undefined}}>){
 const item={tag:'owner',get value(){trace.push('get');return stored;},set value(value:number|undefined){trace.push(this.tag==='owner'?'set':'wrong-this');stored=value;}};
 this.state.item=item;
 function run(task:TaskContext=TaskContext.client().latest()){
  trace.push('begin');const result=(this.state.item.value ${operator} (trace.push('rhs'),9));trace.push(result);trace.push('end');
 }return()=> <button onClick={()=>run()}>ready</button>;
}`);
			expect(operationTrace(compiled.trace)).toEqual(
				writing ? ['get', 'rhs', 'set', 9] : ['get', operator === '&&=' ? 0 : 1]
			);
		});
const indexedLogicalCases = ['||=', '&&=', '??='].flatMap((operator) =>
	[false, true].map((writing) => {
		const initial =
			operator === '&&='
				? writing
					? '1'
					: '0'
				: writing
					? operator === '??='
						? 'undefined'
						: '0'
					: '1';
		return {
			name: `indexed logical ${operator} ${writing ? 'writing' : 'skipping'}`,
			type: 'number|undefined',
			setup: `this.state.item=${initial};`,
			body: `const owner=this;const calls={run(){trace.push(owner.state.item ${operator} (trace.push('rhs'),9));}};calls.run();trace.push(this.state.item);`,
			expected: writing ? ['rhs', 9, 9] : [operator === '&&=' ? 0 : 1, operator === '&&=' ? 0 : 1]
		};
	})
);
const referenceCases = [
	{
		name: 'ordinary class expression alias across await',
		ordinary: true,
		setup: 'this.state.item={value:0};',
		type: '{value:number}',
		body: 'const owner=this;const old=this.state.item;const Assign=class{async run(){owner.state.item.value=await Promise.resolve().then(()=>{owner.state.item={value:7};return 2;});trace.push(old.value,owner.state.item.value);}};await new Assign().run();',
		expected: [2, 7]
	},
	{
		name: 'primitive receiver invokes inherited setter with native this',
		type: '{__exactPrimitiveValue:number}',
		setup: 'this.state.item=1 as unknown as {__exactPrimitiveValue:number};',
		body: "const previous=Object.getOwnPropertyDescriptor(Number.prototype,'__exactPrimitiveValue');try{Object.defineProperty(Number.prototype,'__exactPrimitiveValue',{configurable:true,set(value:number){trace.push(typeof this,Number(this),value);}});trace.push(this.state.item.__exactPrimitiveValue=2);}finally{if(previous)Object.defineProperty(Number.prototype,'__exactPrimitiveValue',previous);else Reflect.deleteProperty(Number.prototype,'__exactPrimitiveValue');}",
		expected: ['number', 1, 2, 2]
	},
	...indexedLogicalCases,
	{
		name: 'overlapping async callbacks retain independent references',
		setup: 'this.state.item={value:0};',
		type: '{value:number}',
		body: 'const old=this.state.item;let release:(()=>void)|undefined;const assign=async()=>{this.state.item.value=await new Promise<number>(resolve=>{if(!release)release=()=>resolve(1);else resolve(2);});};const first=assign();this.state.item={value:10};await assign();release!();await first;trace.push(old.value,this.state.item.value);',
		expected: [1, 2]
	},
	{
		name: 'parameter defaults retain each invocation receiver',
		setup: 'this.state.item={value:0};',
		type: '{value:number}',
		body: 'const old=this.state.item;let level=0;const assign=(value:number=(this.state.item.value=++level===1?(this.state.item={value:10},assign(),1):2)):number=>value;assign();trace.push(old.value,this.state.item.value);',
		expected: [1, 2]
	},
	{
		name: 'reentrant method retains each invocation receiver',
		setup: 'this.state.item={value:0};',
		type: '{value:number}',
		body: 'const owner=this;const old=this.state.item;let level=0;const calls={assign(){owner.state.item.value=++level===1?(owner.state.item={value:10},calls.assign(),1):2;}};calls.assign();trace.push(old.value,this.state.item.value);',
		expected: [1, 2]
	},
	{
		name: 'reentrant callback retains each invocation receiver',
		setup: 'this.state.item={value:0};',
		type: '{value:number}',
		body: 'const old=this.state.item;let level=0;const assign=()=>{this.state.item.value=++level===1?(this.state.item={value:10},assign(),1):2;};assign();trace.push(old.value,this.state.item.value);',
		expected: [1, 2]
	},
	{
		name: 'nullish plain receiver fails after RHS without key conversion',
		setup: 'this.state.item=null as unknown as {value:number};',
		type: '{value:number}',
		body: "const key={ [Symbol.toPrimitive](){trace.push('key');return 'value';}} as unknown as 'value';try{this.state.item[key]=(trace.push('rhs'),2);}catch{trace.push('caught');}",
		expected: ['rhs', 'caught']
	},
	{
		name: 'primitive deletion keeps native success and key conversion',
		setup: 'this.state.item=1 as unknown as {value?:number};',
		type: '{value?:number}',
		body: "const key={ [Symbol.toPrimitive](){trace.push('key');return 'value';}} as unknown as 'value';trace.push(delete this.state.item[key]);",
		expected: ['key', true]
	},
	{
		name: 'first compound conversion failure prevents RHS',
		setup: 'this.state.item={value:1};',
		type: '{value:number}',
		body: "const key={ [Symbol.toPrimitive](){trace.push('key');throw new Error('key');}} as unknown as 'value';try{this.state.item[key]+=(trace.push('rhs'),2);}catch{trace.push('caught');}",
		expected: ['key', 'caught']
	},
	{
		name: 'blocking pending compound preserves read and awaited put conversions',
		setup: 'this.state.item={value:1};',
		type: '{value:number}',
		policy: '.blocking()',
		body: "function select(item:{value:number}){return item;}select(this.state.item);const key={ [Symbol.toPrimitive](){trace.push('key');return 'value';}} as unknown as 'value';trace.push(this.state.item[key]+=await Promise.resolve((trace.push('rhs'),2)));",
		expected: ['key', 'rhs', 'key', 3]
	},
	{
		name: 'plain assignment key conversion after RHS',
		setup: 'this.state.item={value:1};',
		type: '{value:number}',
		body: "const key={ [Symbol.toPrimitive](){trace.push('key');return 'value';}} as unknown as 'value';trace.push(this.state.item[key]=(trace.push('rhs'),4));",
		expected: ['rhs', 'key', 4]
	},
	{
		name: 'compound reads left and writes right when coercion changes',
		setup: 'this.state.item={left:1,right:10};',
		type: '{left:number;right:number}',
		body: "let calls=0;const key={ [Symbol.toPrimitive](){trace.push('key');return ++calls===1?'left':'right';}} as unknown as 'left';trace.push(this.state.item[key]+=(trace.push('rhs'),2));trace.push(this.state.item.left,this.state.item.right);",
		expected: ['key', 'rhs', 'key', 3, 1, 3]
	},
	{
		name: 'logical reads left and writes right when coercion changes',
		setup: 'this.state.item={left:1,right:10};',
		type: '{left:number;right:number}',
		body: "let calls=0;const key={ [Symbol.toPrimitive](){trace.push('key');return ++calls===1?'left':'right';}} as unknown as 'left';trace.push(this.state.item[key]&&=(trace.push('rhs'),2));trace.push(this.state.item.left,this.state.item.right);",
		expected: ['key', 'rhs', 'key', 2, 1, 2]
	},
	{
		name: 'throwing plain key conversion follows RHS',
		setup: 'this.state.item={value:1};',
		type: '{value:number}',
		body: "const key={ [Symbol.toPrimitive](){trace.push('key');throw new Error('key');}} as unknown as 'value';try{this.state.item[key]=(trace.push('rhs'),2);}catch{trace.push('caught');}trace.push(this.state.item.value);",
		expected: ['rhs', 'key', 'caught', 1]
	},
	{
		name: 'throwing compound put conversion does not write',
		setup: 'this.state.item={value:1};',
		type: '{value:number}',
		body: "let calls=0;const key={ [Symbol.toPrimitive](){trace.push('key');if(++calls===2)throw new Error('key');return 'value';}} as unknown as 'value';try{this.state.item[key]+=(trace.push('rhs'),2);}catch{trace.push('caught');}trace.push(this.state.item.value);",
		expected: ['key', 'rhs', 'key', 'caught', 1]
	},
	{
		name: 'Symbol key conversion and primitive key results',
		setup: 'this.state.item={value:1};',
		type: '{value:number;[key:symbol]:number}',
		body: "const symbol=Symbol('key');const key={ [Symbol.toPrimitive](){trace.push('key');return symbol;}} as unknown as symbol;trace.push(this.state.item[key]=(trace.push('rhs'),2));this.state.item.value+=3;trace.push(this.state.item[symbol],this.state.item.value);",
		expected: ['rhs', 'key', 2, 2, 4]
	},
	{
		name: 'primitive receiver failure keeps get and put coercion order',
		setup: 'this.state.item=1 as unknown as {value:number};',
		type: '{value:number}',
		body: "const key={ [Symbol.toPrimitive](){trace.push('key');return 'value';}} as unknown as 'value';try{this.state.item[key]+=(trace.push('rhs'),2);}catch{trace.push('caught');}",
		expected: ['key', 'rhs', 'key', 'caught']
	},
	{
		name: 'computed keys after earlier receiver getters',
		setup:
			"const key=()=>{trace.push('key');return 'value' as const;};this.state.item={get child(){trace.push('receiver');return {value:0};}};",
		type: '{child:{value:number}}',
		body: "this.state.item.child[key()]=(trace.push('rhs'),2);",
		expected: ['receiver', 'key', 'rhs']
	},
	{
		name: 'native compound key conversion order',
		setup: 'this.state.item={child:{value:1}};',
		type: '{child:{value:number}}',
		body: "const key={ [Symbol.toPrimitive](){trace.push('key');return 'value';}} as unknown as 'value';const result=(this.state.item.child[key]+=(trace.push('rhs'),2));trace.push(result);",
		expected: ['key', 'rhs', 'key', 3]
	},
	{
		name: 'await retains selected receiver after parent replacement',
		setup: 'this.state.item={child:{value:1}};',
		type: '{child:{value:number}}',
		body: 'const old=this.state.item.child;this.state.item.child.value=await Promise.resolve().then(()=>{this.state.item={child:{value:7}};return 2;});trace.push(old.value,this.state.item.child.value);',
		expected: [2, 7]
	},
	{
		name: 'receiver failure precedes awaited RHS',
		setup:
			"this.state.item={get child():{value:number}{if(active){trace.push('receiver');throw new Error('stop');}return {value:0};}};",
		type: '{child:{value:number}}',
		body: "try{this.state.item.child.value=await Promise.resolve((trace.push('rhs'),2));}catch{trace.push('caught');}",
		expected: ['receiver', 'caught']
	},
	{
		name: 'postfix coercion result and prefix result',
		setup:
			"this.state.item={value:{valueOf(){trace.push('coerce');return 1;}} as unknown as number};",
		type: '{value:number}',
		body: 'trace.push(this.state.item.value++,++this.state.item.value,this.state.item.value);',
		expected: ['coerce', 1, 3, 3]
	}
];
for (const example of referenceCases)
	it(`preserves selected state write reference: ${example.name}`, async () => {
		const native = await stateWriteArtifact(
			`export async function run(){const trace:unknown[]=[];let active=false;
return (async function(this:{state:{item:${example.type}}}){${example.setup}trace.push('begin');active=true;${example.body}active=false;trace.push('end');return trace;}).call({state:{}} as {state:{item:${example.type}}});}`,
			'native'
		);
		expect(operationTrace(await (native.run as () => Promise<unknown>)())).toEqual(
			example.expected
		);
		const { compiled } =
			await clientArtifact(`import {TaskContext,type Component} from '@exactjs/core';export const trace:unknown[]=[];let active=false;
export function Page(this:Component<{item:${example.type}}>){${example.setup}
 ${'ordinary' in example ? 'const run=async ()=>' : `async function run(task:TaskContext=TaskContext.client().latest()${'policy' in example ? example.policy : ''})`}{trace.push('begin');active=true;${example.body}active=false;trace.push('end');};
 return()=> <button onClick={()=>run()}>ready</button>;}`);
		expect(operationTrace(compiled.trace)).toEqual(example.expected);
	});
// Construction may reenter before the selected write commits. Definition-time names
// must use their surrounding scope even when the method is never invoked.
const evaluationScopeCases = [
	{
		name: 'field nested computed object name retains alias',
		body: "const owner=this;const old=this.state.item;let level=0;class Assign{value={[(owner.state.item.value=++level===1?(owner.state.item={value:10},new Assign(),1):2,'run' as const)](){return 9;}};}new Assign();trace.push(old.value,this.state.item.value);",
		expected: [1, 2]
	},
	{
		name: 'field nested object name retains class receiver',
		body: "const owner=this;class Assign{state={item:{value:20}};value={[(this.state.item.value+=1,'run' as const)](){return 9;}};}trace.push(new Assign().state.item.value,owner.state.item.value);",
		expected: [21, 0]
	},
	{
		name: 'renamed component alias in constructor',
		body: 'const component=this;const owner=component;class Assign{constructor(){owner.state.item.value+=2;trace.push(owner.state.item.value);}}new Assign();trace.push(this.state.item.value);',
		expected: [2, 2]
	},
	{
		name: 'renamed state alias in logical field',
		body: 'const facade=this.state;const owner=facade;class Assign{value=(owner.item.value ||=3);}trace.push(new Assign().value,owner.item.value);',
		expected: [3, 3]
	},
	{
		name: 'lexical alias across ordinary function receiver',
		body: 'const owner=this;function assign(this:{state:{item:{value:number}}}){owner.state.item.value=4;this.state.item.value+=1;trace.push(owner.state.item.value,this.state.item.value);}assign.call({state:{item:{value:40}}});trace.push(this.state.item.value);',
		expected: [4, 41, 4]
	},
	{
		name: 'class own state and shadowed alias',
		body: 'const owner=this;class Assign{state={item:{value:20}};constructor(){const owner=this;owner.state.item.value+=1;trace.push(owner.state.item.value);}value=owner.state.item.value+=2;}new Assign();trace.push(owner.state.item.value);',
		expected: [21, 2]
	},
	{
		name: 'readonly view retains writable nested alias',
		body: 'const owner=this;const view:Readonly<{item:{value:number}}>=owner.state;class Assign{value=(view.item.value+=2);}trace.push(new Assign().value,owner.state.item.value);',
		expected: [2, 2]
	},
	{
		name: 'alias delete in static field',
		body: 'const owner=this;owner.state.item.optional=3;class Assign{static value=delete owner.state.item.optional;}trace.push(Assign.value,owner.state.item.optional,owner.state.item.value);',
		expected: [true, undefined, 0]
	},
	{
		name: 'constructor body',
		body: 'const owner=this;const old=this.state.item;let level=0;class Assign{constructor(){owner.state.item.value=++level===1?(owner.state.item={value:10},new Assign(),1):2;}}new Assign();trace.push(old.value,this.state.item.value);',
		expected: [1, 2]
	},
	{
		name: 'instance field',
		body: 'const owner=this;const old=this.state.item;let level=0;class Assign{value:number=(owner.state.item.value=++level===1?(owner.state.item={value:10},new Assign(),1):2);}new Assign();trace.push(old.value,this.state.item.value);',
		expected: [1, 2]
	},
	{
		name: 'constructor default',
		body: 'const owner=this;const old=this.state.item;let level=0;class Assign{constructor(value:number=(owner.state.item.value=++level===1?(owner.state.item={value:10},new Assign(),1):2)){trace.push(value);}}new Assign();trace.push(old.value,this.state.item.value);',
		expected: [2, 1, 1, 2]
	},
	{
		name: 'static field reentry',
		body: 'const owner=this;const old=this.state.item;let level=0;function define():void{class Assign{static value:number=(owner.state.item.value=++level===1?(owner.state.item={value:10},define(),1):2);}void Assign;}define();trace.push(old.value,this.state.item.value);',
		expected: [1, 2]
	},
	{
		name: 'static block reentry',
		body: 'const owner=this;const old=this.state.item;let level=0;function define():void{class Assign{static{owner.state.item.value=++level===1?(owner.state.item={value:10},define(),1):2;}}void Assign;}define();trace.push(old.value,this.state.item.value);',
		expected: [1, 2]
	},
	{
		name: 'derived private field preserves super and this',
		body: 'const owner=this;class Base{get value(){return 3;}}class Assign extends Base{#value=(owner.state.item.value=super.value);copy=this.#value;constructor(){trace.push("before");super();trace.push("after",this.copy);}}new Assign();trace.push(owner.state.item.value);',
		expected: ['before', 'after', 3, 3]
	},
	{
		name: 'object computed method name',
		body: "const owner=this;const calls={[(owner.state.item.value+=1,'run' as const)](){return 9;}};trace.push(calls.run(),owner.state.item.value);",
		expected: [9, 1]
	},
	{
		name: 'class computed method name',
		body: "const owner=this;class Calls{[(owner.state.item.value+=1,'run' as const)](){return 9;}}trace.push(owner.state.item.value);void Calls;",
		expected: [1]
	},
	{
		name: 'computed accessor names',
		body: "const owner=this;const calls={get [(owner.state.item.value+=1,'value' as const)](){return 9;},set [(owner.state.item.value+=1,'value' as const)](value:number){trace.push(value);}};Reflect.set(calls,'value',4);trace.push(Reflect.get(calls,'value'),owner.state.item.value);",
		expected: [4, 9, 2]
	}
];
for (const example of evaluationScopeCases)
	for (const ordinary of [false, true])
		it(`preserves ${ordinary ? 'ordinary' : 'task'} evaluation scope: ${example.name}`, async () => {
			const native = await stateWriteArtifact(
				`export function run(){const trace:unknown[]=[];return (function(this:{state:{item:{value:number;optional?:number}}}){${example.body}return trace;}).call({state:{item:{value:0}}});}`,
				'native'
			);
			expect((native.run as () => unknown)()).toEqual(example.expected);
			const declaration = ordinary
				? 'const run=()=>'
				: 'function run(task:TaskContext=TaskContext.client().latest())';
			const { compiled } =
				await clientArtifact(`import {TaskContext,type Component} from '@exactjs/core';export const trace:unknown[]=[];
export function Page(this:Component<{item:{value:number;optional?:number}}>){this.state.item={value:0};${declaration}{${example.body}};return()=> <button onClick={()=>run()}>ready</button>;}`);
			expect(compiled.trace).toEqual(example.expected);
		});

/** Assignment values and commits follow ordinary JavaScript through the mounted compiler owner. */
it('preserves chained assignment values and inner-before-outer commits', async () => {
	const events: ExactRuntimeInspectionEvent[] = [];
	const inspection = createExactRuntimeInspectionOwner({
		buildKey: 'assignment-order',
		executionRoot: 'page'
	});
	let mounted = false;
	inspection.attach('chain', {
		publish(event) {
			if (event.kind === 'component.mount') mounted = true;
			if (mounted && event.kind === 'state.change') events.push(event);
		}
	});
	onTestFinished(() => inspection.detach());
	const { compiled } = await clientArtifact(
		`import {type Component} from '@exactjs/core';
export const values:number[][]=[];
export const calls:string[]=[];
function calculate(){calls.push('calculate');return 7;}
function consume(value:number){calls.push('consume');values.push([value]);return value;}
export function Page(this:Component<{a:number;b:number}>){
 this.state.a=0;this.state.b=0;
 let local=1;
 return()=> <button onClick={()=>{
  const consumed=consume(this.state.a=this.state.b=local=calculate());
  values.push([local,this.state.a,this.state.b,consumed]);
 }}>ready</button>;
}`,
		inspection
	);
	expect(compiled.calls).toEqual(['calculate', 'consume']);
	expect(compiled.values).toEqual([[7], [7, 7, 7, 7]]);
	expect(events.map((event) => event.path)).toEqual(['state.b', 'state.a']);
	expect(events[0]!.id).toEqual(events[1]!.id);
});
