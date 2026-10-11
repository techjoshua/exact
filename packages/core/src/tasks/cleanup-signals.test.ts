import { expect, it } from 'vitest';
import { executeTaskFrame } from './frame-runtime.js';
import { combineTaskSignal } from './signals.js';
import {
	combineExistingTaskSignal,
	withExistingTaskSignal,
	withExistingAbortSignal
} from './cleanup-signals.js';

it.each([false, true])(
	'retains explicit producer signal identity in cleanup, cancellation=%s',
	async (cancel) => {
		const owner = new AbortController();
		let received!: AbortSignal;
		const result = executeTaskFrame({ controller: owner }, (task) => {
			received = combineTaskSignal(task.signal, task.signal);
			task.cleanup(() => {
				expect(combineExistingTaskSignal(task.signal, task.signal)).toBe(received);
				expect(withExistingTaskSignal({ signal: task.signal }, task.signal).signal).toBe(received);
				const options = withExistingAbortSignal(
					{ signal: task.signal, capture: true },
					task.signal
				);
				expect(typeof options === 'object' && options.signal).toBe(received);
			});
			if (cancel) return new Promise<void>(() => {});
		});
		if (cancel) {
			owner.abort('cancel');
			await expect(result).rejects.toBeDefined();
		} else await result;
		expect(received.aborted).toBe(true);
	}
);

it('preserves absent signals and native event flags without enrolling cleanup work', () => {
	const owner = new AbortController();
	expect(combineExistingTaskSignal(owner.signal, undefined)).toBeUndefined();
	expect(withExistingTaskSignal(undefined, owner.signal)).toBeUndefined();
	expect(withExistingTaskSignal({ value: 7 }, owner.signal)).toEqual({ value: 7 });
	expect(withExistingAbortSignal(true, owner.signal)).toBe(true);
	expect(withExistingAbortSignal(false, owner.signal)).toBe(false);
	expect(withExistingAbortSignal(undefined, owner.signal)).toBeUndefined();
	const external = new AbortController();
	expect(combineExistingTaskSignal(owner.signal, external.signal)?.aborted).toBe(false);
	expect(owner.signal.aborted).toBe(false);
});

it('evaluates supplied options getters once while adapting the explicit signal', () => {
	const owner = new AbortController();
	let reads = 0;
	const options = {
		get signal() {
			reads++;
			return owner.signal;
		},
		capture: true
	};
	expect(withExistingAbortSignal(options, owner.signal)).toEqual({
		signal: owner.signal,
		capture: true
	});
	expect(reads).toBe(1);
});
