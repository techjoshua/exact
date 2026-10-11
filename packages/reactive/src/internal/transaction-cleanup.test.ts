import { expect, it } from 'vitest';
import { batch, captureReactiveMutations, publishBatch, recordTransactionCleanup } from './deps.js';

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
