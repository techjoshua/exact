import { describe, expect, it } from 'vitest';
import { reactive } from './reactive.js';
import { indexedReactive } from './indexed.js';
import { batch } from './internal/deps.js';
import { flushSync } from './internal/scheduler.js';
import { unwrap } from './internal/values.js';
import { ref, watch } from './observation.js';
import { writeIndexedReactiveValue, writeReactive } from './writes.js';

import {
	assignmentIdentityCases,
	verifyAssignmentIdentity
} from '../../component-composition-corpus/test-support/assignment-identity-journey.mjs';

for (const indexed of [false, true])
	for (const entry of ['native', 'compiler', 'ref'] as const)
		for (const array of [false, true])
			for (const equal of [false, true])
				it(`replaces ${indexed ? 'indexed' : 'proxy'} ${entry} ${array ? 'array' : 'object'} with ${equal ? 'equal' : 'changed'} storage`, () => {
					verifyAssignmentIdentity(
						{
							reactive,
							indexedReactive,
							watch,
							ref,
							flushSync,
							unwrap,
							writeReactive,
							writeIndexedReactiveValue
						},
						{ indexed, entry, array, equal }
					);
				});

describe('assignment failure ownership', () => {
	it.each([false, true])(
		'retains native throwing-setter side effects outside a batch and rolls back inside one (%s)',
		(transaction) => {
			const state = reactive({
				count: 0,
				get value() {
					throw new Error('unexpected getter');
				},
				set value(_value: number) {
					this.count++;
					throw new Error('setter');
				}
			});
			const work = () => writeReactive(state, ['value'], 1);
			expect(() => (transaction ? batch(work) : work())).toThrow('setter');
			expect(state.count).toBe(transaction ? 0 : 1);
		}
	);

	for (const indexed of [false, true])
		it.each(['native', 'compiler', 'ref'] as const)(
			`restores the original ${indexed ? 'indexed' : 'proxy'} reference after explicit batch failure through %s`,
			(entry) => {
				const state = indexed
					? indexedReactive<{ item: { value: number } }>(['item'])
					: reactive({ item: { value: 1 } });
				const initial = { value: 1 };
				state.item = initial;
				const source = ref(state.item)!;
				const next = { value: 2 };
				expect(() =>
					batch(() => {
						if (entry === 'native') state.item = next;
						else if (entry === 'ref') source.set(next);
						else if (indexed) writeIndexedReactiveValue(state, 0, next);
						else writeReactive(state, ['item'], next);
						state.item.value = 3;
						throw new Error('abort');
					})
				).toThrow('abort');
				expect(unwrap(state.item)).toBe(initial);
				expect(initial.value).toBe(1);
				expect(next.value).toBe(2);
			}
		);
});

for (const indexed of [false, true]) {
	for (const entry of ['native', 'compiler', 'ref'] as const) {
		it(`preserves native descriptor and accessor completion for ${indexed ? 'indexed' : 'proxy'} ${entry}`, () => {
			const state = indexed
				? indexedReactive<{ item: object; count: number }>(['item', 'count'])
				: reactive({ item: {}, count: 0 });
			state.item = {};
			state.count = 0;
			const source = ref(state.item)!;
			const rhs = {};
			const assign = () => {
				if (entry === 'native') state.item = rhs;
				else if (entry === 'ref') source.set(rhs);
				else if (indexed) writeIndexedReactiveValue(state, 0, rhs);
				else writeReactive(state, ['item'], rhs);
			};
			const raw = unwrap(state);
			Object.defineProperty(raw, 'item', { value: rhs, writable: false, configurable: true });
			expect(assign).toThrow(TypeError);
			let received: unknown;
			Object.defineProperty(raw, 'item', {
				configurable: true,
				get() {
					throw new Error('unexpected getter');
				},
				set(value: unknown) {
					received = value;
					this.count++;
				}
			});
			assign();
			assign();
			expect(received).toBe(rhs);
			expect(state.count).toBe(2);
			Object.defineProperty(raw, 'item', {
				configurable: true,
				get() {
					throw new Error('unexpected getter');
				},
				set(_value: unknown) {
					this.count++;
					throw new Error('setter');
				}
			});
			expect(assign).toThrow('setter');
			expect(state.count).toBe(3);
			expect(() => batch(assign)).toThrow('setter');
			expect(state.count).toBe(3);
		});
	}
}

it.each(assignmentIdentityCases)('shares native assignment case %j', (options) => {
	verifyAssignmentIdentity(
		{
			reactive,
			indexedReactive,
			watch,
			ref,
			flushSync,
			unwrap,
			writeReactive,
			writeIndexedReactiveValue
		},
		options
	);
});
