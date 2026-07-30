import {
	activateTaskForHost,
	createVNode,
	defineTask,
	type Component,
	type TaskContext
} from '@exactjs/core';
import { describe, expect, it } from 'vitest';
import { renderToString, renderToStringAsync } from './index.js';

describe('@exactjs/ssr ownership', () => {
	it('disposes component tasks and lifecycle ownership after synchronous SSR', () => {
		let taskSignal: AbortSignal | undefined;
		let unmounted = 0;
		function Owned(this: Component<{}>) {
			(this as any).task(({ signal }: { signal: AbortSignal }) => {
				taskSignal = signal;
			});
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
			(this as any).task(async () => {
				await new Promise<void>((done) => {
					resolve = done;
				});
				this.state.ready = true;
				return () => {
					cleaned++;
				};
			});
			return () => createVNode('p', null, this.state.ready ? 'ready' : 'waiting');
		}

		const rendering = renderToStringAsync(createVNode(Owned, {}), { markers: false });
		await Promise.resolve();
		expect(cleaned).toBe(0);
		resolve();
		await expect(rendering).resolves.toMatchObject({ html: '<p>ready</p>' });
		expect(cleaned).toBe(1);
	});
});
