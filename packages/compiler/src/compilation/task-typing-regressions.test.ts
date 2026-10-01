import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';

it('preserves authored assignment context and collection result types in every target', async () => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	const forms = {
		'collection-callback-conditional':
			'this.state.values.sort(this.state.count===0?(left,right)=>left-right:(left,right)=>right-left);',
		'collection-callback-function':
			'this.state.values.sort(function(left,right){return left-right;});',
		'callback-context-conditional':
			'this.state.mapper=this.state.count===0?value=>value+1:value=>value-1;',
		'callback-context-function': 'this.state.mapper=function(value){return value+1;};',

		'callback-context-unconsumed': 'this.state.mapper=value=>value+1;',

		'empty-array-local-type': 'this.state.values=[];const alias=this.state.values;alias.push(9);',
		'pure-function-receiver':
			'function read(this:{count:number}){return this.count;}const result=read.call({count:9});this.state.count=result;',
		'object-method-receiver':
			'const reader={count:9,read(){return this.count}};this.state.count=reader.read();',
		'native-map-result':
			'const result:Map<string,number>=this.state.lookup.set("x",9);this.state.count=result.get("x")??0;',
		'native-set-result':
			'const result:Set<number>=this.state.members.add(9);this.state.count=Number(result.has(9));',
		'callback-context':
			'this.state.mapper=value=>value+1;const mapper=this.state.mapper;this.state.count=mapper(8);'
	};

	(forms as Record<string, string>)['invalid conditional comparator'] =
		'this.state.values.sort(this.state.count===0?(left,right)=>"bad":(left,right)=>right-left);';
	(forms as Record<string, string>)['invalid callback return'] = 'this.state.mapper=value=>"bad";';
	(forms as Record<string, string>)['invalid map argument'] = 'this.state.lookup.set("x","bad");';
	for (const [name, work] of Object.entries(forms))
		for (const target of ['default', 'client', 'server'] as const) {
			const source = `import {TaskContext,type Component} from '@exactjs/core'; export function Probe(this:Component<{count:number;key:string;values:number[];lookup:Map<string,number>;members:Set<number>;mapper:(value:number)=>number;nested:{count:number}}>){this.state.count=0;this.state.values=[];this.state.lookup=new Map();this.state.members=new Set();this.state.mapper=value=>value;this.state.key='';this.state.nested={count:0};const run=(task:TaskContext=TaskContext.${target === 'server' ? 'server' : 'client'}().latest().blocking())=>{${work}};return ()=> <button onClick={()=>run()}>{this.state.count}</button>;}`;
			const response = compiler.request({
				kind: target === 'default' ? 'check' : 'compile',
				target,
				id: path.resolve(
					'.tmp/task-typing-regressions/' + name.replaceAll(' ', '-') + '/' + target + '.tsx'
				),
				source,
				root: process.cwd(),
				diagnostics: 'semantic'
			});
			expect(response.error).toBeUndefined();
			if (name.startsWith('invalid ')) {
				expect(
					response.diagnostics.some(
						(d) => d.code === (name.includes('callback') ? 'TS2322' : 'TS2345')
					)
				).toBe(true);
			} else {
				expect(response.diagnostics).toEqual([]);
			}
		}
}, 30_000);

it('retains callback context when server compilation extracts an interactive island', async () => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	const source = `import {type Component} from '@exactjs/core';
export function Probe(this:Component<{values:number[];count:number}>){
 this.state.values=[2,1];this.state.count=0;
 return ()=> <button onClick={()=>{
  this.state.values.sort(this.state.count===0?(left,right)=>left-right:(left,right)=>right-left);
  this.state.count++;
 }}>{this.state.values.join(',')}</button>;
}
/** @exact server */
export function Page(){return ()=> <Probe/>;}`;
	for (const target of ['client', 'server'] as const) {
		const response = compiler.request({
			kind: 'compile',
			target,
			serverComponents: true,
			id: path.resolve('.tmp/task-typing-regressions/island/' + target + '.tsx'),
			source,
			root: process.cwd(),
			diagnostics: 'semantic'
		});
		expect(response.error).toBeUndefined();
		expect(response.diagnostics).toEqual([]);
	}
}, 30_000);

it('preserves component generic parameters in copied continuation executors', async () => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	for (const parameters of [
		'Value',
		'Value extends string = string',
		'First, Value extends First = First'
	])
		for (const invalid of [false, true])
			for (const target of ['default', 'client', 'server'] as const) {
				const source = `import {TaskContext,type Component} from '@exactjs/core';
export function Probe<${parameters}>(this:Component<{mapper:(value:Value)=>Value;count:number}>,props:{value:Value}){
 this.state.mapper=value=>value;this.state.count=0;
 const run=(task:TaskContext=TaskContext.${target === 'server' ? 'server' : 'client'}().latest().blocking())=>{
  this.state.mapper=this.state.count===0?value=>${invalid ? "'bad'" : 'value'}:value=>value;
  this.state.count=String(this.state.mapper(props.value)).length;
 };return ()=> <button onClick={()=>run()}>{this.state.count}</button>;
}`;
				const response = compiler.request({
					kind: target === 'default' ? 'check' : 'compile',
					target,
					id: path.resolve(
						'.tmp/task-typing-regressions/generic/' +
							encodeURIComponent(parameters) +
							'/' +
							invalid +
							'/' +
							target +
							'.tsx'
					),
					source,
					root: process.cwd(),
					diagnostics: 'semantic'
				});
				expect(response.error).toBeUndefined();
				expect(response.diagnostics.some((d) => d.code === 'TS2304')).toBe(false);
				if (invalid) expect(response.diagnostics.some((d) => d.code === 'TS2322')).toBe(true);
				else expect(response.diagnostics).toEqual([]);
			}
}, 30_000);

it('recognizes renamed and namespace task providers while rejecting local shadows', () => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	const forms = [
		{ name: 'renamed', imports: 'TaskContext as Context', provider: 'Context', type: 'Context' },
		{
			name: 'namespace',
			imports: '* as Core',
			provider: 'Core.TaskContext',
			type: 'Core.TaskContext'
		},
		{
			name: 'parenthesized',
			imports: 'TaskContext as Context',
			provider: '(Context)',
			type: 'Context'
		},
		{ name: 'inferred', imports: 'TaskContext as Context', provider: 'Context', type: undefined },
		{
			name: 'type-alias',
			imports: 'TaskContext as Context',
			provider: 'Context',
			type: 'Policy',
			declaration: 'type Policy=Context;'
		},
		{
			name: 'shadow',
			imports: 'TaskContext as Context, TaskContext as Provider',
			provider: 'Context',
			type: 'Context',
			setup: 'const Context={client:()=>Provider.client(),server:()=>Provider.server()};',
			invalid: true
		}
	];
	for (const form of forms)
		for (const target of ['default', 'client', 'server'] as const) {
			const placement = target === 'server' ? 'server' : 'client';
			const imports =
				form.name === 'namespace'
					? "import * as Core from '@exactjs/core';import type {Component} from '@exactjs/core';"
					: `import {${form.imports},type Component} from '@exactjs/core';`;
			const result = compiler.request({
				kind: target === 'default' ? 'check' : 'compile',
				target,
				root: process.cwd(),
				id: path.resolve(
					'.tmp/task-typing-regressions/provider-' + form.name + '/' + target + '.tsx'
				),
				diagnostics: 'semantic',
				source: `${imports}${form.declaration ?? ''}export function Probe(this:Component<{count:number}>){this.state.count=0;${form.setup ?? ''}const run=async(task${form.type ? ':' + form.type : ''}=${form.provider}.${placement}().latest().blocking())=>{this.state.count=await Promise.resolve(9);};${target === 'server' ? 'void run();' : ''}return ()=> <button onClick={()=>run()}>{this.state.count}</button>;}`
			});
			expect(result.error).toBeUndefined();
			if (form.invalid)
				expect(
					result.diagnostics.some((d) => d.message.includes('task policy must be rooted'))
				).toBe(true);
			else {
				expect(result.diagnostics).toEqual([]);
				if (target === 'client') expect(result.code).toContain('defineTask');
			}
		}
});
