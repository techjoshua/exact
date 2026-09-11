import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNodeRenderScheduler } from './render-scheduler.js';

const scheduler = vi.hoisted(() => ({ yield: undefined as (() => Promise<void>) | undefined }));
vi.mock('node:timers/promises', () => ({ scheduler }));

vi.mock('node:timers', () => ({
	setImmediate: (callback: () => void) => globalThis.setImmediate(callback),
	clearImmediate: (timer: ReturnType<typeof setImmediate>) => globalThis.clearImmediate(timer)
}));

afterEach(() => vi.useRealTimers());

describe.each(['yield', 'immediate'])('Node render scheduling with %s', (primitive) => {
	beforeEach(() => {
		scheduler.yield =
			primitive === 'yield'
				? () => new Promise<void>((resolve) => setImmediate(resolve))
				: undefined;
	});
	it('shares a callback and limits the number of starts per batch', async () => {
		vi.useFakeTimers();
		const schedule = createNodeRenderScheduler({ maxBatchSize: 2 });
		const order: number[] = [];
		const work = [0, 1, 2, 3, 4].map((id) =>
			Promise.resolve(schedule()).then(() => order.push(id))
		);
		expect(order).toEqual([]);
		expect(vi.getTimerCount()).toBe(3);
		await vi.runAllTimersAsync();
		await Promise.all(work);
		expect(order).toEqual([0, 1, 2, 3, 4]);
	});

	it('removes a canceled request without canceling another request in its batch', async () => {
		vi.useFakeTimers();
		const schedule = createNodeRenderScheduler();
		const controller = new AbortController();
		const reason = new Error('disconnect');
		const canceled = Promise.resolve(schedule(controller.signal)).catch((error: unknown) => error);
		const other = schedule();
		controller.abort(reason);
		expect(await canceled).toBe(reason);
		expect(vi.getTimerCount()).toBe(1);
		await vi.runAllTimersAsync();
		await other;
	});

	it('clears fully canceled batches and accepts subsequent work', async () => {
		vi.useFakeTimers();
		const schedule = createNodeRenderScheduler();
		const controller = new AbortController();
		const canceled = Promise.resolve(schedule(controller.signal)).catch((error: unknown) => error);
		controller.abort();
		expect(await canceled).toBe(controller.signal.reason);
		// Yield cannot cancel its underlying task; canceled requests are detached immediately.
		expect(vi.getTimerCount()).toBe(primitive === 'yield' ? 1 : 0);
		const next = schedule();
		await vi.runAllTimersAsync();
		await next;
	});

	it('rejects an already aborted request without allocating a timer', async () => {
		vi.useFakeTimers();
		const controller = new AbortController();
		controller.abort('closed');
		await expect(createNodeRenderScheduler()(controller.signal)).rejects.toBe('closed');
		expect(vi.getTimerCount()).toBe(0);
	});

	it('validates batch limits', () => {
		for (const maxBatchSize of [0, -1, 1.5, Infinity, NaN])
			expect(() => createNodeRenderScheduler({ maxBatchSize })).toThrow(RangeError);
	});
});

it('rejects queued requests on yield failure, removes listeners and accepts new work', async () => {
	let fail!: (reason: unknown) => void;
	scheduler.yield = () =>
		new Promise<void>((_resolve, reject) => {
			fail = reject;
		});
	const schedule = createNodeRenderScheduler();
	const controller = new AbortController();
	const remove = vi.spyOn(controller.signal, 'removeEventListener');
	const first = Promise.resolve(schedule(controller.signal)).catch((reason: unknown) => reason);
	const second = Promise.resolve(schedule()).catch((reason: unknown) => reason);
	const reason = new Error('host yield failed');
	fail(reason);
	expect(await first).toBe(reason);
	expect(await second).toBe(reason);
	expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
	scheduler.yield = () => Promise.resolve();
	await schedule();
});

it('rejects synchronous yield failures without poisoning the next batch', async () => {
	const reason = new Error('host yield threw');
	scheduler.yield = () => {
		throw reason;
	};
	const schedule = createNodeRenderScheduler();
	await expect(schedule()).rejects.toBe(reason);
	scheduler.yield = () => Promise.resolve();
	await schedule();
});
