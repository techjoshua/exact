import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';

const cases = {
	method: {
		declaration:
			'function make(owner:{value:number}){const key=String("update");return {[key](value:number){owner.value=value;return value;}};}',
		body: 'const helper=make(this.state);this.state.value=helper.update(INPUT);',
		code: 'TS2345'
	},
	accessor: {
		declaration:
			'function make(owner:{value:number}){const key=String("value");return {get [key](){return owner.value;},set [key](value:number){owner.value=value;}};}',
		body: 'const helper=make(this.state);helper.value=INPUT;',
		code: 'TS2322'
	},
	'unique method': {
		declaration:
			'const key=Symbol("update");function make(owner:{value:number}){const helper:{[key]:(value:number)=>number}={[key](value){owner.value=value;return value;}};return helper;}',
		body: 'const helper=make(this.state);this.state.value=helper[key](INPUT);',
		code: 'TS2345'
	},
	'unique property': {
		declaration:
			'const other=Symbol("other");function make(owner:{value:number}){const key=Symbol("value");const holder:{readonly value:typeof key}={value:key};const selected:typeof key=holder.value;owner.value=selected===key?3:0;return selected;}',
		body: 'const chosen:INPUT=make(this.state);this.state.value=3;',
		code: 'TS2322'
	},
	constructor: {
		declaration: 'class Box{constructor(public value:number){}get count(){return this.value;}}',
		body: 'const helper=new Box(INPUT);this.state.value=helper.count;',
		code: 'TS2345'
	}
};

for (const target of ['default', 'client', 'server'] as const)
	for (const [name, definition] of Object.entries(cases))
		it(`retains ${name} constraints through helper object registration (${target})`, () => {
			const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
			onTestFinished(() => compiler.dispose());
			const compile = (input: string) =>
				compiler.request({
					kind: target === 'default' ? 'check' : 'compile',
					target,
					root: process.cwd(),
					id: path.resolve('.tmp/task-helper-object-types.ts'),
					diagnostics: 'semantic',
					source: `import {TaskContext,type Component} from '@exactjs/core';${definition.declaration}
export function Work(this:Component<{value:number}>){this.state.value=0;
function load(task:TaskContext=TaskContext.client().blocking()){${definition.body.replace('INPUT', input)}}
load();return()=>this.state.value;}`
				});
			const valid = compile(name === 'unique property' ? 'symbol' : '3');
			expect(valid.error).toBeUndefined();
			expect(valid.diagnostics).toEqual([]);
			expect(valid.analysis?.components[0].placement).toBe('isomorphic');
			const invalid = compile(name === 'unique property' ? 'typeof other' : '"bad"');
			expect(invalid.diagnostics?.some((diagnostic) => diagnostic.code === definition.code)).toBe(
				true
			);
		});
