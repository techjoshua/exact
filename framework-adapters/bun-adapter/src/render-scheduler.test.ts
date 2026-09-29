import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBunRenderScheduler } from './render-scheduler.js';

const scheduler = vi.hoisted(() => ({ yield: undefined as (() => Promise<void>) | undefined }));
vi.mock('node:timers/promises', () => ({ scheduler }));

vi.mock('node:timers', () => ({
	setImmediate: (callback: () => void) => globalThis.setImmediate(callback),
	clearImmediate: (timer: ReturnType<typeof setImmediate>) => globalThis.clearImmediate(timer)
}));

afterEach(() => vi.useRealTimers());

describe.each(['yield', 'immediate'])('Bun render scheduling with %s', (primitive) => {
	beforeEach(() => {
		scheduler.yield =
			primitive === 'yield'
				? () => new Promise<void>((resolve) => setImmediate(resolve))
				: undefined;
	});
	it('yields between bounded FIFO batches instead of releasing the whole backlog in one turn', async () => {
		vi.useFakeTimers();
		const schedule = createBunRenderScheduler({ maxBatchSize: 2 });
		const order: number[] = [];
		const work = [0, 1, 2, 3, 4].map((id) =>
			Promise.resolve(schedule()).then(() => order.push(id))
		);
		expect(order).toEqual([]);
		expect(vi.getTimerCount()).toBe(1);
		await advanceOneTurn();
		expect(order).toEqual([0, 1]);
		await advanceOneTurn();
		expect(order).toEqual([0, 1, 2, 3]);
		await vi.runAllTimersAsync();
		await Promise.all(work);
		expect(order).toEqual([0, 1, 2, 3, 4]);
	});

	it('unlinks a fully canceled middle batch while preserving its neighbors', async () => {
		vi.useFakeTimers();
		const schedule = createBunRenderScheduler({ maxBatchSize: 1 });
		const order: number[] = [];
		const first = schedule().then(() => order.push(1));
		const controller = new AbortController();
		const canceled = schedule(controller.signal).catch((reason: unknown) => reason);
		const last = schedule().then(() => order.push(3));
		controller.abort('closed');
		expect(await canceled).toBe('closed');
		await advanceOneTurn();
		expect(order).toEqual([1]);
		await advanceOneTurn();
		await Promise.all([first, last]);
		expect(order).toEqual([1, 3]);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('removes a canceled request without canceling another request in its batch', async () => {
		vi.useFakeTimers();
		const schedule = createBunRenderScheduler();
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
		const schedule = createBunRenderScheduler();
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
		await expect(createBunRenderScheduler()(controller.signal)).rejects.toBe('closed');
		expect(vi.getTimerCount()).toBe(0);
	});

	it('validates batch limits', () => {
		for (const maxBatchSize of [0, -1, 1.5, Infinity, NaN])
			expect(() => createBunRenderScheduler({ maxBatchSize })).toThrow(RangeError);
	});
});

it('rejects queued requests on yield failure, removes listeners and accepts new work', async () => {
	let fail!: (reason: unknown) => void;
	scheduler.yield = () =>
		new Promise<void>((_resolve, reject) => {
			fail = reject;
		});
	const schedule = createBunRenderScheduler({ maxBatchSize: 1 });
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
	const schedule = createBunRenderScheduler();
	await expect(schedule()).rejects.toBe(reason);
	scheduler.yield = () => Promise.resolve();
	await schedule();
});

it.each(['resolve', 'reject'])(
	'ignores a canceled turn that later %ss while new work is queued',
	async (settlement) => {
		const turns: Array<{ resolve: () => void; reject: (reason: unknown) => void }> = [];
		scheduler.yield = () => new Promise<void>((resolve, reject) => turns.push({ resolve, reject }));
		const schedule = createBunRenderScheduler();
		const controller = new AbortController();
		const first = schedule(controller.signal).catch((reason: unknown) => reason);
		controller.abort('closed');
		expect(await first).toBe('closed');
		let completed = false;
		const next = schedule().then(() => {
			completed = true;
		});
		if (settlement === 'resolve') turns[0]!.resolve();
		else turns[0]!.reject(new Error('stale host failure'));
		await Promise.resolve();
		await Promise.resolve();
		expect(completed).toBe(false);
		turns[1]!.resolve();
		await next;
		expect(completed).toBe(true);
	}
);

/** Drains promise reactions without also executing the next scheduled host callback. */
async function advanceOneTurn(): Promise<void> {
	vi.advanceTimersToNextTimer();
	await Promise.resolve();
	await Promise.resolve();
}
