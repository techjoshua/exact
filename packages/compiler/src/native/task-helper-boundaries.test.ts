import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from './process.js';
import { resolveNativeCompilerExecutable } from './executable.js';

const controls = [
	{
		name: 'native identity comparison',
		helper: 'function work(state: State) { return state === original; }',
		call: 'work(this.state)',
		warning: true
	},
	{
		name: 'retained state closure',
		helper: 'function work(state: State) { return () => state.count++; }',
		call: 'work(this.state)',
		warning: true
	},
	{
		name: 'fresh callback input',
		helper: 'function work(_state: State) { return (next: State) => next.count++; }',
		call: 'work(this.state)',
		warning: false
	},
	{
		name: 'retained input plus fresh parameter',
		helper:
			'function work(state: State) { return (next: State) => { state.count++; next.count++; }; }',
		call: 'work(this.state)',
		warning: true
	},
	{
		name: 'acknowledged retained input',
		helper: '/** @exact state-view */ function work(state: State) { return () => state.count++; }',
		call: 'work(this.state)',
		warning: false
	},
	{
		name: 'helper acknowledgment',
		helper: '/** @exact state-view */ function work(state: State) { return state === original; }',
		call: 'work(this.state)',
		warning: false
	},
	{
		name: 'call acknowledgment',
		helper: 'function work(state: State) { return state === original; }',
		call: '/** @exact state-view */ work(this.state)',
		warning: false
	},
	{
		name: 'unrelated body annotation',
		helper: 'function work(state: State) { /** @exact state-view */ return state === original; }',
		call: 'work(this.state)',
		warning: true
	},
	{
		name: 'purity annotation',
		helper: '/** @exact pure */ function work(state: State) { return state === original; }',
		call: 'work(this.state)',
		warning: true
	},
	{
		name: 'explicit storage identity',
		helper: 'function work(state: State) { return sameStateTarget(state, original); }',
		call: 'work(this.state)',
		warning: false
	},
	{
		name: 'ordinary input mutation',
		helper: 'function work(state: State) { return ++state.count; }',
		call: 'work(this.state)',
		warning: false
	},
	{
		name: 'scalar comparison',
		helper: 'function work(count: number) { return count === 0; }',
		call: 'work(this.state.count)',
		warning: false
	}
];

it.each(controls)('checks pending helper limits for $name', ({ name, helper, call, warning }) => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	const response = compiler.request({
		kind: 'compile',
		target: 'client',
		root: process.cwd(),
		id: path.resolve('.tmp/helper-boundary-' + name.replaceAll(' ', '-') + '.tsx'),
		source: `import { TaskContext, type Component } from '@exactjs/core';
import { sameStateTarget } from '@exactjs/reactive';
type State = { count: number }; const original: State = { count: 0 }; ${helper}
export function Page(this: Component<State>) {
 this.state.count = 0;
 const run = (task: TaskContext = TaskContext.client().blocking()) => { ${call}; };
 return () => <button onClick={() => run()}>{this.state.count}</button>;
}`
	});
	expect(response.error).toBeUndefined();
	expect(response.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
	expect(response.diagnostics.some((diagnostic) => diagnostic.code === 'EXACT2231')).toBe(warning);
});

it.each([
	'this.state.counter.read',
	'this.state.counter["read"]',
	'this.state.counter.field',
	'this.state.counter["field"]',
	'service.read',
	'service["read"]',
	'service.field',
	'service["field"]'
])('preserves the class receiver boundary for %s', (receiver) => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	const response = compiler.request({
		kind: 'compile',
		target: 'client',
		root: process.cwd(),
		id: path.resolve('.tmp/helper-class-boundary.tsx'),
		source: `import { TaskContext, type Component } from '@exactjs/core';
class Counter { count = 1; #value = 0; read() { return ++this.#value; } field = () => ++this.#value; } const service = new Counter();
export function Page(this: Component<{ count: number; counter: Counter }>) {
 this.state.count = 0; this.state.counter = new Counter();
 const run = (task: TaskContext = TaskContext.client().blocking()) => {
 this.state.count = this.state.counter.count;
 /** @exact state-view */ this.state.count = ${receiver}();
 };
 return () => <button onClick={() => run()} />;
}`
	});
	expect(response.error).toBeUndefined();
	expect(response.diagnostics.some((diagnostic) => diagnostic.code === 'EXACT2230')).toBe(
		receiver.startsWith('this.state.counter')
	);
	expect(response.code).not.toContain('registerTaskHelper');
});

it('places opaque operation construction and redemption at their actual component calls', () => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	for (const target of ['client', 'server'] as const) {
		for (const [name, body] of [
			['stored', 'issue(browser, {key:"slot"});'],
			['eager-key', 'issue(browser, {get key(){return document.title}});'],
			['redeemed', 'const operation=issue(browser); invoke(operation, {});'],
			['mixed', 'const operation=issue(chooseBrowser ? browser : server); invoke(operation, {});']
		] as const) {
			const result = compiler.request({
				kind: 'compile',
				id: path.resolve(`.tmp/opaque-operation-${target}-${name}.tsx`),
				root: process.cwd(),
				target,
				diagnostics: 'semantic',
				source: `import {TaskContext,type Component} from '@exactjs/core';
					import {createOpaqueOperation as issue,executeOpaqueOperation as invoke} from '@exactjs/core/runtime/component-operations';
					${name === 'mixed' ? 'import {hostname} from "node:os"; declare const chooseBrowser:boolean; function server(){return hostname()}' : ''}
					function browser(this:object,target:object){return document.title}
					export function Page(this:Component<{value:number}>){
						this.state.value=0;
						const run=(task:TaskContext=TaskContext.${target}())=>{${body} this.state.value=1};
						run();
						return ()=> <output>{this.state.value}</output>;
					}`
			});
			expect(result.error).toBeUndefined();
			if (name === 'mixed') {
				const run = result.analysis?.callables.find((callable) => callable.name === 'run');
				const executors = run?.calls.filter(
					(call) => call.name === 'browser' || call.name === 'server'
				);
				expect(executors?.map((call) => call.name).sort()).toEqual(['browser', 'server']);
				expect(new Set(executors?.map((call) => call.id)).size).toBe(2);
			}
			const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
			if (name === 'mixed' || (name !== 'stored' && target === 'server')) {
				expect(errors.map((error) => error.code)).toContain('EXACT2001');
				expect(result.code ?? '').toBe('');
			} else {
				expect(errors).toEqual([]);
				expect(result.code).toBeTruthy();
			}
		}
	}
});
