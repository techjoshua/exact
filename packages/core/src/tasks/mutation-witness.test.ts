import { createTaskOwner } from './owners.js';
import { expect, it, vi } from 'vitest';
import type { TaskContext } from './contracts.js';
import { bindTask, defineTask } from './runtime.js';

it('delivers cancellation to the running producer', async () => {
	let release!: () => void;
	let signal!: AbortSignal;
	const ready = new Promise<void>((resolve) => {
		release = resolve;
	});
	const task = defineTask({}, async (context: TaskContext) => {
		signal = context.signal;
		await ready;
	});
	const owner = createTaskOwner();
	const bound = bindTask(task, { owner });
	const completion = bound().catch(() => undefined);
	try {
		await vi.waitFor(() => expect(signal).toBeDefined());
		bound.cancel();
		expect(signal.aborted).toBe(true);
	} finally {
		release();
		await completion;
		await owner[Symbol.asyncDispose]();
	}
});

it('runs owned cleanup exactly once', async () => {
	let cleaned = 0;
	const task = defineTask({}, (context: TaskContext) => {
		context.cleanup(() => {
			cleaned++;
		});
	});
	await task();
	expect(cleaned).toBe(1);
});

it('reports a cleanup failure to the caller', async () => {
	const failure = new Error('cleanup failed');
	const task = defineTask({}, (context: TaskContext) => {
		context.cleanup(() => {
			throw failure;
		});
	});
	const result = await task().then(
		() => undefined,
		(error) => error
	);
	expect(result).toBe(failure);
});
