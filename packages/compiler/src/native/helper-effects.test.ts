import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from './process.js';
import { resolveNativeCompilerExecutable } from './executable.js';
import { createBrowserTestWorkspace, writeTestFiles } from '../test-support/workspace.js';

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

it('binds only mutable component and parameter arguments while preserving access paths', () => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	const response = compiler.request({
		kind: 'analyze',
		id: path.resolve('.tmp/helper-receiver-classification.ts'),
		root: process.cwd(),
		diagnostics: 'syntax',
		source: `declare function accept(value: unknown): void;
export function forward(value: {nested:{text:string}}, scalar: string, optional: string | undefined) {
 accept(value); accept(value.nested); accept(value['nested']); accept(value.nested.text);
 accept(scalar); accept(optional); accept({nested:{text:'fresh'}}); accept([1,2]); accept(()=>1);
 const local = {text:'local'}; accept(local);
}
export function owner(this: {state:{nested:{text:string};scalar:string}}) {
 accept(this.state.nested); accept(this.state.scalar);
}`
	});
	expect(response.error).toBeUndefined();
	const bindings = (name: string) =>
		response.analysis.callables
			.find((callable) => callable.name === name)!
			.calls.filter((call) => call.name === 'accept')
			.map((call) =>
				call.receiverBindings?.map((binding) => ({
					source: binding.source,
					path: binding.path ?? []
				}))
			);
	expect(bindings('forward')).toEqual([
		[{ source: 'parameter', path: [] }],
		[{ source: 'parameter', path: ['nested'] }],
		[{ source: 'parameter', path: ['nested'] }],
		...Array.from({ length: 7 }, () => [{ source: 'unknown', path: [] }])
	]);
	expect(bindings('owner')).toEqual([
		[{ source: 'component', path: ['state', 'nested'] }],
		[{ source: 'unknown', path: [] }]
	]);
});

// Await must retain its known donor even when a second operand alternative is opaque.
it('retains browser and unknown Await donors through public task placement', async () => {
	const root = await createBrowserTestWorkspace('.exact-await-consumer-', process.cwd());
	const compiler = new NativeCompilerProcess({
		executable: resolveNativeCompilerExecutable(),
		timeoutMs: 5_000
	});
	onTestFinished(() => compiler.dispose());
	for (const browser of [false, true]) {
		for (const placement of ['server', 'client'] as const) {
			const source = `import {TaskContext} from '@exactjs/core';
const known = { then(resolve: (value: string) => void) { resolve(${browser ? 'window.location.href' : "'safe'"}); } };
export function Page(props: { known: boolean; foreign: unknown }) {
 const run = async (task: TaskContext = TaskContext.${placement}()) => {
  await (props.known ? known : props.foreign);
 };
 return () => <button onClick={() => void run()}>Run</button>;
}
`;
			const files = await writeTestFiles(root, { 'Page.tsx': source });
			const request = { id: files['Page.tsx']!, root, source, diagnostics: 'semantic' as const };
			const analysis = compiler.request({ ...request, kind: 'analyze' });
			expect.soft(analysis.error).toBeUndefined();
			const task = analysis.analysis.tasks[0]!;
			const callable = analysis.analysis.callables.find((value) => value.name === 'run');
			expect.soft(callable).toBeDefined();
			for (const sources of [task.effectSources, callable!.effectSources]) {
				expect.soft(sources).toContainEqual(expect.objectContaining({ environment: 'unknown' }));
				if (browser)
					expect.soft(sources).toContainEqual(expect.objectContaining({ environment: 'browser' }));
				else expect.soft(sources?.some((value) => value.environment === 'browser')).toBe(false);
			}
			const compiled = compiler.request({ ...request, kind: 'compile', target: placement });
			expect.soft(compiled.error).toBeUndefined();
			const errors = compiled.diagnostics.filter((value) => value.severity === 'error');
			if (browser && placement === 'server') {
				expect
					.soft(
						errors.some((value) =>
							value.message.includes(
								'task requests server placement but references browser-only globals'
							)
						)
					)
					.toBe(true);
			} else {
				expect.soft(errors).toEqual([]);
				expect.soft(compiled.code).toBeTruthy();
			}
		}
	}
}, 60_000);

it.each([
	{ target: 'client', browser: true },
	{ target: 'server', browser: true },
	{ target: 'server', browser: false }
] as const)(
	'places an array spread with an iterator getter ($target, browser=$browser)',
	async ({ target, browser }) => {
		const root = await createBrowserTestWorkspace('.exact-iterator-get-', process.cwd());
		const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => compiler.dispose());
		const source = `import {TaskContext,type Component} from '@exactjs/core';
function parseCssColor(value:string) {
 const input={get [Symbol.iterator]() { ${browser ? 'document.title=value;' : ''} return value[Symbol.iterator].bind(value); }};
 return [...input].map(x=>x+x).join('');
}
export function Page(this:Component<{label:string}>,props:{input:string}){
 ${
		target === 'server'
			? 'this.state.label=""; const run=(task:TaskContext=TaskContext.server())=>{this.state.label=parseCssColor(props.input);}; return ()=> <button onClick={()=>run()}>{this.state.label}</button>;'
			: 'this.state.label=parseCssColor(props.input); return ()=> <span>{this.state.label}</span>;'
 }
}`;
		const files = await writeTestFiles(root, { 'Page.tsx': source });
		const result = compiler.request({
			kind: 'compile',
			id: files['Page.tsx']!,
			root,
			source,
			target,
			diagnostics: 'semantic'
		});
		expect(result.error).toBeUndefined();
		const helper = result.analysis.callables.find((callable) => callable.name === 'parseCssColor')!;
		expect(
			helper.effectSources.some((s) => s.environment === 'browser' && s.description === 'document')
		).toBe(browser);
		expect(helper.effectSources.some((s) => s.environment === 'unknown')).toBe(true);
		const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
		if (target === 'server' && browser) {
			expect(errors).toContainEqual(
				expect.objectContaining({
					code: 'EXACT2001',
					message: expect.stringContaining(
						'task requests server placement but references browser-only globals'
					)
				})
			);
			expect(result.code).toBeFalsy();
		} else {
			expect(errors).toEqual([]);
			expect(result.code).toBeTruthy();
			if (target === 'client') expect(result.analysis.components[0]?.placement).toBe('client');
		}
	}
);
