import { describe, expect, it, vi } from 'vitest';
import { computed } from './computation.js';
import { batch, captureReactiveMutations } from './internal/deps.js';
import { flushSync } from './internal/scheduler.js';
import { collectionRef } from './observation.js';
import { indexedReactive, readReactiveOwnProperty } from './indexed.js';
import { reactiveOwnDependencies, readIndexedReactiveSlot } from './indexed-base.js';
import { subscribeKeys } from './observation.js';
import { snapshot } from './snapshot.js';
import { watch } from './observation.js';

describe('indexed reactive state', () => {
	it('tracks stable slots while preserving an ordinary inspectable facade', () => {
		const mutations = vi.fn();
		const state = indexedReactive<{ count?: number; label?: string }>(['label', 'count'], {
			onMutation: mutations
		});
		const observed: Array<number | undefined> = [];
		const stop = watch(() => observed.push(state.count));

		state.count = 1;
		batch(() => {
			state.count = 2;
			state.count = 3;
		});
		flushSync();

		expect(observed).toEqual([undefined, 3]);
		expect(Object.keys(state)).toEqual(['count']);
		expect(snapshot(state)).toEqual({ count: 3 });
		expect(mutations).toHaveBeenCalledWith('count', 'set');
		stop();
	});

	it('retains nested proxy behavior, dynamic keys, deletion, and optimistic rollback', () => {
		const state = indexedReactive<{
			record?: { value: number };
			[key: string]: unknown;
		}>(['record']);
		state.record = { value: 1 };
		state.dynamic = 'present';
		const journal = captureReactiveMutations(() => {
			state.record!.value = 2;
			state.dynamic = 'changed';
		});
		journal.rollback();

		expect(state.record?.value).toBe(1);
		expect(state.dynamic).toBe('present');
		expect(delete state.dynamic).toBe(true);
		expect('dynamic' in state).toBe(false);
	});

	it('shares compiler layouts without sharing instance-local dynamic fields', () => {
		const keys = ['known'] as const;
		const first = indexedReactive<{ known?: number; [key: string]: unknown }>(keys);
		const second = indexedReactive<{ known?: number; [key: string]: unknown }>(keys);
		first.known = 1;
		second.known = 2;
		first.dynamic = 'first';
		second.dynamic = 'second';

		expect(first).toEqual({ known: 1, dynamic: 'first' });
		expect(second).toEqual({ known: 2, dynamic: 'second' });
		delete first.dynamic;
		expect(second.dynamic).toBe('second');
	});

	it('exposes one stable structural source for an indexed collection', () => {
		const state = indexedReactive<{ items: string[] }>(['items']);
		state.items = ['a'];
		const source = collectionRef(state.items);
		expect(source).toBe(collectionRef(state.items));
		const observed: number[] = [];
		const stop = watch(() => observed.push(source!.get().length));
		state.items.push('b');
		flushSync();
		expect(observed).toEqual([1, 2]);
		stop();
	});

	it('reads indexed fields without granting arbitrary accessors execution', () => {
		const state = indexedReactive<{ value: number }>(['value']);
		state.value = 3;
		expect(readReactiveOwnProperty(state, 'value')).toEqual({ present: true, value: 3 });

		const accessor = vi.fn(() => 4);
		const untrusted = Object.defineProperty({}, 'value', { get: accessor });
		expect(readReactiveOwnProperty(untrusted, 'value')).toEqual({ present: false });
		expect(accessor).not.toHaveBeenCalled();
	});

	it('resolves compiler-known fields to compact dependency indexes', () => {
		const state = indexedReactive<{ count: number }>(['count']);
		state.count = 1;
		expect(reactiveOwnDependencies(state, ['count'])?.keys).toEqual([0]);
		expect(reactiveOwnDependencies(state, ['missing'])).toBeUndefined();
	});

	it('reads compiler-known slots directly while retaining dependency tracking', () => {
		const state = indexedReactive<{ count: number }>(['count']);
		state.count = 1;
		const seen: number[] = [];
		const stop = watch(() => seen.push(readIndexedReactiveSlot(state, 0) as number));
		state.count = 2;
		flushSync();

		expect(seen).toEqual([1, 2]);
		expect(() => readIndexedReactiveSlot(state, 1)).toThrow('invalid indexed slot');
		stop();
	});

	it('keeps transitive computed reads synchronously current through indexed slots', () => {
		const state = indexedReactive<{ count: number }>(['count']);
		state.count = 1;
		const doubled = computed(() => (readIndexedReactiveSlot(state, 0) as number) * 2);
		const label = computed(() => `count:${doubled.get()}`);

		expect(label.get()).toBe('count:2');
		state.count = 2;
		expect(label.get()).toBe('count:4');
	});

	it('coalesces compiler-selected field dependencies into one reaction', () => {
		const state = indexedReactive<{ count: number; label: string }>(['count', 'label']);
		state.count = 0;
		state.label = 'first';
		const dependencies = reactiveOwnDependencies(state, ['count', 'label'])!;
		const seen: Array<[number, string]> = [];
		subscribeKeys(dependencies.target, dependencies.keys, () =>
			seen.push([state.count, state.label])
		);

		batch(() => {
			state.count = 1;
			state.label = 'second';
		});
		flushSync();

		expect(seen).toEqual([[1, 'second']]);
	});
});
