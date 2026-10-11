import { expect, it, vi } from 'vitest';
import { executeTaskFrame } from './frame-runtime.js';
import { executeServerComponentTaskSlice } from './server-component-task-slice.js';
import { ownTaskResource } from './resources.js';
import type { TaskContext } from './contracts.js';

/** Runs the public generation capabilities through both execution owners. */
function execute(mode: 'frame' | 'slice', work: (context: TaskContext) => void) {
	return mode === 'frame'
		? executeTaskFrame({}, work)
		: executeServerComponentTaskSlice<[], void>(new AbortController().signal, undefined, work, []);
}

it.each(['frame', 'slice'] as const)(
	'rejects cleanup registration after producer settlement: %s',
	async (mode) => {
		let context!: TaskContext;
		await execute(mode, (task) => {
			context = task;
		});
		const cleanup = vi.fn();
		expect(() => context.cleanup(cleanup)).toThrow('producer');
		expect(() => context.own({ [Symbol.dispose]: cleanup })).toThrow('producer');
		expect(cleanup).not.toHaveBeenCalled();
	}
);

it.each(['frame', 'slice'] as const)(
	'closes resource helpers enrolled through a late signal read: %s',
	async (mode) => {
		let context!: TaskContext;
		await execute(mode, (task) => {
			context = task;
		});
		const cleanup = vi.fn();
		const signal = context.signal;
		expect(signal.aborted).toBe(false);
		ownTaskResource(signal, {}, cleanup);
		expect(cleanup).toHaveBeenCalledTimes(1);
	}
);

it.each(['frame', 'slice'] as const)(
	'rejects registrations made during cleanup without losing other resources: %s',
	async (mode) => {
		const cleanup = vi.fn();
		await execute(mode, (task) => {
			task.own({ [Symbol.dispose]: cleanup });
			task.cleanup(() => {
				expect(() => task.cleanup(() => {})).toThrow('producer');
			});
		});
		expect(cleanup).toHaveBeenCalledTimes(1);
	}
);

it('does not start a direct server producer whose request was cancelled while queued for its permit', async () => {
	const request = new AbortController();
	let release!: () => void;
	const permit = new Promise<void>((resolve) => {
		release = resolve;
	});
	const work = vi.fn();
	const result = executeServerComponentTaskSlice<[], void>(
		request.signal,
		async (invoke) => {
			await permit;
			return invoke();
		},
		work,
		[]
	);
	request.abort('cancelled while queued');
	release();
	await expect(result).rejects.toBe('cancelled while queued');
	expect(work).not.toHaveBeenCalled();
});

it('keeps a settled generation independent of subsequent request cancellation', async () => {
	const request = new AbortController();
	let context!: TaskContext;
	await executeServerComponentTaskSlice<[], void>(
		request.signal,
		undefined,
		(task) => {
			context = task;
		},
		[]
	);
	request.abort('later request cancellation');
	expect(context.signal.aborted).toBe(false);
	const cleanup = vi.fn();
	ownTaskResource(context.signal, {}, cleanup);
	expect(cleanup).toHaveBeenCalledTimes(1);
});

it.each(['frame', 'slice'] as const)(
	'retains failure on a late generation signal: %s',
	async (mode) => {
		const failure = new Error('producer failed');
		let context!: TaskContext;
		await expect(
			execute(mode, (task) => {
				context = task;
				throw failure;
			})
		).rejects.toBe(failure);
		expect(context.signal.aborted).toBe(true);
		expect(context.signal.reason).toBe(failure);
		expect(() => context.cleanup(() => {})).toThrow('producer');
	}
);

it('rejects publication when request cancellation occurs inside the producer', async () => {
	const request = new AbortController();
	await expect(
		executeServerComponentTaskSlice<[], number>(
			request.signal,
			undefined,
			() => {
				request.abort('cancel before publication');
				return 1;
			},
			[]
		)
	).rejects.toBe('cancel before publication');
	expect(
		await executeServerComponentTaskSlice<[], number>(
			new AbortController().signal,
			undefined,
			() => 2,
			[]
		)
	).toBe(2);
});

it('drains asynchronous cleanup but rejects a response cancelled during that drain', async () => {
	const request = new AbortController();
	let release!: () => void;
	let entered!: () => void;
	const started = new Promise<void>((resolve) => {
		entered = resolve;
	});
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const cleanup = vi.fn(async () => {
		entered();
		await gate;
	});
	const result = executeServerComponentTaskSlice<[], number>(
		request.signal,
		undefined,
		(task) => {
			task.cleanup(cleanup);
			return 1;
		},
		[]
	);
	await started;
	request.abort('cancel during cleanup');
	release();
	await expect(result).rejects.toBe('cancel during cleanup');
	expect(cleanup).toHaveBeenCalledTimes(1);
});
