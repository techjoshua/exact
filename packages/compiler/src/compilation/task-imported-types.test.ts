import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';

const declarations = `
export interface Owner { value:string }
export type Input<T> = T extends string ? {readonly value:T} : never;
export type Select = <T extends Owner>(owner:T,callback:(owner:T)=>string)=>string;
export function select<T extends Owner>(owner:T,callback:(owner:T)=>string){return callback(owner);}
export function make<T extends Owner>(owner:T){return (callback:(owner:T)=>string)=>callback(owner);}
export function overloaded(value:string):string;
export function overloaded(value:number):number;
export function overloaded(value:string|number){return value;}
`;

const cases = [
	[
		'generic helper',
		'this.state.text=select(props.input,item=>item.value.toUpperCase());',
		'this.state.text=select(props.input,item=>item.value.toFixed());',
		'TS2551'
	],
	[
		'escaped generic helper',
		'const work=make(props.input);this.state.text=work(item=>item.value.toUpperCase());',
		'const work=make(props.input);this.state.text=work(item=>item.value.toFixed());',
		'TS2551'
	],
	[
		'captured generic callable',
		'this.state.text=props.select(props.input,item=>item.value.toUpperCase());',
		'this.state.text=props.select(props.input,item=>item.value.toFixed());',
		'TS2551'
	],
	['overload', "this.state.text=overloaded('ok');", 'this.state.text=overloaded(42);', 'TS2322'],
	[
		'imported assertion',
		'this.state.text=(props.unknown as Owner).value;',
		'this.state.text=(props.unknown as {value:number}).value;',
		'TS2322'
	],
	[
		'imported satisfies',
		'const item=props.input satisfies Owner;this.state.text=item.value;',
		'const item=props.input satisfies {value:number};this.state.text=String(item.value);',
		'TS1360'
	],
	[
		'imported readonly',
		'this.state.text=props.input.value;',
		"props.input.value='changed';this.state.text=props.input.value;",
		'TS2540'
	]
] as const;

for (const target of ['default', 'client', 'server'] as const)
	for (const [name, validBody, invalidBody, code] of cases)
		it(`preserves ${name} obligations across imported task boundaries (${target})`, async () => {
			const root = await createTestWorkspace('.exact-imported-types-', path.resolve('.tmp'));
			await writeTestFiles(root, {
				'tsconfig.json': JSON.stringify({
					compilerOptions: {
						strict: true,
						target: 'ESNext',
						module: 'NodeNext',
						moduleResolution: 'NodeNext'
					},
					include: ['*.ts']
				}),
				'helpers.ts': declarations
			});
			const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
			onTestFinished(() => compiler.dispose());
			const compile = (body: string) =>
				compiler.request({
					kind: target === 'default' ? 'check' : 'compile',
					root,
					target,
					id: path.join(root, 'work.ts'),
					diagnostics: 'semantic',
					source: `import {TaskContext,type Component} from '@exactjs/core';
import {select,make,overloaded,type Owner,type Input,type Select} from './helpers.js';
export function Work(this:Component<{text:string}>,props:{input:Input<string>;select:Select;unknown:unknown}){
this.state.text='';
function load(task:TaskContext=TaskContext.client().blocking()){${body}}
load();return()=>this.state.text;
}`
				});
			const valid = compile(validBody);
			expect(valid.error).toBeUndefined();
			expect(valid.diagnostics).toEqual([]);
			expect(valid.analysis?.components[0].placement).toBe('isomorphic');
			const invalid = compile(invalidBody);
			expect(invalid.diagnostics?.some((diagnostic) => diagnostic.code === code)).toBe(true);
		});
