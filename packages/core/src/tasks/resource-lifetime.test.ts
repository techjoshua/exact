import { expect, it, vi } from 'vitest';
import { executeTaskFrame } from './frame-runtime.js';
import { executeServerComponentTaskSlice } from './server-component-task-slice.js';
import {
	ownTaskResource,
	taskObserver,
	taskTimeout,
	taskInterval,
	taskFetch
} from './resources.js';
import { combineTaskSignal, withAbortSignal } from './signals.js';

/** Holds cleanup or producer settlement at an observable lifecycle boundary. */
function gate() {
	let resolve!: () => void;
	const promise = new Promise<void>((accept) => {
		resolve = accept;
	});
	return { resolve, promise };
}

it('releases timer, observer and listener resources on success while retaining a successful signal', async () => {
	vi.useFakeTimers();
	try {
		const callback = vi.fn(),
			disconnect = vi.fn(),
			target = new EventTarget(),
			listener = vi.fn();
		let signal!: AbortSignal;
		await executeTaskFrame({}, (task) => {
			signal = task.signal;
			taskTimeout(signal, callback, 10);
			taskInterval(signal, callback, 10);
			taskObserver(signal, { disconnect });
			target.addEventListener('probe', listener, withAbortSignal(true, signal));
			return 7;
		});
		expect(signal.aborted).toBe(false);
		expect(disconnect).toHaveBeenCalledTimes(1);
		target.dispatchEvent(new Event('probe'));
		vi.runOnlyPendingTimers();
		expect(callback).not.toHaveBeenCalled();
		expect(listener).not.toHaveBeenCalled();
	} finally {
		vi.useRealTimers();
	}
});

it('waits for compiler-owned async disposal and closes stale resource registrations once', async () => {
	const held = gate(),
		closed = vi.fn(() => held.promise);
	let signal!: AbortSignal;
	let settled = false;
	const result = executeTaskFrame({}, (task) => {
		signal = task.signal;
		ownTaskResource(signal, {}, closed);
		return 9;
	}).then((value) => {
		settled = true;
		return value;
	});
	await vi.waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
	expect(settled).toBe(false);
	expect(signal.aborted).toBe(false);
	held.resolve();
	expect(await result).toBe(9);
	expect(closed).toHaveBeenCalledTimes(1);
	const late = vi.fn();
	ownTaskResource(signal, {}, late);
	expect(late).toHaveBeenCalledTimes(1);
});

it('keeps attached child resources alive until the child finishes and isolates sibling settlement', async () => {
	const held = gate(),
		closed = vi.fn();
	let child!: Promise<number>;
	let signal!: AbortSignal;
	const parent = executeTaskFrame({}, () => {
		child = executeTaskFrame({}, async (task) => {
			signal = task.signal;
			ownTaskResource(signal, {}, closed);
			await held.promise;
			return 2;
		});
		return 1;
	});
	await executeTaskFrame({}, () => 3);
	expect(closed).not.toHaveBeenCalled();
	expect(signal.aborted).toBe(false);
	held.resolve();
	expect(await child).toBe(2);
	expect(await parent).toBe(1);
	expect(closed).toHaveBeenCalledTimes(1);
});

it.each(['success', 'failure', 'cancel'] as const)(
	'releases resources through explicit cleanup failure: %s',
	async (outcome) => {
		const controller = new AbortController(),
			closed = vi.fn(),
			held = gate();
		const result = executeTaskFrame({ controller }, async (task) => {
			ownTaskResource(task.signal, {}, closed);
			task.cleanup(() => {
				throw new Error('cleanup');
			});
			await held.promise;
			if (outcome === 'failure') throw new Error('producer');
			return 1;
		});
		if (outcome === 'cancel') controller.abort('cancel');
		held.resolve();
		await expect(result).rejects.toBeDefined();
		expect(closed).toHaveBeenCalledTimes(1);
	}
);

it('closes fetch body cancellation with task resources after producer consumption', async () => {
	let selected!: AbortSignal;
	let owner!: AbortSignal;
	const response = new Response('body');
	const result = await executeTaskFrame({}, async (task) => {
		owner = task.signal;
		const value = await taskFetch(
			owner,
			(_input: string, options?: { signal?: AbortSignal }) => {
				selected = options!.signal!;
				return Promise.resolve(response);
			},
			'/body'
		);
		expect(selected.aborted).toBe(false);
		return value.text();
	});
	expect(result).toBe('body');
	expect(selected.aborted).toBe(true);
	expect(owner.aborted).toBe(false);
});

it('isolates direct SSR slice resources from siblings sharing one request signal', async () => {
	const request = new AbortController(),
		held = gate(),
		closed = vi.fn();
	let signal!: AbortSignal;
	const pending = executeServerComponentTaskSlice<[], number>(
		request.signal,
		undefined,
		async (task) => {
			signal = task.signal;
			ownTaskResource(signal, {}, closed);
			await held.promise;
			return 2;
		},
		[]
	);
	expect(
		await executeServerComponentTaskSlice<[], number>(
			request.signal,
			undefined,
			(task) => {
				ownTaskResource(task.signal, {}, () => {});
				return 1;
			},
			[]
		)
	).toBe(1);
	expect(closed).not.toHaveBeenCalled();
	expect(signal.aborted).toBe(false);
	expect(request.signal.aborted).toBe(false);
	held.resolve();
	expect(await pending).toBe(2);
	expect(closed).toHaveBeenCalledTimes(1);
	expect(request.signal.aborted).toBe(false);
});

it('closes inferred direct signals and preserves an authored external owner', async () => {
	const external = new AbortController();
	let signal!: AbortSignal, original!: AbortSignal;
	await executeTaskFrame({}, (task) => {
		original = task.signal;
		signal = combineTaskSignal(task.signal, external.signal);
		expect(signal.aborted).toBe(false);
		return 1;
	});
	expect(signal.aborted).toBe(true);
	expect(original.aborted).toBe(false);
	expect(external.signal.aborted).toBe(false);
});

it.each(['frame', 'slice'] as const)(
	'uses synchronous disposal when an optional async method is absent: %s',
	async (mode) => {
		const disposed = vi.fn();
		const resource = { [Symbol.dispose]: disposed, [Symbol.asyncDispose]: undefined };
		if (mode === 'frame')
			await executeTaskFrame({}, (task) => {
				task.own(resource);
			});
		else
			await executeServerComponentTaskSlice<[], void>(
				new AbortController().signal,
				undefined,
				(task) => {
					task.own(resource);
				},
				[]
			);
		expect(disposed).toHaveBeenCalledTimes(1);
	}
);

/** Exercises the same ownership contract in a task frame and a flat server slice. */
function runOwned(
	mode: 'frame' | 'slice',
	work: (task: import('./contracts.js').TaskContext) => void
) {
	return mode === 'frame'
		? executeTaskFrame({}, work)
		: executeServerComponentTaskSlice(new AbortController().signal, undefined, work, []);
}

it.each(['frame', 'slice'] as const)(
	'awaits preferred async disposal with the original receiver: %s',
	async (mode) => {
		const held = gate();
		const reads = vi.fn();
		const sync = vi.fn();
		const resource = {
			get [Symbol.asyncDispose]() {
				reads();
				return function (this: object) {
					expect(this).toBe(resource);
					return held.promise;
				};
			},
			[Symbol.dispose]: sync
		};
		let settled = false;
		const result = runOwned(mode, (task) => {
			expect(task.own(resource)).toBe(resource);
		}).then(() => {
			settled = true;
		});
		await vi.waitFor(() => expect(reads).toHaveBeenCalledTimes(1));
		expect(settled).toBe(false);
		expect(sync).not.toHaveBeenCalled();
		held.resolve();
		await result;
		expect(reads).toHaveBeenCalledTimes(1);
		expect(sync).not.toHaveBeenCalled();
	}
);

it.each(['frame', 'slice'] as const)(
	'reports disposal failure while releasing other owned resources: %s',
	async (mode) => {
		const released = vi.fn();
		await expect(
			runOwned(mode, (task) => {
				task.own({ [Symbol.dispose]: released });
				task.own({
					[Symbol.dispose]() {
						throw new Error('disposal failed');
					}
				});
			})
		).rejects.toThrow('disposal failed');
		expect(released).toHaveBeenCalledTimes(1);
	}
);
