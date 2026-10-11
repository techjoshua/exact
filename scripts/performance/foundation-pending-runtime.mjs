import assert from 'node:assert/strict';
import {
	reactive,
	computed,
	flushSync,
	createEffectScope,
	withEffectScope,
	inspectComputed
} from '../../packages/reactive/dist/index.js';
import { createPendingReactiveTransaction } from '../../packages/reactive/dist/framework/transactions.js';
import { elapsed } from './foundation-measurement.mjs';

/** Measures bounded transaction work and computed-owner teardown with correctness controls. */
export function measurePendingRuntime() {
	const metrics = {};
	const transactions = 250;
	for (const input of ['direct', 'helper'])
		for (const width of [1, 16, 64]) {
			const state = reactive(
				Object.fromEntries(Array.from({ length: width }, (_, index) => ['field' + index, 0]))
			);
			const prepare = (offset = 0) => {
				const pending = [];
				for (let generation = 0; generation < transactions; generation++) {
					const transaction = createPendingReactiveTransaction(state);
					if (input === 'direct')
						for (let index = 0; index < width; index++)
							transaction.write(state, 'field' + index, offset + generation + 1);
					else
						transaction.helper(writeFields)(
							transaction.view(state),
							width,
							offset + generation + 1
						);
					pending.push(transaction);
				}
				return pending;
			};
			const staged = elapsed(prepare);
			for (let index = 0; index < width; index++)
				assert.equal(state['field' + index], 0, 'Staging must leave committed data unchanged');
			const publication = elapsed(() => {
				for (const transaction of staged.value) transaction.commit();
			});
			assert.equal(state.field0, transactions);
			for (let index = 0; index < width; index++)
				assert.equal(state['field' + index], transactions);
			const discarded = prepare(transactions);
			const discard = elapsed(() => {
				for (const transaction of discarded) transaction.discard();
			});
			for (let index = 0; index < width; index++)
				assert.equal(state['field' + index], transactions, 'Discard must preserve committed data');
			assert.throws(() => discarded[0].write(state, 'field0', -1), /closed/);
			metrics[`${input}Stage${width}NsPerWrite`] = (staged.duration * 1e6) / (transactions * width);
			metrics[`${input}Publish${width}NsPerWrite`] =
				(publication.duration * 1e6) / (transactions * width);
			metrics[`${input}Discard${width}NsPerTransaction`] = (discard.duration * 1e6) / transactions;
		}
	const count = 2000;
	for (const cached of [false, true]) {
		const scope = createEffectScope();
		const source = reactive({ value: 1 });
		let computations = 0;
		const values = withEffectScope(scope, () =>
			Array.from({ length: count }, () =>
				computed(() => {
					computations++;
					return source.value;
				})
			)
		);
		if (cached) for (const value of values) assert.equal(value.get(), 1);
		const stopped = elapsed(() => scope.stop());
		source.value = 2;
		const read = elapsed(() => {
			let sum = 0;
			for (const value of values) sum += value.get();
			return sum;
		});
		assert.equal(read.value, count * (cached ? 1 : 2));
		// Cached dependency descriptors remain inspectable after their memberships detach.
		for (const value of values) {
			assert.equal(inspectComputed(value).state, 'stopped');
			assert.equal(inspectComputed(value).sinks, 0);
		}
		source.value = 3;
		flushSync();
		for (const value of values) assert.equal(value.get(), cached ? 1 : 2);
		assert.equal(computations, count, 'Stopped values must not recompute');
		metrics[`${cached ? 'cached' : 'unread'}StopNsPerComputed`] = (stopped.duration * 1e6) / count;
		metrics[`${cached ? 'cached' : 'unread'}StoppedReadNsPerComputed`] =
			(read.duration * 1e6) / count;
	}
	return metrics;
}

function writeFields(record, width, value) {
	for (let index = 0; index < width; index++) record['field' + index] = value;
}
