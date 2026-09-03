import { batch, flushSync } from '@exactjs/reactive';
import { indexedReactiveObjects } from '@exactjs/reactive/framework/indexed-objects';
import { describe, expect, it } from 'vitest';
import { activateComputationForHost } from './computation-activation.js';
import { createIndexedContinuationDependency } from './dependency-source.js';
import { createTaskOwnerRecord } from './frame-runtime.js';
import { registerTaskOwnerHost } from './owner-hosts.js';

describe('indexed task dependency sources', () => {
	it('observes a compiler-indexed activation input without a computed reader', () => {
		const owner = createTaskOwnerRecord('indexed-computation');
		const host = {};
		registerTaskOwnerHost(host, owner);
		const state = indexedReactiveObjects(['value'], {}, { value: 1 });
		const values: number[] = [];
		const activation = activateComputationForHost(
			host,
			(value: number, _context) => values.push(value),
			createIndexedContinuationDependency<number>(state, 0)
		);

		expect(values).toEqual([1]);
		batch(() => {
			state.value = 2;
			state.value = 3;
		});
		flushSync();
		expect(values).toEqual([1, 3]);
		activation[Symbol.dispose]();
		state.value = 4;
		flushSync();
		expect(values).toEqual([1, 3]);
	});

	it('rejects a slot outside the compiler-indexed layout', () => {
		const state = indexedReactiveObjects(['value'], {}, { value: 1 });
		expect(() => createIndexedContinuationDependency(state, 1)).toThrow(
			'Indexed continuation dependency referenced an invalid reactive slot'
		);
	});
});
