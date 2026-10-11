import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';

const cases = {
	union: {
		valid:
			"if(typeof props.choice==='number')this.state.value=props.choice;else this.state.text=props.choice;",
		invalid: 'this.state.value=props.choice;',
		code: 'TS2322'
	},
	callback: {
		valid: "this.state.text=props.callback('ok');",
		invalid: 'this.state.text=props.callback(42);',
		code: 'TS2345'
	},
	contextual: {
		valid: 'this.state.text=props.consume(value=>value.toUpperCase());',
		invalid: 'this.state.text=props.consume(value=>value.toFixed());',
		code: 'TS2551'
	},
	nullable: {
		valid: 'if(props.maybe!==null)this.state.text=props.maybe.toUpperCase();',
		invalid: 'this.state.text=props.maybe.toUpperCase();',
		code: 'TS18047'
	},
	readonlyAlias: {
		valid: 'const alias=props.item;this.state.value=alias.value;',
		invalid: 'const alias=props.item;alias.value++;',
		code: 'TS2540'
	},
	mutableAlias: {
		// Native TypeScript permits assigning a readonly object to a mutable object type.
		valid: 'const alias:{value:number}=props.item;alias.value++;',
		invalid: 'const alias:{readonly value:number}=props.item;alias.value++;',
		code: 'TS2540'
	},
	shallowReadonly: {
		valid: 'props.shallow.nested.value++;',
		invalid: 'props.shallow.nested={value:2};',
		code: 'TS2540'
	},
	readonlyArray: {
		valid: 'const copy=[...props.rows];copy.push(2);',
		invalid: 'props.rows.push(2);',
		code: 'TS2339'
	},
	mutableHelperParameter: {
		valid: 'props.mutate(props.item);',
		invalid: 'props.mutate({value:"bad"});',
		code: 'TS2322'
	},
	readonly: {
		valid: 'this.state.value=props.item.value;',
		invalid: 'props.item.value=2;this.state.value=props.item.value;',
		code: 'TS2540'
	}
};

for (const target of ['default', 'client', 'server'] as const)
	for (const [name, contract] of Object.entries(cases))
		it(`preserves captured ${name} type obligations in tasks (${target})`, () => {
			const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
			onTestFinished(() => compiler.dispose());
			const compile = (body: string) =>
				compiler.request({
					kind: target === 'default' ? 'check' : 'compile',
					root: process.cwd(),
					id: path.resolve('.tmp/task-capture-types.ts'),
					target,
					diagnostics: 'semantic',
					source: `import {TaskContext,type Component} from '@exactjs/core';
export function Work(this:Component<{value:number;text:string}>,props:{choice:string|number;callback:(value:string)=>string;consume:(callback:(value:string)=>string)=>string;maybe:string|null;item:Readonly<{value:number}>;shallow:Readonly<{nested:{value:number}}>;rows:readonly number[];mutate:(value:{value:number})=>void}){
 this.state.value=0;this.state.text='';
 function load(task:TaskContext=TaskContext.client().blocking()){${body}}
 load();return()=>this.state.text;
}`
				});
			const valid = compile(contract.valid);
			expect(valid.error).toBeUndefined();
			expect(valid.diagnostics).toEqual([]);
			// Capturing a value must not erase the constraints on its uses.
			const invalid = compile(contract.invalid);
			expect(invalid.diagnostics?.some((diagnostic) => diagnostic.code === contract.code)).toBe(
				true
			);
		});
