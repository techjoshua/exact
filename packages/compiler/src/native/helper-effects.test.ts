import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from './process.js';
import { resolveNativeCompilerExecutable } from './executable.js';

it.each([
	{
		name: 'branching recursive helper',
		helper: `type Tree = {value:string;left?:Tree;right?:Tree}; function mutate(state:Tree){state.value='changed';if(state.left)mutate(state.left);if(state.right)mutate(state.right);}`,
		call: `mutate(this.state.values)`,
		state: `values:Tree`
	},
	{
		name: 'literal dotted helper path',
		helper: `function mutate(state:Record<string,string>){state['nested.key']='changed';}`,
		call: `mutate(this.state.values)`
	},
	{
		name: 'dynamic helper path',
		helper: `function mutate(state:Record<string,string>,key:string){state[key]='changed';}`,
		call: `mutate(this.state.values,key)`
	},
	{
		name: 'helper collection mutation',
		helper: `function mutate(state:{lookup:Map<string,string>}){state.lookup.set('key','changed');}`,
		call: `mutate(this.state)`,
		state: `lookup:Map<string,string>;values:Record<string,string>`
	},
	{
		name: 'opaque helper',
		helper: `import {mutate} from 'unavailable-state-writer';`,
		call: `mutate(this.state.values)`
	}
])('rejects remote publication through a $name', ({ name, helper, call, state }) => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	const response = compiler.request({
		kind: 'compile',
		id: path.resolve('.tmp/helper-effect-' + name.replaceAll(' ', '-') + '.tsx'),
		root: process.cwd(),
		target: 'server',
		diagnostics: 'syntax',
		source: `import {TaskContext,type Component} from '@exactjs/core'; ${helper}
    export function Page(this:Component<{${state ?? 'values:Record<string,string>'}}>){this.state.values={value:'initial'};const run=(key:string,task:TaskContext=TaskContext.server())=>{${call};};return ()=> <button onClick={()=>void run('value')}>{this.state.values.value}</button>;}`
	});
	expect(response.error).toBeUndefined();
	expect(
		response.diagnostics.some(
			(diagnostic) => diagnostic.severity === 'error' && diagnostic.code === 'EXACT2001'
		)
	).toBe(true);
});

it('does not grant object mutation effects to scalar arguments of opaque calls', () => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	const response = compiler.request({
		kind: 'compile',
		id: path.resolve('.tmp/helper-scalar.tsx'),
		root: process.cwd(),
		target: 'server',
		diagnostics: 'syntax',
		source: `import {TaskContext,type Component} from '@exactjs/core'; import {format} from 'unavailable-formatter';
    export function Page(this:Component<{value:string}>){this.state.value='initial';const run=(task:TaskContext=TaskContext.server())=>{this.state.value=format(this.state.value)};return ()=> <button onClick={()=>void run()}>{this.state.value}</button>;}`
	});
	expect(response.error).toBeUndefined();
	expect(response.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
});
