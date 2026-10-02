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
