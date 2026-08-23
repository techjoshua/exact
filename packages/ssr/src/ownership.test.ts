import {
	activateTaskForHost,
	createVNode as createNativeVNode,
	defineTask,
	type Component,
	type TaskContext
} from '@exactjs/core';
import {
	exactComponentContract,
	exactComponentType
} from '@exactjs/core/framework/component-contracts';
import { describe, expect, it, vi } from 'vitest';
import { renderToString, renderToStringAsync } from './index.js';
import { createVNode } from './test-support/native-vnode.js';

describe('@exactjs/ssr ownership', () => {
	it('executes compiler-closed synchronous server components without durable ownership', () => {
		let created = 0;
		const receivers: object[] = [];
		function Direct(this: Component<{ label: string }>, props: { label: string }) {
			receivers.push(this);
			this.state.label = props.label;
			return () => createVNode('p', null, this.state.label);
		}
		Object.assign(Direct, {
			[exactComponentType]: 'component:direct-server-fixture',
			[exactComponentContract]: {
				version: 2,
				placement: 'server',
				role: 'executor',
				implementations: [
					{
						id: 'implementation:direct-server-fixture',
						name: 'Direct',
						role: 'root',
						implementation: Direct
					}
				],
				continuations: [],
				executors: [],
				boundaries: [],
				definition: {
					version: 1,
					instantiate: Direct,
					abi: 1,
					capabilities: [],
					state: ['label'],
					server: {
						version: 1,
						classification: 'synchronous',
						lane: 'direct',
						setup: [],
						slices: [],
						render: Direct
					}
				},
				execution: { version: 1, ports: [], transitions: [] }
			}
		});
		const vnode = createNativeVNode(Direct, { label: 'direct' });

		const rendered = renderToString(vnode, {
			markers: false,
			onComponentCreated: () => created++
		});

		expect(rendered.html).toBe('<p>direct</p>');
		expect(receivers).toHaveLength(1);
		expect(receivers[0]).not.toHaveProperty('unmount');
		expect(created).toBe(0);
	});

	it('disposes component tasks and lifecycle ownership after synchronous SSR', () => {
		let taskSignal: AbortSignal | undefined;
		let unmounted = 0;
		function Owned(this: Component<{}>) {
			activateTaskForHost(
				this,
				defineTask({}, (_task: TaskContext) => {
					taskSignal = _task.signal;
				})
			);
			this.onUnmount(() => {
				unmounted++;
			});
			return () => createVNode('p', null, 'owned');
		}

		expect(renderToString(createVNode(Owned, {}), { markers: false }).html).toBe('<p>owned</p>');
		expect(taskSignal?.aborted).toBe(true);
		expect(unmounted).toBe(1);
	});

	it('observes cancellation when synchronous SSR disposes scheduled nonblocking tasks', async () => {
		function Owned(this: Component<{}>) {
			activateTaskForHost(
				this,
				defineTask(
					{ placement: 'client', readiness: 'nonblocking' },
					(_task: TaskContext) => undefined
				)
			);
			return () => createVNode('p', null, 'owned');
		}

		expect(renderToString(createVNode(Owned, {}), { markers: false }).html).toBe('<p>owned</p>');
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
	});

	it('finishes every SSR teardown while preserving the primary render failure', () => {
		let unmounted = 0;
		function BrokenCleanup(this: Component<{}>) {
			this.onUnmount(() => {
				unmounted++;
				throw new Error(`cleanup ${unmounted}`);
			});
			return () => createVNode('p', null, 'owned');
		}
		let failure: unknown;
		try {
			renderToString(
				createVNode(
					'section',
					null,
					createVNode(BrokenCleanup, { key: 'a' }),
					createVNode(BrokenCleanup, { key: 'b' })
				),
				{ markers: false, maxOutputBytes: 30 }
			);
		} catch (error) {
			failure = error;
		}

		expect(String(failure)).toContain('output exceeds');
		expect(unmounted).toBe(2);
	});

	it('keeps async SSR ownership alive until tasks settle and then disposes it', async () => {
		let resolve!: () => void;
		let cleaned = 0;
		function Owned(this: Component<{ ready: boolean }>) {
			this.state.ready = false;
			activateTaskForHost(
				this,
				defineTask({}, async (task: TaskContext) => {
					task.cleanup(() => {
						cleaned++;
					});
					await new Promise<void>((done) => {
						resolve = done;
					});
					this.state.ready = true;
				})
			);
			return () => createVNode('p', null, this.state.ready ? 'ready' : 'waiting');
		}

		const rendering = renderToStringAsync(createVNode(Owned, {}), { markers: false });
		await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
		expect(cleaned).toBe(0);
		resolve();
		await expect(rendering).resolves.toMatchObject({ html: '<p>ready</p>' });
		expect(cleaned).toBe(1);
	});
});
