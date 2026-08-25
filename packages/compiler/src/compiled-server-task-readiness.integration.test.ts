import * as exactCore from '@exactjs/core';
import * as exactRenderStructure from '@exactjs/core/framework/render-structure';
import * as exactServerRenderStructure from '@exactjs/core/framework/server-render-structure';
import * as exactServerComponentExecution from '@exactjs/core/framework/server-component-execution';
import * as exactServerTaskHelpers from '@exactjs/core/framework/server-task-helpers';
import * as exactDirectServerConstructionRuntime from '@exactjs/core/runtime/component-construction/direct-server';
import { createVNode } from '@exactjs/core';
import { renderToStringAsync } from '@exactjs/ssr';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { transform } from './index.js';

it('issues nested independent server tasks before authored-order serialization', async () => {
	const compiled = transform(
		`
			import { TaskContext, type Component } from '@exactjs/core';
			type State = { value: number };
			let started = 0;
			let release!: () => void;
			const gate = new Promise<void>((resolve) => { release = resolve; });
			export function startedTasks() { return started; }
			export function releaseTasks() { release(); }
			function Leaf(this: Component<State>, props: { value: number }) {
				this.state.value = 0;
				async function prepare(value: number, _task: TaskContext = TaskContext.server().blocking()) {
					started++;
					await gate;
					this.state.value = value;
				}
				void prepare(props.value);
				return () => <span>{this.state.value}</span>;
			}
			export function Page(props: { title: string }) {
				return () => <main><h1>{props.title}</h1><section><Leaf value={1} /><Leaf value={2} /></section></main>;
			}
		`,
		{
			filename: 'CompiledNestedServerTasks.tsx',
			target: 'server',
			serverComponents: true
		}
	);
	expect(compiled).toContain('this.state.value = 0');
	expect(compiled).toContain('this.state.value = value');
	expect(compiled).toContain('awaitServerComponentTask');
	expect(compiled).not.toContain('writeReactiveLazy');
	const javascript = ts.transpileModule(compiled, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	}).outputText;
	const module = {
		exports: {} as {
			Page?: exactCore.AnyComponentFunction;
			releaseTasks?: () => void;
			startedTasks?: () => number;
		}
	};
	const modules: Record<string, unknown> = {
		'@exactjs/core': exactCore,
		'@exactjs/core/runtime/component-construction/direct-server':
			exactDirectServerConstructionRuntime,
		'@exactjs/core/framework/render-structure': exactRenderStructure,
		'@exactjs/core/framework/server-render-structure': exactServerRenderStructure,
		'@exactjs/core/framework/server-component-execution': exactServerComponentExecution,
		'@exactjs/core/framework/server-task-helpers': exactServerTaskHelpers,
		'@exactjs/core/runtime/reactivity': exactCore,
		'@exactjs/ssr/runtime/generic-components': {},
		'@exactjs/ssr/runtime/structural-boundaries': {}
	};
	const requireModule = (specifier: string): unknown => {
		if (specifier in modules) return modules[specifier];
		throw new Error(`Unexpected compiled test dependency ${specifier}`);
	};
	new Function('require', 'exports', 'module', javascript)(requireModule, module.exports, module);
	const { Page, releaseTasks, startedTasks } = module.exports;
	if (!Page || !releaseTasks || !startedTasks)
		throw new Error('Compiled server readiness fixture omitted a test export');

	const rendering = renderToStringAsync(createVNode(Page, { title: 'Ready' }), {
		markers: false,
		maxAsyncSsrConcurrency: 2
	});
	try {
		await waitFor(() => startedTasks() === 2);
		expect(startedTasks()).toBe(2);
	} finally {
		releaseTasks();
	}
	const result = await rendering;
	expect(result.html).toContain('<h1>Ready</h1>');
	expect(result.html).toContain('<span>1</span>');
	expect(result.html).toContain('<span>2</span>');
});

async function waitFor(condition: () => boolean): Promise<void> {
	const deadline = performance.now() + 1_000;
	while (!condition()) {
		if (performance.now() >= deadline)
			throw new Error('nested server tasks did not become ready concurrently');
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}
