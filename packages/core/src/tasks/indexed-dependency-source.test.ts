import { batch, flushSync } from '@exactjs/reactive';
import { indexedReactiveObjects } from '@exactjs/reactive/framework/indexed-objects';
import { createIndexedReactiveValue } from '@exactjs/reactive/framework/runtime';
import { describe, expect, it } from 'vitest';
import { activateComputationForHost } from './computation-activation.js';
import { createIndexedContinuationDependency } from './dependency-source.js';
import { createTaskOwnerRecord } from './frame-runtime.js';
import { deferTaskOwnerActivations, releaseTaskOwnerActivations } from './owner-activations.js';
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

	it('initializes deferred computations before restoration and observes only subsequent changes', () => {
		const owner = createTaskOwnerRecord('resumed-computation');
		const host = {};
		registerTaskOwnerHost(host, owner);
		deferTaskOwnerActivations(owner);
		const state = indexedReactiveObjects(['value', 'result'], {}, { value: 2, result: 0 });
		const values: number[] = [];
		const activation = activateComputationForHost(
			host,
			(value: number, _context) => {
				values.push(value);
				state.result = value + 1;
			},
			createIndexedContinuationDependency<number>(state, 0)
		);
		expect(state.result).toBe(3);
		state.value = 10;
		state.result = 42;
		releaseTaskOwnerActivations(owner, () => false);
		flushSync();
		expect(state.result).toBe(42);
		expect(values).toEqual([2]);
		state.value = 20;
		flushSync();
		expect(state.result).toBe(21);
		expect(values).toEqual([2, 20]);
		activation[Symbol.dispose]();
		state.value = 30;
		flushSync();
		expect(values).toEqual([2, 20]);
	});

	it('follows parent expression replacement and releases obsolete subscriptions', () => {
		const owner = createTaskOwnerRecord('forwarded-computation');
		const host = {};
		registerTaskOwnerHost(host, owner);
		const parent = indexedReactiveObjects(['first', 'second'], {}, { first: 1, second: 10 });
		const props = indexedReactiveObjects(
			['value'],
			{},
			{ value: createIndexedReactiveValue<number>(parent, 0) },
			true
		);
		const values: number[] = [];
		const activation = activateComputationForHost(
			host,
			(value: number, _context) => {
				values.push(value);
			},
			createIndexedContinuationDependency<number>(props, 0)
		);
		parent.first = 2;
		flushSync();
		expect(values).toEqual([1, 2]);
		props.value = createIndexedReactiveValue<number>(parent, 1);
		flushSync();
		parent.first = 3;
		parent.second = 11;
		flushSync();
		expect(values).toEqual([1, 2, 10, 11]);
		activation[Symbol.dispose]();
		parent.second = 12;
		flushSync();
		expect(values).toEqual([1, 2, 10, 11]);
	});

	it.each([false, true])(
		'releases a failed synchronous initialization (deferred=%s)',
		(deferred) => {
			const owner = createTaskOwnerRecord('failed-computation');
			const host = {};
			registerTaskOwnerHost(host, owner);
			if (deferred) deferTaskOwnerActivations(owner);
			const state = indexedReactiveObjects(['value'], {}, { value: 1 });
			expect(() =>
				activateComputationForHost(
					host,
					(_value: number, _context) => {
						throw new Error('initialization failed');
					},
					createIndexedContinuationDependency<number>(state, 0)
				)
			).toThrow('initialization failed');
			expect(owner.activationRegistrations.size).toBe(0);
			expect(owner.ownerCleanups.size).toBe(0);
			state.value = 2;
			expect(() => flushSync()).not.toThrow();
		}
	);

	it('rejects a slot outside the compiler-indexed layout', () => {
		const state = indexedReactiveObjects(['value'], {}, { value: 1 });
		expect(() => createIndexedContinuationDependency(state, 1)).toThrow(
			'Indexed continuation dependency referenced an invalid reactive slot'
		);
	});
});
