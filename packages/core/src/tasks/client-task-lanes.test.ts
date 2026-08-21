import { describe, expect, it } from 'vitest';
import type { Component, LifecycleHandler } from '../component/contracts.js';
import { createTaskOwnerRecord } from './frame-runtime.js';
import { registerTaskOwnerHost } from './owner-hosts.js';
import {
	defineClientLatestTaskForHost,
	defineClientParallelTaskForHost,
	defineClientQueueTaskForHost
} from './client-task-lanes.js';

describe('compiled client/latest task lane', () => {
	it('cancels the previous generation and releases the active generation with its host', async () => {
		let unmount: LifecycleHandler | undefined;
		const host = {
			onUnmount(handler: LifecycleHandler) {
				unmount = handler;
			}
		} as Component<object>;
		const owner = createTaskOwnerRecord('host');
		registerTaskOwnerHost(host, owner);
		const signals: AbortSignal[] = [];
		const task = defineClientLatestTaskForHost(host, 'load', async (value: string, context) => {
			signals.push(context.signal);
			await new Promise<void>((resolve, reject) => {
				context.signal.addEventListener('abort', () => reject(context.signal.reason), {
					once: true
				});
				if (value === 'second') queueMicrotask(resolve);
			});
			return value;
		});

		const first = task('first');
		const second = task('second');
		await expect(first).rejects.toBeDefined();
		await expect(second).resolves.toBe('second');
		expect(signals[0]?.aborted).toBe(true);

		const active = task('third');
		unmount?.({ signal: new AbortController().signal, reason: 'test release' });
		await expect(active).rejects.toBeDefined();
		expect(signals[2]?.aborted).toBe(true);
		await owner[Symbol.asyncDispose]();
	});

	it('runs parallel generations independently and queued generations in invocation order', async () => {
		const host = { onUnmount() {} } as unknown as Component<object>;
		const owner = createTaskOwnerRecord('host');
		registerTaskOwnerHost(host, owner);
		const releases: Array<() => void> = [];
		const started: string[] = [];
		const work = async (value: string, context: { signal: AbortSignal }) => {
			started.push(value);
			await new Promise<void>((resolve) => releases.push(resolve));
			expect(context.signal.aborted).toBe(false);
			return value;
		};
		const parallel = defineClientParallelTaskForHost(host, 'parallel', work);
		const firstParallel = parallel('p1');
		const secondParallel = parallel('p2');
		expect(started).toEqual(['p1', 'p2']);
		releases.splice(0).forEach((release) => release());
		await expect(Promise.all([firstParallel, secondParallel])).resolves.toEqual(['p1', 'p2']);

		started.length = 0;
		const queued = defineClientQueueTaskForHost(host, 'queue', work);
		const firstQueued = queued('q1');
		const secondQueued = queued('q2');
		expect(started).toEqual(['q1']);
		releases.shift()?.();
		await expect(firstQueued).resolves.toBe('q1');
		expect(started).toEqual(['q1', 'q2']);
		releases.shift()?.();
		await expect(secondQueued).resolves.toBe('q2');
		await owner[Symbol.asyncDispose]();
	});
});
