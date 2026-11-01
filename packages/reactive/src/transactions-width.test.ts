import { expect, it } from 'vitest';
import {
	batch,
	publishBatch,
	reactive,
	watch,
	flushSync,
	captureReactiveMutations
} from './index.js';
import { recordTransactionCleanup } from './internal/deps.js';
import { verifyWideTransactions } from '../../component-composition-corpus/test-support/wide-transaction-journey.mjs';

it.each([3, 140_000])('retains nested atomic and journal behavior across %i writes', (count) => {
	verifyWideTransactions(
		{ batch, publishBatch, reactive, watch, flushSync, captureReactiveMutations },
		count
	);
});

it.each([false, true])('releases wide nested cleanup leases, rollback=%s', (rollback) => {
	const count = 140_000;
	let released = 0;
	const release = () => released++;
	const reason = { reason: 'owner failed' };
	let failure;
	try {
		batch(() => {
			batch(() => {
				for (let index = 0; index < count; index++) recordTransactionCleanup(release);
			});
			if (rollback) throw reason;
		});
	} catch (error) {
		failure = error;
	}
	expect(failure).toBe(rollback ? reason : undefined);
	expect(released).toBe(count);
	let next = 0;
	batch(() => recordTransactionCleanup(() => next++));
	expect(next).toBe(1);
});
