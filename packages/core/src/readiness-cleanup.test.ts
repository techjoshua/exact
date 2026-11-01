import { expect, it, vi } from 'vitest';
import { createReadinessCoordinator } from './index.js';

it('keeps pending counts exact across cancellation, rejection, supersession, and disposal', async () => {
	const coordinator = createReadinessCoordinator(() => undefined);
	const create = () => {
		let resolve!: () => void;
		let reject!: (error: unknown) => void;
		const settlement = new Promise<void>((success, failure) => {
			resolve = success;
			reject = failure;
		});
		const registration = coordinator.context.register({
			owner: {} as never,
			taskGeneration: 1,
			settlement
		});
		return { resolve, reject, registration };
	};
	const cancelled = create();
	const successful = create();
	const rejected = create();
	expect(coordinator.pending).toBe(3);
	cancelled.registration.cancel();
	cancelled.registration.cancel();
	expect(coordinator.pending).toBe(2);
	cancelled.resolve();
	successful.resolve();
	await Promise.resolve();
	expect(coordinator.pending).toBe(1);
	rejected.reject(new Error('work rejected'));
	await Promise.resolve();
	expect(coordinator.pending).toBe(0);
	coordinator.commitGeneration();
	expect(coordinator.pending).toBe(0);
	const stale = create();
	coordinator.beginGeneration();
	stale.resolve();
	await Promise.resolve();
	expect(coordinator.pending).toBe(0);
	create();
	coordinator.dispose();
	create().registration.cancel();
	expect(coordinator.pending).toBe(0);
});

it('keeps waiters pending when a readiness notification registers more work', async () => {
	let settleFirst!: () => void;
	let settleNext!: () => void;
	const first = new Promise<void>((resolve) => {
		settleFirst = resolve;
	});
	const next = new Promise<void>((resolve) => {
		settleNext = resolve;
	});
	let added = false;
	const coordinator = createReadinessCoordinator((pending) => {
		if (pending !== 0 || added) return;
		added = true;
		coordinator.context.register({ owner: {} as never, taskGeneration: 2, settlement: next });
	});
	coordinator.context.register({ owner: {} as never, taskGeneration: 1, settlement: first });
	const ready = vi.fn();
	const result = coordinator.whenReady().then(ready);
	settleFirst();
	await Promise.resolve();
	await Promise.resolve();
	expect(coordinator.pending).toBe(1);
	expect(ready).not.toHaveBeenCalled();
	settleNext();
	await result;
	expect(ready).toHaveBeenCalledOnce();
	coordinator.dispose();
});

it('retains new work registered while the previous generation is discarded', async () => {
	const coordinator = createReadinessCoordinator(() => undefined);
	let settle!: () => void;
	const next = new Promise<void>((resolve) => {
		settle = resolve;
	});
	coordinator.context.register({
		owner: {} as never,
		taskGeneration: 1,
		settlement: new Promise(() => {}),
		discard() {
			coordinator.context.register({
				owner: {} as never,
				taskGeneration: 2,
				settlement: next,
				retry: true
			});
		}
	});
	coordinator.beginGeneration();
	expect(coordinator.pending).toBe(1);
	settle();
	await Promise.resolve();
	expect(coordinator.pending).toBe(0);
	await expect(coordinator.whenReady()).resolves.toMatchObject({ generation: 1, retry: true });
	coordinator.dispose();
});

it('delivers asynchronous publication failures to readiness consumers', async () => {
	const coordinator = createReadinessCoordinator(() => undefined, { commitSettled: true });
	const error = new Error('settled publication failed');
	coordinator.context.register({
		owner: {} as never,
		taskGeneration: 1,
		settlement: Promise.resolve(),
		commit() {
			throw error;
		}
	});
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const result = coordinator.whenReady().then(
			() => 'unexpected success',
			(failure) => failure
		);
		const deadline = new Promise((resolve) => {
			timer = setTimeout(() => resolve('readiness stayed pending'), 100);
		});
		expect(await Promise.race([result, deadline])).toBe(error);
		await expect(coordinator.whenReady()).rejects.toBe(error);
		coordinator.beginGeneration();
		await expect(coordinator.whenReady()).resolves.toMatchObject({ generation: 1 });
	} finally {
		clearTimeout(timer);
		coordinator.dispose();
	}
});

it.each(['dispose', 'beginGeneration', 'commitGeneration'] as const)(
	'finishes %s after a registration callback fails',
	async (method) => {
		const coordinator = createReadinessCoordinator(() => undefined);
		coordinator.beginGeneration();
		const error = new Error('first registration failed');
		const later = vi.fn();
		const callback = method === 'commitGeneration' ? 'commit' : 'discard';
		for (const run of [
			() => {
				throw error;
			},
			later
		]) {
			coordinator.context.register({
				owner: {} as never,
				taskGeneration: 1,
				settlement: new Promise(() => {}),
				[callback]: run
			});
		}
		const ready = vi.fn();
		void coordinator.whenReady().then(ready, ready);
		expect(() => coordinator[method]()).toThrow(error);
		expect(later).toHaveBeenCalledOnce();
		expect(coordinator.pending).toBe(0);
		await Promise.resolve();
		expect(ready).toHaveBeenCalledOnce();
		coordinator.dispose();
	}
);

it('publishes cancellation after a failing discard without retaining readiness waiters', async () => {
	const changes = vi.fn();
	const coordinator = createReadinessCoordinator(changes);
	const registration = coordinator.context.register({
		owner: {} as never,
		taskGeneration: 1,
		settlement: new Promise(() => {}),
		discard() {
			throw new Error('discard failed');
		}
	});
	const ready = vi.fn();
	void coordinator.whenReady().then(ready);
	expect(() => registration.cancel()).toThrow('discard failed');
	await Promise.resolve();
	expect(coordinator.pending).toBe(0);
	expect(changes).toHaveBeenLastCalledWith(0, 0, false);
	expect(ready).toHaveBeenCalledOnce();
	coordinator.dispose();
});
