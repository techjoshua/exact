import { expect, it, vi } from 'vitest';
import { settleSsrReadiness } from './resume-scheduling.js';

it('keeps ready work synchronous without consulting admission', () => {
	const scheduleRender = vi.fn();
	expect(
		settleSsrReadiness({ blockingWork: () => undefined }, { scheduleRender }, 10)
	).toBeUndefined();
	expect(scheduleRender).not.toHaveBeenCalled();
});

it('rechecks a new blocking generation started during queued admission', async () => {
	let first!: () => void;
	let second!: () => void;
	let admit!: () => void;
	let active: Promise<void> | undefined = new Promise<void>((resolve) => {
		first = () => {
			active = undefined;
			resolve();
		};
	});
	const scheduleRender = vi.fn(() => {
		if (scheduleRender.mock.calls.length !== 1) return;
		active = new Promise<void>((resolve) => {
			second = () => {
				active = undefined;
				resolve();
			};
		});
		return new Promise<void>((resolve) => {
			admit = resolve;
		});
	});
	let complete = false;
	const pending = Promise.resolve(
		settleSsrReadiness({ blockingWork: () => active }, { scheduleRender }, 10)
	).then(() => {
		complete = true;
	});
	try {
		first();
		await vi.waitFor(() => expect(scheduleRender).toHaveBeenCalledOnce());
		admit();
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(complete).toBe(false);
		second();
		await pending;
		expect(scheduleRender).toHaveBeenCalledTimes(2);
	} finally {
		first();
		admit?.();
		second?.();
		await pending;
	}
});

it('bounds repeated generations and does not admit failed tasks', async () => {
	const scheduleRender = vi.fn();
	await expect(
		settleSsrReadiness({ blockingWork: () => Promise.resolve() }, { scheduleRender }, 2)
	).rejects.toThrow('SSR task drain exceeded 2 passes');
	const reason = new Error('task failed');
	await expect(
		settleSsrReadiness({ blockingWork: () => Promise.reject(reason) }, { scheduleRender }, 2)
	).rejects.toBe(reason);
	expect(scheduleRender).not.toHaveBeenCalled();
});
