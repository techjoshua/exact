import { expect, it, vi } from 'vitest';
import { createTaskOwnerRecord } from './frame-runtime.js';
import { bindTask, defineTask, taskStatus } from './runtime.js';

it.each([
	{ readiness: 'blocking', priority: 'normal', blocks: true },
	{ readiness: 'nonblocking', priority: 'normal', blocks: false },
	{ readiness: 'nonblocking', priority: 'deferred', blocks: false }
] as const)(
	'reports unsettled $readiness/$priority work independently of readiness',
	async ({ readiness, priority, blocks }) => {
		const owner = createTaskOwnerRecord('status');
		const registerReadiness = vi.fn(() => ({ cancel: vi.fn() }));
		owner.registerReadiness = registerReadiness;
		let started = 0;
		let resolve!: (value: number) => void;
		let reject!: (error: Error) => void;
		const work = defineTask(
			{ readiness, priority, concurrency: 'queue' },
			() =>
				new Promise<number>((accept, fail) => {
					started++;
					resolve = accept;
					reject = fail;
				})
		);
		const bound = bindTask(work, { owner });
		const status = taskStatus(work, { owner });
		try {
			const first = bound();
			const second = bound();
			expect(status.pending).toBe(true);
			expect(bound.pendingCount).toBe(2);
			expect(registerReadiness).toHaveBeenCalledTimes(blocks ? 2 : 0);
			await vi.waitFor(() => expect(started).toBe(1));
			resolve(1);
			await expect(first).resolves.toBe(1);
			expect(status.pendingCount).toBe(1);
			await vi.waitFor(() => expect(started).toBe(2));
			const failure = new Error('failed');
			reject(failure);
			await expect(second).rejects.toBe(failure);
			expect(bound.pending).toBe(false);
			expect(status.error).toBe(failure);
			const cancelled = bound();
			expect(status.pendingCount).toBe(1);
			bound.cancel();
			await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
			expect(status.pendingCount).toBe(0);
			const disposed = bound();
			expect(status.pending).toBe(true);
			await owner[Symbol.asyncDispose]();
			await expect(disposed).rejects.toMatchObject({ name: 'AbortError' });
			expect(status.pending).toBe(false);
		} finally {
			await owner[Symbol.asyncDispose]();
		}
	}
);
