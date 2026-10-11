import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';

const cases = {
	argument: { valid: "props.callback('ok');", invalid: 'props.callback(42);', code: 'TS2345' },
	context: {
		valid: 'props.consume(value=>value.toUpperCase());',
		invalid: 'props.consume(value=>value.toFixed());',
		code: 'TS2551'
	},
	generic: {
		valid: "props.select({kind:'good'});",
		invalid: "props.select({kind:'bad'});",
		code: 'TS2322'
	},
	genericContext: {
		valid: 'props.genericConsume(value=>value.value.toUpperCase());',
		invalid: 'props.genericConsume(value=>value.value.toFixed());',
		code: 'TS2551'
	},
	promiseContext: {
		valid: 'void props.asyncConsume(value=>value.toUpperCase());',
		invalid: 'void props.asyncConsume(value=>value.toFixed());',
		code: 'TS2551'
	},
	aliasContext: {
		valid: 'props.aliasConsume(value=>value.value.toUpperCase());',
		invalid: 'props.aliasConsume(value=>value.value.toFixed());',
		code: 'TS2551'
	},
	recursiveContext: {
		valid: 'props.recursiveConsume(next=>next(child=>child(()=>{})));',
		invalid: 'props.recursiveConsume(next=>next(42));',
		code: 'TS2345'
	},
	untypedControl: {
		valid: 'const callback=(value:string)=>value;props.consume(callback);',
		invalid: 'const callback=value=>value;props.consume(callback);',
		code: 'TS7006'
	}
};

for (const target of ['client', 'server'] as const)
	for (const [name, contract] of Object.entries(cases))
		it(`checks ${name} constraints in tasks without state mutations (${target})`, () => {
			const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
			onTestFinished(() => compiler.dispose());
			const compile = (body: string, checking = false) =>
				compiler.request({
					kind: checking ? 'check' : 'compile',
					root: process.cwd(),
					id: path.resolve('.tmp/task-nonmutating-types.ts'),
					target: checking ? 'default' : target,
					diagnostics: 'semantic',
					source: `import {TaskContext,type Component} from '@exactjs/core';
type Input={value:string};type Callback=(value:Input)=>string;type RecursiveCallback=(callback:RecursiveCallback)=>void;
export function Work(this:Component<{}>,props:{callback:(value:string)=>string;consume:(callback:(value:string)=>string)=>string;select:<T extends {kind:'good'}>(value:T)=>T;genericConsume:<T extends {value:string}>(callback:(value:T)=>string)=>string;asyncConsume:(callback:(value:string)=>string)=>Promise<string>;aliasConsume:(callback:Callback)=>string;recursiveConsume:(callback:RecursiveCallback)=>void}){
 function load(task:TaskContext=TaskContext.client().blocking()){${body}}
 load();return()=>null;
}`
				});
			for (const checking of [true, false]) {
				const valid = compile(contract.valid, checking);
				expect(valid.error).toBeUndefined();
				expect(valid.diagnostics).toEqual([]);
				const invalid = compile(contract.invalid, checking);
				expect(invalid.diagnostics?.some((diagnostic) => diagnostic.code === contract.code)).toBe(
					true
				);
			}
		});
