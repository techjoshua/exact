import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';

for (const target of ['client', 'server'] as const)
	it(`retains native fetch input and response types through task lowering (${target})`, () => {
		const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => compiler.dispose());
		const source = `import {TaskContext,type Component} from '@exactjs/core';
export function Work(this:Component<{text:string}>){this.state.text='';
async function load(task:TaskContext=TaskContext.server().blocking()){
 const response=await fetch('https://example.invalid');this.state.text=await response.text();
}load();return()=>this.state.text;}`;
		const compile = (source: string) =>
			compiler.request({
				kind: 'compile',
				root: process.cwd(),
				id: path.resolve('.tmp/fetch-contract.ts'),
				target,
				diagnostics: 'semantic',
				source
			});
		const valid = compile(source);
		expect(valid.error).toBeUndefined();
		expect(valid.diagnostics).toEqual([]);
		const invalid = compile(source.replace("fetch('https://example.invalid')", 'fetch(42)'));
		expect(invalid.diagnostics?.some((diagnostic) => diagnostic.code === 'TS2345')).toBe(true);
		const invalidResult = compile(
			source.replace('this.state.text=await response.text()', 'this.state.text=response.status')
		);
		expect(invalidResult.diagnostics?.some((diagnostic) => diagnostic.code === 'TS2322')).toBe(
			true
		);
	});
