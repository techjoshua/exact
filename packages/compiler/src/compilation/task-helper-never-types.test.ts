import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';

const definitions = {
	direct: 'function fail():never{throw new Error("stop");}',
	arrow: 'const fail:()=>never=()=>{throw new Error("stop");};',
	generic: 'function fail<T>(value:T):never{throw new Error(String(value));}'
};

for (const target of ['default', 'client', 'server'] as const)
	for (const [name, definition] of Object.entries(definitions))
		it(`retains ${name} never-returning helper control flow (${target})`, () => {
			const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
			onTestFinished(() => compiler.dispose());
			const call = name === 'generic' ? 'fail(value);' : 'fail();';
			const compile = (declaration: string) =>
				compiler.request({
					kind: target === 'default' ? 'check' : 'compile',
					target,
					root: process.cwd(),
					id: path.resolve('.tmp/task-helper-never.ts'),
					diagnostics: 'semantic',
					source: `import {TaskContext,type Component} from '@exactjs/core';${declaration}
export function Work(this:Component<{text:string}>,props:{value:string|number}){this.state.text='';function load(task:TaskContext=TaskContext.client().blocking()){const value=props.value;if(typeof value==='number')${call}this.state.text=value;}load();return()=>this.state.text;}`
				});
			const accepted = compile(definition);
			expect(accepted.error).toBeUndefined();
			expect(accepted.diagnostics).toEqual([]);
			expect(accepted.analysis?.components[0].placement).toBe('isomorphic');
			const rejected = compile(definition.replace('never', 'void'));
			expect(rejected.diagnostics?.some((diagnostic) => diagnostic.code === 'TS2322')).toBe(true);
		});
