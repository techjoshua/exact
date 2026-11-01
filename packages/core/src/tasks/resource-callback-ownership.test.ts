import { expect, it, vi, onTestFinished } from 'vitest';
import {
	executeTaskFrame,
	currentTaskFrameRecord,
	withTaskFrameForSignal
} from './frame-runtime.js';
import {
	taskTimeout,
	taskInterval,
	taskAnimationFrame,
	taskIdleCallback,
	ownTaskResource
} from './resources.js';
import { combineTaskSignal } from './signals.js';

/** Holds producer or child completion at an observable ownership boundary. */
function gate() {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => (release = resolve));
	return { promise, release };
}

it.each(
	['timeout', 'interval', 'animation', 'idle'].flatMap((kind) =>
		['direct', 'adapted'].map((signal) => ({ kind, signal }))
	)
)(
	'retains child settlement from a $kind callback with a $signal signal',
	async ({ kind, signal }) => {
		vi.useFakeTimers();
		onTestFinished(() => {
			vi.useRealTimers();
			vi.unstubAllGlobals();
		});
		vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) =>
			setTimeout(() => callback(10), 10)
		);
		vi.stubGlobal('cancelAnimationFrame', clearTimeout);
		vi.stubGlobal(
			'requestIdleCallback',
			(callback: (deadline: { didTimeout: boolean; timeRemaining(): number }) => void) =>
				setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 5 }), 10)
		);
		vi.stubGlobal('cancelIdleCallback', clearTimeout);
		const body = gate(),
			childGate = gate();
		let child: Promise<void> | undefined;
		let settled = false;
		const parent = executeTaskFrame({}, (task) => {
			const selected =
				signal === 'adapted'
					? combineTaskSignal(task.signal, new AbortController().signal)
					: task.signal;
			const callback = () => {
				child = executeTaskFrame({}, () => childGate.promise);
				body.release();
			};
			if (kind === 'timeout') taskTimeout(selected, callback, 10);
			else if (kind === 'interval') taskInterval(selected, callback, 10);
			else if (kind === 'animation') taskAnimationFrame(selected, callback);
			else taskIdleCallback(selected, callback);
			return body.promise;
		}).then(() => {
			settled = true;
		});
		await vi.advanceTimersByTimeAsync(10);
		expect(child).toBeDefined();
		const premature = settled;
		childGate.release();
		await Promise.all([parent, child]);
		expect(premature).toBe(false);
		expect(settled).toBe(true);
		await expect(executeTaskFrame({}, () => 42)).resolves.toBe(42);
	}
);

it('waits for asynchronous cleanup registered through an adapted owner signal', async () => {
	const held = gate();
	let settled = false;
	const disposed = vi.fn(() => held.promise);
	const parent = executeTaskFrame({}, (task) => {
		const signal = combineTaskSignal(task.signal, new AbortController().signal);
		ownTaskResource(signal, {}, disposed);
	}).then(() => {
		settled = true;
	});
	await vi.waitFor(() => expect(disposed).toHaveBeenCalledTimes(1));
	const premature = settled;
	held.release();
	await parent;
	expect(premature).toBe(false);
	expect(settled).toBe(true);
});

it('restores the signal owner and clears unrelated ambient ownership for unowned callbacks', async () => {
	const held = gate();
	let ownerSignal!: AbortSignal;
	let ownerFrame: ReturnType<typeof currentTaskFrameRecord>;
	const owner = executeTaskFrame({}, (task) => {
		ownerSignal = task.signal;
		ownerFrame = currentTaskFrameRecord();
		return held.promise;
	});
	try {
		await executeTaskFrame({}, () => {
			const sibling = currentTaskFrameRecord();
			withTaskFrameForSignal(combineTaskSignal(ownerSignal, new AbortController().signal), () => {
				expect(currentTaskFrameRecord()).toBe(ownerFrame);
			});
			expect(currentTaskFrameRecord()).toBe(sibling);
			expect(() =>
				withTaskFrameForSignal(new AbortController().signal, () => {
					expect(currentTaskFrameRecord()).toBeUndefined();
					throw new Error('callback');
				})
			).toThrow('callback');
			expect(currentTaskFrameRecord()).toBe(sibling);
		});
	} finally {
		held.release();
		await owner;
	}
	expect(currentTaskFrameRecord()).toBeUndefined();
});

it.each(['direct', 'adapted'])(
	'propagates cancellation to a child created by a callback with a %s signal',
	async (adaptation) => {
		vi.useFakeTimers();
		onTestFinished(() => {
			vi.useRealTimers();
		});
		const controller = new AbortController();
		const body = gate();
		const held = gate();
		let childSignal!: AbortSignal;
		let child!: Promise<void>;
		const parent = executeTaskFrame({ controller }, (task) => {
			const signal =
				adaptation === 'adapted'
					? combineTaskSignal(task.signal, new AbortController().signal)
					: task.signal;
			taskTimeout(
				signal,
				() => {
					child = executeTaskFrame({}, (context) => {
						childSignal = context.signal;
						return held.promise;
					});
					body.release();
				},
				10
			);
			return body.promise;
		});
		const parentOutcome = Promise.allSettled([parent]);
		await vi.advanceTimersByTimeAsync(10);
		const childOutcome = Promise.allSettled([child]);
		controller.abort('owner-cancelled');
		expect(childSignal.aborted).toBe(true);
		expect(childSignal.reason).toBe('owner-cancelled');
		held.release();
		expect((await parentOutcome)[0]?.status).toBe('rejected');
		expect((await childOutcome)[0]?.status).toBe('rejected');
	}
);
