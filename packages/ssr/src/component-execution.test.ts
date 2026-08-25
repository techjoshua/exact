/* eslint-disable @typescript-eslint/no-explicit-any -- This test intentionally models external, private, or invalid values that production contracts reject. */
import {
	activateTaskForHost,
	componentExecutionValueForHost,
	defineTask,
	markComponentContinuationTask,
	type Component,
	type TaskContext
} from '@exactjs/core';
import { createExpression } from '@exactjs/core/runtime/render';
import { constructDurableComponentInstance } from '@exactjs/core/runtime/component-construction/durable';
import {
	exactComponentContract,
	exactComponentType,
	type ExactComponentExecutionContract
} from '@exactjs/core/framework/component-contracts';
import {
	activateServerComponentTaskForHost,
	serverComponentExecutionValueForHost
} from '@exactjs/core/framework/server-component-execution';
import { describe, expect, it } from 'vitest';
import { renderToStringAsync } from './index.js';
import { createVNode } from './test-support/native-vnode.js';

describe('@exactjs/ssr compiler-planned component execution', () => {
	it('wires reachable child work before waiting for parent continuations', async () => {
		let releaseParent!: () => void;
		let releaseChild!: () => void;
		let markParentStarted!: () => void;
		let markChildStarted!: () => void;
		const parentGate = new Promise<void>((resolve) => (releaseParent = resolve));
		const childGate = new Promise<void>((resolve) => (releaseChild = resolve));
		const parentStarted = new Promise<void>((resolve) => (markParentStarted = resolve));
		const childStarted = new Promise<void>((resolve) => (markChildStarted = resolve));

		function Child(this: Component<{ ready: boolean }>) {
			this.state.ready = false;
			activateTaskForHost(
				this,
				defineTask({}, async () => {
					markChildStarted();
					await childGate;
					this.state.ready = true;
				})
			);
			return () => createVNode('strong', null, this.state.ready ? 'child' : 'waiting');
		}
		const CompiledChild = compiledComponent(
			Child,
			'component:ConcurrentChild',
			emptyExecution(),
			true
		);

		function Parent(this: Component<{ ready: boolean }>) {
			this.state.ready = false;
			activateTaskForHost(
				this,
				defineTask({}, async () => {
					markParentStarted();
					await parentGate;
					this.state.ready = true;
				})
			);
			return () =>
				createVNode(
					'section',
					null,
					this.state.ready ? 'parent' : 'waiting',
					createVNode(CompiledChild, {})
				);
		}
		const CompiledParent = compiledComponent(
			Parent,
			'component:ConcurrentParent',
			emptyExecution(),
			true
		);

		const rendering = renderToStringAsync(createVNode(CompiledParent, {}), { markers: false });
		await Promise.race([
			Promise.all([parentStarted, childStarted]),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('reachable child work did not start')), 1_000)
			)
		]);
		releaseParent();
		releaseChild();

		await expect(rendering).resolves.toMatchObject({
			html: '<section>parent<strong>child</strong></section>'
		});
	});

	it('forwards an unresolved parent output without issuing a stale child generation', async () => {
		let genericInstances = 0;
		const childValues: string[] = [];
		function Child(this: Component<{ label: string }>, props: { value: unknown }) {
			this.state.label = 'waiting';
			activateServerComponentTaskForHost(
				this,
				[[-1], [[1, ['label']]], 'blocking', 'consume'],
				'consume',
				(value: string, _task: TaskContext) => {
					childValues.push(value);
					this.state.label = value.toUpperCase();
				},
				props.value as string
			);
			return () => createVNode('strong', null, this.state.label);
		}
		const CompiledChild = compiledComponent(
			Child,
			'component:Child',
			{
				version: 1,
				ports: [
					['props', 'value', 'input'],
					['state', 'label', 'output']
				],
				transitions: [
					['consume', 'consume', 'setup', 'isomorphic', 'blocking', 'parallel', [0], [1]]
				],
				reactive: []
			},
			true,
			true
		);

		function Parent(this: Component<{ result: string }>) {
			this.state.result = 'loading';
			activateServerComponentTaskForHost(
				this,
				[[], [[0, ['result']]], 'blocking', 'load'],
				'load',
				async (_task: TaskContext) => {
					await Promise.resolve();
					this.state.result = 'ready';
				}
			);
			return () =>
				createVNode(CompiledChild, {
					value: serverComponentExecutionValueForHost(
						this,
						'result',
						createExpression(() => this.state.result)
					)
				});
		}
		const CompiledParent = compiledComponent(
			Parent,
			'component:Parent',
			{
				version: 1,
				ports: [['state', 'result', 'output']],
				transitions: [['load', 'load', 'setup', 'server', 'blocking', 'parallel', [], [0]]],
				reactive: []
			},
			true,
			true
		);

		const result = await renderToStringAsync(createVNode(CompiledParent, {}), {
			markers: false,
			onComponentCreated: () => genericInstances++
		});
		expect(childValues).toEqual(['ready']);
		expect(result.html).toBe('<strong>READY</strong>');
		expect(genericInstances).toBe(0);
	});

	it('settles an unresolved prop before authored child setup reads it synchronously', async () => {
		const setupValues: string[] = [];
		function Child(this: Component<{}>, props: { value: string }) {
			setupValues.push(props.value);
			return () => createVNode('strong', null, props.value);
		}
		const CompiledChild = compiledComponent(Child, 'component:SetupChild', emptyExecution());

		function Parent(this: Component<{ result: string }>) {
			this.state.result = 'loading';
			activateTaskForHost(
				this,
				defineTask(
					{},
					markComponentContinuationTask('load', async () => {
						await Promise.resolve();
						this.state.result = 'ready';
					})
				)
			);
			return () =>
				createVNode(CompiledChild, {
					value: componentExecutionValueForHost(
						this,
						'result',
						createExpression(() => this.state.result)
					)
				});
		}
		const CompiledParent = compiledComponent(Parent, 'component:SetupParent', {
			version: 1,
			ports: [['state', 'result', 'output']],
			transitions: [['load', 'load', 'setup', 'server', 'blocking', 'parallel', [], [0]]],
			reactive: []
		});

		const result = await renderToStringAsync(createVNode(CompiledParent, {}), { markers: false });
		expect(setupValues).toEqual(['ready']);
		expect(result.html).toBe('<strong>ready</strong>');
	});

	it('bounds self-wired root continuations with the request scheduler', async () => {
		let releaseParent!: () => void;
		let releaseChild!: () => void;
		let markParentStarted!: () => void;
		let markChildStarted!: () => void;
		let childRunning = false;
		const parentGate = new Promise<void>((resolve) => (releaseParent = resolve));
		const childGate = new Promise<void>((resolve) => (releaseChild = resolve));
		const parentStarted = new Promise<void>((resolve) => (markParentStarted = resolve));
		const childStarted = new Promise<void>((resolve) => (markChildStarted = resolve));
		function Child(this: Component<{}>) {
			activateTaskForHost(
				this,
				defineTask({}, async () => {
					childRunning = true;
					markChildStarted();
					await childGate;
				})
			);
			return () => createVNode('span', null, 'child');
		}
		const CompiledChild = compiledComponent(
			Child,
			'component:BoundedChild',
			emptyExecution(),
			true
		);
		function Parent(this: Component<{}>) {
			activateTaskForHost(
				this,
				defineTask({}, async () => {
					markParentStarted();
					await parentGate;
				})
			);
			return () => createVNode(CompiledChild, {});
		}
		const CompiledParent = compiledComponent(
			Parent,
			'component:BoundedParent',
			emptyExecution(),
			true
		);

		const rendering = renderToStringAsync(createVNode(CompiledParent, {}), {
			markers: false,
			maxAsyncSsrConcurrency: 1
		});
		await parentStarted;
		await Promise.resolve();
		expect(childRunning).toBe(false);
		releaseParent();
		await childStarted;
		releaseChild();
		await expect(rendering).resolves.toMatchObject({ html: '<span>child</span>' });
	});
});

function compiledComponent<T extends (...args: any[]) => any>(
	component: T,
	id: string,
	execution: ExactComponentExecutionContract,
	hasSetupTask = false,
	directScheduled = false
): T {
	return Object.assign(component, {
		[exactComponentType]: id,
		[exactComponentContract]: {
			version: 2 as const,
			placement: 'isomorphic' as const,
			role: 'executor' as const,
			implementations: [],
			continuations: [],
			executors: [],
			boundaries: [],
			execution,
			...(hasSetupTask
				? {
						definition: {
							version: 1 as const,
							instantiate: component,
							construct: constructDurableComponentInstance,
							abi: directScheduled ? 9 : 8,
							state: [],
							props: [],
							tasks: ['setup'],
							reactive: execution.reactive,
							render: 'returned-function' as const,
							capabilities: ['tasks'] as const,
							...(directScheduled
								? {
										server: {
											version: 1 as const,
											classification: 'scheduled' as const,
											lane: 'direct' as const,
											deferredTaskProps: execution.ports.flatMap((port) =>
												port[0] === 'props' ? [port[1].replace(/^props\./, '').split('.')[0]!] : []
											),
											render: component
										}
									}
								: {})
						}
					}
				: {})
		}
	});
}

function emptyExecution(): ExactComponentExecutionContract {
	return { version: 1, ports: [], transitions: [], reactive: [] };
}
