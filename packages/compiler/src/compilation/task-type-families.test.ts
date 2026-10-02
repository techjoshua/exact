import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';

const cases = [
	[
		'conditional',
		'type Input<T>=T extends string?string:number;',
		'input:Input<string>',
		'this.state.text=props.input;',
		'this.state.value=props.input;',
		'TS2322'
	],
	[
		'mapped',
		'type Input={readonly [K in "value"]:number};',
		'input:Input',
		'this.state.value=props.input.value;',
		'props.input.value=2;this.state.value=props.input.value;',
		'TS2540'
	],
	[
		'template',
		'type Input=`item:${number}`;',
		'input:Input',
		'const item:`item:${number}`=props.input;this.state.text=item;',
		"const item:'wrong'=props.input;this.state.text=item;",
		'TS2322'
	],
	[
		'dependent',
		'',
		'select:<T>(value:T,callback:(value:T)=>string)=>string',
		'this.state.text=props.select(42,value=>value.toFixed());',
		'this.state.text=props.select(42,value=>value.toUpperCase());',
		'TS2339'
	],
	[
		'intersection',
		'',
		'fn:((value:string)=>string)&((value:number)=>number)',
		"this.state.text=props.fn('ok');",
		'this.state.text=props.fn(42);',
		'TS2322'
	],
	[
		'ambient',
		'declare global{interface GlobalCallable{(value:string):number}}',
		'fn:GlobalCallable',
		"this.state.value=props.fn('ok');",
		'this.state.value=props.fn(42);',
		'TS2345'
	],
	[
		'assertion',
		'',
		'input:unknown',
		'this.state.text=props.input as string;',
		'this.state.text=props.input as number;',
		'TS2322'
	],
	[
		'satisfies',
		'',
		'input:string|number',
		"if(typeof props.input==='string'){const item=props.input satisfies string;this.state.text=item;}",
		'const item=props.input satisfies string;this.state.text=String(item);',
		'TS1360'
	],
	[
		'assignment-result',
		'',
		'input:number',
		'const result=(this.state.value=props.input);this.state.value=result;',
		'const result=(this.state.value=props.input);this.state.text=result;',
		'TS2322'
	]
] as const;

for (const target of ['default', 'client', 'server'] as const)
	for (const [name, declarations, props, validBody, invalidBody, code] of cases)
		it(`retains ${name} type obligations through task transformation (${target})`, () => {
			const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
			onTestFinished(() => compiler.dispose());
			const compile = (body: string) =>
				compiler.request({
					kind: target === 'default' ? 'check' : 'compile',
					root: process.cwd(),
					target,
					id: path.resolve('.tmp/task-type-families.ts'),
					diagnostics: 'semantic',
					source: `import {TaskContext,type Component} from '@exactjs/core';${declarations}
export function Work(this:Component<{value:number;text:string}>,props:{${props}}){
 this.state.value=0;this.state.text='';
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
