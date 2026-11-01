import { verifySsrSchedulerGrant } from '../../../component-composition-corpus/test-support/ssr-scheduler-grant-journey.js';
import { expect, it, vi } from 'vitest';
import { AsyncSsrScheduler } from './async-scheduler.js';

it('starts available work immediately and admits waiting work in FIFO order', async () => {
	const scheduler = new AsyncSsrScheduler(1);
	let resolveFirst!: (value: number) => void;
	const first = new Promise<number>((resolve) => {
		resolveFirst = resolve;
	});
	const starts: number[] = [];
	const one = scheduler.run(() => {
		starts.push(1);
		return first;
	});
	const two = scheduler.run(async () => {
		starts.push(2);
		return 2;
	});
	const three = scheduler.run(async () => {
		starts.push(3);
		return 3;
	});
	expect(starts).toEqual([1]);
	resolveFirst(1);
	expect(await Promise.all([one, two, three])).toEqual([1, 2, 3]);
	expect(starts).toEqual([1, 2, 3]);
});

it('removes cancelled queued work without consuming a permit', async () => {
	const scheduler = new AsyncSsrScheduler(1);
	let resolveFirst!: () => void;
	const first = new Promise<void>((resolve) => {
		resolveFirst = resolve;
	});
	const one = scheduler.run(() => first);
	const controller = new AbortController();
	const cancelledWork = vi.fn(async () => {});
	const cancelled = scheduler.run(cancelledWork, controller.signal);
	const rejection = expect(cancelled).rejects.toBe('cancelled');
	controller.abort('cancelled');
	await rejection;
	const next = scheduler.run(async () => 'next');
	resolveFirst();
	await one;
	expect(await next).toBe('next');
	expect(cancelledWork).not.toHaveBeenCalled();
});

it('releases permits after synchronous throws and asynchronous failures', async () => {
	const scheduler = new AsyncSsrScheduler(1);
	const failure = new Error('failed');
	await expect(
		scheduler.run(() => {
			throw failure;
		})
	).rejects.toBe(failure);
	await expect(scheduler.run(() => Promise.reject(failure))).rejects.toBe(failure);
	expect(await scheduler.run(async () => 'ready')).toBe('ready');
});

it('lends its permit to nested work and reacquires it before the outer task finishes', async () => {
	const scheduler = new AsyncSsrScheduler(1);
	const outer = scheduler.run(() => scheduler.suspend(() => scheduler.run(async () => 'nested')));
	const following = scheduler.run(async () => 'following');
	expect(await Promise.all([outer, following])).toEqual(['nested', 'following']);
	expect(await scheduler.run(async () => 'available')).toBe('available');
});

it('rejects already aborted work before invocation', async () => {
	const controller = new AbortController();
	controller.abort('closed');
	const work = vi.fn(async () => {});
	await expect(new AsyncSsrScheduler(1).run(work, controller.signal)).rejects.toBe('closed');
	expect(work).not.toHaveBeenCalled();
});

it('preserves null cancellation and releases the queued request', async () => {
	const scheduler = new AsyncSsrScheduler(1);
	let release!: () => void;
	const running = scheduler.run(
		() =>
			new Promise<void>((resolve) => {
				release = resolve;
			})
	);
	const controller = new AbortController();
	const work = vi.fn(async () => 'cancelled');
	const waiting = scheduler.run(work, controller.signal);
	controller.abort(null);
	await expect(waiting).rejects.toBe(null);
	release();
	await running;
	expect(work).not.toHaveBeenCalled();
	expect(await scheduler.run(async () => 'ready')).toBe('ready');
});

it('checks cancellation again after a queued permit is granted', () =>
	verifySsrSchedulerGrant(AsyncSsrScheduler));
