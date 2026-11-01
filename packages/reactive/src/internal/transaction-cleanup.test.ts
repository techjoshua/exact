import { expect, it } from 'vitest';
import {
	batch,
	captureReactiveMutations,
	publishBatch,
	recordTransactionCleanup,
	hasActiveReactiveTransaction
} from './deps.js';
import { reactive } from '../index.js';

it.each([false, true])(
	'transfers nested cleanup ownership until the outer batch settles (failure: %s)',
	(fail) => {
		const released: string[] = [];
		const run = () =>
			batch(() => {
				batch(() => recordTransactionCleanup(() => released.push('child')));
				publishBatch(() => recordTransactionCleanup(() => released.push('event')));
				expect(released).toEqual([]);
				if (fail) throw new Error('rollback');
			});
		if (fail) expect(run).toThrow('rollback');
		else run();
		expect(released).toEqual(['event', 'child']);
	}
);

it.each(['discard', 'rollback'] as const)(
	'retains cleanup until an inverse journal is retired by %s',
	(operation) => {
		let released = 0;
		const journal = captureReactiveMutations(() => {
			batch(() => recordTransactionCleanup(() => released++));
		});
		expect(released).toBe(0);
		journal[operation]();
		journal.discard();
		journal.rollback();
		expect(released).toBe(1);
	}
);

it('ignores cleanup outside rollback-capable transactions', () => {
	let released = 0;
	recordTransactionCleanup(() => released++);
	publishBatch(() => recordTransactionCleanup(() => released++));
	expect(released).toBe(0);
});

function catchValue(action: () => void): { caught: boolean; value: unknown } {
	let caught = false;
	let value: unknown;
	try {
		action();
	} catch (error) {
		caught = true;
		value = error;
	}
	return { caught, value };
}

it.each([0, undefined])(
	'consumes every cleanup once and preserves exact secondary %s',
	(primary) => {
		const calls: number[] = [];
		const journal = captureReactiveMutations(() => {
			recordTransactionCleanup(() => calls.push(1));
			recordTransactionCleanup(() => {
				calls.push(2);
				throw primary;
			});
			recordTransactionCleanup(() => {
				calls.push(3);
				throw primary;
			});
		});
		const result = catchValue(() => journal.discard());
		expect(result.caught).toBe(true);
		expect(result.value).toBe(primary);
		expect(calls).toEqual([3, 2, 1]);
		journal.discard();
		journal.rollback();
		expect(calls).toEqual([3, 2, 1]);
		const next = captureReactiveMutations(() => recordTransactionCleanup(() => calls.push(4)));
		next.rollback();
		expect(calls).toEqual([3, 2, 1, 4]);
	}
);

for (const run of [batch, captureReactiveMutations])
	for (const primary of [0, undefined, { body: true }])
		it(`keeps callback primary ${String(primary)} through restoration and cleanup (${run.name})`, () => {
			const restoration = { restoration: true };
			let armed = false;
			const raw = new Proxy(
				{ value: 'base' },
				{
					defineProperty(target, key, descriptor) {
						if (armed && descriptor.value === 'base') throw restoration;
						return Reflect.defineProperty(target, key, descriptor);
					}
				}
			);
			const state = reactive(raw);
			const calls: string[] = [];
			const result = catchValue(() =>
				run(() => {
					recordTransactionCleanup(() => calls.push('last'));
					recordTransactionCleanup(() => {
						calls.push('first');
						throw undefined;
					});
					state.value = 'optimistic';
					armed = true;
					throw primary;
				})
			);
			armed = false;
			expect(result.caught).toBe(true);
			expect(result.value).toBe(primary);
			expect(calls).toEqual(['first', 'last']);
			expect(state.value).toBe('optimistic');
			expect(hasActiveReactiveTransaction()).toBe(false);
			const next = captureReactiveMutations(() => {
				state.value = 'next';
			});
			next.rollback();
			expect(state.value).toBe('optimistic');
		});

it.each([0, undefined])(
	'prioritizes later reentrant restoration %s over earlier release failure',
	(primary) => {
		const secondary = { cleanup: true };
		let armed = false;
		const raw = new Proxy(
			{ value: 'base' },
			{
				defineProperty(target, key, descriptor) {
					if (armed && descriptor.value === 'base') throw primary;
					return Reflect.defineProperty(target, key, descriptor);
				}
			}
		);
		const state = reactive(raw);
		const calls: string[] = [];
		const failing = captureReactiveMutations(() => {
			state.value = 'optimistic';
			recordTransactionCleanup(() => {
				calls.push('failing');
				throw secondary;
			});
		});
		const first = captureReactiveMutations(() => {
			recordTransactionCleanup(() => calls.push('last'));
			recordTransactionCleanup(() => {
				calls.push('first');
				failing.rollback();
				throw secondary;
			});
		});
		armed = true;
		const result = catchValue(() => first.discard());
		armed = false;
		expect(result.caught).toBe(true);
		expect(result.value).toBe(primary);
		expect(calls).toEqual(['first', 'last', 'failing']);
		expect(state.value).toBe('optimistic');
		const next = captureReactiveMutations(() => {
			state.value = 'next';
		});
		next.rollback();
		expect(state.value).toBe('optimistic');
		expect(hasActiveReactiveTransaction()).toBe(false);
	}
);
