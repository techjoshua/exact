import { describe, expect, it, vi } from 'vitest';
import { computed } from './computation.js';
import { batch, captureReactiveMutations } from './internal/deps.js';
import { flushSync } from './internal/scheduler.js';
import { collectionRef, ref } from './observation.js';
import { indexedReactive, readReactiveOwnProperty } from './indexed.js';
import {
	reactiveIndexedDependencies,
	reactiveOwnDependencies,
	createIndexedReactiveValue,
	readIndexedReactiveSource,
	readIndexedReactiveSlot,
	readReactiveOwnPropertyInto
} from './indexed-base.js';
import { subscribeKeys } from './observation.js';
import { snapshot } from './snapshot.js';
import { watch } from './observation.js';
import { indexedReactiveObjects } from './framework/indexed-objects.js';
import { updateReactive } from './reconciliation.js';

describe('indexed reactive state', () => {
	it('shares a readonly direct value for each compiler-proven slot', () => {
		const state = indexedReactive<{ count: number }>(['count']);
		state.count = 1;
		const value = createIndexedReactiveValue<number>(state, 0);
		const observed: number[] = [];
		const stop = watch(() => observed.push(value.get()));

		expect(createIndexedReactiveValue(state, 0)).toBe(value);
		state.count = 2;
		flushSync();
		expect(observed).toEqual([1, 2]);
		expect(() => ref(value)!.set(3)).toThrow('Cannot write to readonly reactive value');
		stop();
	});

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
		const observed: string[][] = [];
		const stop = watch(() => observed.push([...source!.get()]));
		state.items.push('b');
		flushSync();
		state.items.splice(0, 2, state.items[1]!, state.items[0]!);
		flushSync();
		expect(observed).toEqual([['a'], ['a', 'b'], ['b', 'a']]);
		stop();
	});

	it('does not subscribe a forwarding facade read before the nested source is consumed', () => {
		const state = indexedReactive<{ items: string[] }>(['items']);
		state.items = ['a'];
		let source = collectionRef(state.items)!;
		const forwardingRuns = vi.fn();
		const stopForwarding = watch(() => {
			forwardingRuns();
			source = collectionRef(state.items)!;
		});
		const lengths: number[] = [];
		const stopLengths = watch(() => lengths.push(source.get().length));

		state.items.push('b');
		flushSync();
		state.items = ['replacement'];
		flushSync();

		expect(forwardingRuns).toHaveBeenCalledTimes(1);
		expect(lengths).toEqual([1, 2, 1]);
		stopLengths();
		stopForwarding();
	});

	it('reads indexed fields without granting arbitrary accessors execution', () => {
		const state = indexedReactive<{ value: number }>(['value']);
		state.value = 3;
		expect(readReactiveOwnProperty(state, 'value')).toEqual({ present: true, value: 3 });
		const cell = { value: undefined as unknown };
		expect(readReactiveOwnPropertyInto(state, 'value', cell)).toBe(true);
		expect(cell.value).toBe(3);

		const accessor = vi.fn(() => 4);
		const untrusted = Object.defineProperty({}, 'value', { get: accessor });
		expect(readReactiveOwnProperty(untrusted, 'value')).toEqual({ present: false });
		expect(readReactiveOwnPropertyInto(untrusted, 'value', cell)).toBe(false);
		expect(cell.value).toBeUndefined();
		expect(accessor).not.toHaveBeenCalled();
	});

	it('resolves compiler-known fields to compact dependency indexes', () => {
		const state = indexedReactive<{ count: number }>(['count']);
		state.count = 1;
		expect(reactiveOwnDependencies(state, ['count'])?.keys).toEqual([0]);
		expect(reactiveOwnDependencies(state, ['missing'])).toBeUndefined();
		expect(reactiveIndexedDependencies(state, [0])?.keys).toEqual([0]);
		expect(reactiveIndexedDependencies(state, [1])).toBeUndefined();
	});

	it('reads a retained indexed source without evaluating a forwarded computation', () => {
		const source = indexedReactive<{ label: string }>(['label']);
		source.label = 'first';
		const forwarded = computed(() => source.label);
		const props = indexedReactiveObjects<{ label: string }>(
			['label'],
			{},
			{ label: forwarded } as unknown as { label: string },
			true
		);

		expect(readIndexedReactiveSource(props, 0)).toEqual({ present: true, value: forwarded });
		expect(readIndexedReactiveSource(props, 1)).toEqual({ present: false });
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

	it('seeds readonly indexed props and updates numeric dependencies through reconciliation', () => {
		const props = indexedReactiveObjects<{ label: string; children?: object }>(
			['label', 'children'],
			{
				readonly: true,
				passthroughKeys: ['children'],
				onReadonlyWrite(key) {
					throw new TypeError(`readonly ${String(key)}`);
				}
			},
			{ label: 'first', children: { type: 'child' } }
		);
		const child = props.children;
		const seen: string[] = [];
		const stop = watch(() => seen.push(readIndexedReactiveSlot(props, 0) as string));

		updateReactive(props, { label: 'second', children: child });
		flushSync();

		expect(seen).toEqual(['first', 'second']);
		expect(props.children).toBe(child);
		expect(() => {
			props.label = 'authored write';
		}).toThrow('readonly label');
		stop();
	});

	it('retains compiler-owned live prop values and resolves them at indexed read time', () => {
		const state = indexedReactive<{ label: string }>(['label']);
		state.label = 'first';
		const live = computed(() => state.label);
		const props = indexedReactiveObjects<{ label: string }>(
			['label'],
			{ readonly: true },
			{ label: live as unknown as string },
			true
		);
		const seen: string[] = [];
		const stop = watch(() => seen.push(readIndexedReactiveSlot(props, 0) as string));

		state.label = 'second';
		flushSync();

		expect(seen).toEqual(['first', 'second']);
		stop();
	});

	it('invalidates an indexed live object prop when its computed selection changes', () => {
		const state = indexedReactive<{ items: Array<{ id: string }>; selectedId: string }>([
			'items',
			'selectedId'
		]);
		state.items = [{ id: 'first' }, { id: 'second' }];
		state.selectedId = '';
		const live = computed(() => state.items.find((item) => item.id === state.selectedId));
		const props = indexedReactiveObjects<{ item?: { id: string } }>(
			['item'],
			{ readonly: true },
			{ item: live as unknown as { id: string } },
			true
		);
		const seen: Array<string | undefined> = [];
		const stop = watch(() =>
			seen.push((readIndexedReactiveSlot(props, 0) as { id: string } | undefined)?.id)
		);

		state.selectedId = 'second';
		flushSync();

		expect(seen).toEqual([undefined, 'second']);
		stop();
	});
});
