import { expect, it, onTestFinished } from 'vitest';
import type { TaskContext } from './tasks/contracts.js';
import { defineTask, invokeTask } from './tasks/runtime.js';
import { createServerComponentExecutionFrame } from './tasks/server-component-execution.js';
import { activateServerComponentTaskTreeForHost } from './tasks/server-component-task-tree.js';

it('settles descendants and their cleanup before publishing a scheduled SSR slice', async () => {
	const host = { state: { value: '' } };
	const events: string[] = [];
	let permits = 0;
	const frame = createServerComponentExecutionFrame(host, {
		async runTask(work) {
			// A child trying to acquire the held renderer permit would deadlock at capacity one.
			expect(permits).toBe(0);
			permits++;
			try {
				return await work();
			} finally {
				permits--;
			}
		}
	});
	onTestFinished(() => frame[Symbol.asyncDispose]());
	const child = defineTask({}, async (task: TaskContext) => {
		task.cleanup(() => {
			events.push('child cleanup');
		});
		await Promise.resolve();
		events.push('child done');
		host.state.value = 'ready';
	});
	activateServerComponentTaskTreeForHost(
		host,
		[[], [[0, ['value']]], 'blocking', 'parent'],
		'parent',
		(task) => {
			task.cleanup(() => {
				events.push('parent cleanup');
			});
			void invokeTask(task, child);
			events.push('parent done');
		}
	);
	await frame.blockingWork();
	expect(host.state.value).toBe('ready');
	expect(events).toEqual(['parent done', 'child done', 'child cleanup', 'parent cleanup']);
	expect(permits).toBe(0);
});

it.each([false, true])(
	'propagates only unobserved child failure (observed=%s)',
	async (observed) => {
		const host = { state: {} };
		const frame = createServerComponentExecutionFrame(host, {});
		onTestFinished(() => frame[Symbol.asyncDispose]());
		const child = defineTask({}, async () => {
			throw new Error('child failed');
		});
		activateServerComponentTaskTreeForHost(
			host,
			[[], [], 'blocking', 'parent'],
			'parent',
			async (task) => {
				const invocation = invokeTask(task, child);
				if (observed) await invocation.catch(() => undefined);
			}
		);
		if (observed) await expect(frame.blockingWork()).resolves.toBeUndefined();
		else await expect(frame.blockingWork()).rejects.toThrow('child failed');
	}
);

it('cancels request-owned detached children and waits for cleanup on disposal', async () => {
	const host = { state: {} };
	const frame = createServerComponentExecutionFrame(host, {});
	onTestFinished(() => frame[Symbol.asyncDispose]());
	let cleaned = false;
	let signal: AbortSignal | undefined;
	const child = defineTask({ detached: true }, async (task: TaskContext) => {
		signal = task.signal;
		task.cleanup(async () => {
			await Promise.resolve();
			cleaned = true;
		});
		await new Promise<void>(() => undefined);
	});
	activateServerComponentTaskTreeForHost(host, [[], [], 'blocking', 'parent'], 'parent', (task) => {
		void invokeTask(task, child);
	});
	await frame.blockingWork();
	expect(signal?.aborted).toBe(false);
	await frame[Symbol.asyncDispose]();
	expect(signal?.aborted).toBe(true);
	expect(cleaned).toBe(true);
});

it('shares a child concurrency lane across setup slices owned by the same request', async () => {
	const host = { state: {} };
	const frame = createServerComponentExecutionFrame(host, {});
	onTestFinished(() => frame[Symbol.asyncDispose]());
	const events: number[] = [];
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	onTestFinished(() => release());
	const child = defineTask({ concurrency: 'queue' }, async (value: number, _task: TaskContext) => {
		events.push(value);
		if (value === 1) await gate;
		events.push(-value);
	});
	for (const value of [1, 2]) {
		activateServerComponentTaskTreeForHost(
			host,
			[[], [], 'blocking', 'parent'],
			String(value),
			async (task) => {
				await invokeTask(task, child, value);
			}
		);
	}
	await Promise.resolve();
	expect(events).toEqual([1]);
	release();
	await frame.blockingWork();
	expect(events).toEqual([1, -1, 2, -2]);
});
