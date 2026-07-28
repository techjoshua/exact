import { describe, expect, it, vi } from 'vitest';
import {
	computed,
	flushSync,
	mutateReactiveArray,
	mutateReactiveCollection,
	reactive,
	ref,
	registerReactiveListKey,
	snapshot,
	subscribe,
	unwrap,
	updateReactiveValue,
	watch,
	writeReactive
} from './index.js';

describe('@exactjs/reactive collections', () => {
	it('notifies array growth and preserves reused identities during an unregistered prepend', () => {
		const state = reactive({ activity: [] as Array<{ id: string; message: string }> });
		const lengths: number[] = [];
		const scheduledSnapshots: string[][] = [];
		watch(() => lengths.push(state.activity.length));
		watch(() => state.activity.map((item) => item.id), undefined, {
			onSchedule: () => scheduledSnapshots.push(state.activity.map((item) => item.id))
		});
		writeReactive(state, ['activity'], [{ id: 'first', message: 'First' }]);
		writeReactive(
			state,
			['activity'],
			[{ id: 'second', message: 'Second' }, ...state.activity.slice(0, 9)]
		);
		flushSync();

		expect(state.activity.map((item) => item.id)).toEqual(['second', 'first']);
		expect(lengths).toEqual([0, 2]);
		expect(scheduledSnapshots).toEqual([['first']]);
	});

	it('keeps keyed task and activity arrays valid across repeated component-style updates', () => {
		const state = reactive({
			tasks: [
				{ id: 'task', status: 'backlog', title: 'Task' },
				{ id: 'other', status: 'active', title: 'Other' }
			],
			activity: [] as Array<{ id: string; message: string }>
		});
		registerReactiveListKey(state.tasks, (item) => (item as { id: string }).id);
		watch(() => {
			if (state.activity.length)
				registerReactiveListKey(state.activity, (item) => (item as { id: string }).id);
		});
		let activityId = 0;
		const update = (status: string) => {
			const task = state.tasks.find((item) => item.id === 'task')!;
			const nextTask = { ...task, status };
			writeReactive(
				state,
				['tasks'],
				state.tasks.map((item) => (item.id === task.id ? nextTask : item))
			);
			writeReactive(
				state,
				['activity'],
				[{ id: String(++activityId), message: `Moved to ${status}` }, ...state.activity.slice(0, 9)]
			);
			flushSync();
		};

		update('active');
		update('backlog');

		expect(state.tasks.map((item) => item.id)).toEqual(['task', 'other']);
		expect(state.activity.map((item) => item.id)).toEqual(['2', '1']);
	});

	it('invalidates array length and removed indexes for direct writes', () => {
		const state = reactive({ items: ['a', 'b', 'c'] as Array<string | undefined> });
		const lengths: number[] = [];
		const removed: Array<string | undefined> = [];
		watch(() => lengths.push(state.items.length));
		watch(() => removed.push(state.items[2]));

		state.items[5] = 'f';
		flushSync();
		state.items.length = 1;
		flushSync();

		expect(lengths).toEqual([3, 6, 1]);
		expect(removed).toEqual(['c', undefined]);
	});

	it('leaves non-plain objects intact', () => {
		const date = new Date(0);
		const map = new Map([['answer', 42]]);
		const state = reactive({ date, map });
		expect(state.date).toBe(date);
		expect(state.date.getTime()).toBe(0);
		expect(state.map.get('answer')).toBe(42);
		expect(reactive(date)).toBe(date);
		expect(snapshot(date)).toBe(date);
	});

	it('tracks Map keys independently and iteration structurally', () => {
		const state = reactive({
			values: new Map<string, { count: number }>([
				['a', { count: 1 }],
				['b', { count: 2 }]
			])
		});
		const a = vi.fn(() => state.values.get('a')?.count);
		const b = vi.fn(() => state.values.has('b'));
		const entries = vi.fn(() => [...state.values].map(([key, value]) => `${key}:${value.count}`));
		watch(a);
		watch(b);
		watch(entries);

		expect(state.values.set('a', { count: 3 })).toBe(state.values);
		flushSync();
		expect(a).toHaveBeenCalledTimes(2);
		expect(b).toHaveBeenCalledTimes(1);
		expect(entries).toHaveBeenCalledTimes(2);

		expect(state.values.delete('missing')).toBe(false);
		flushSync();
		expect(entries).toHaveBeenCalledTimes(2);
		expect(state.values.delete('b')).toBe(true);
		flushSync();
		expect(b).toHaveBeenCalledTimes(2);
		expect(entries).toHaveBeenCalledTimes(3);
	});

	it('preserves Set uniqueness, return values, and structural dependencies', () => {
		const state = reactive({ selected: new Set(['a']) });
		const hasA = vi.fn(() => state.selected.has('a'));
		const values = vi.fn(() => [...state.selected].join(','));
		const sizes = vi.fn(() => state.selected.size);
		watch(hasA);
		watch(values);
		watch(sizes);

		expect(state.selected.add('a')).toBe(state.selected);
		flushSync();
		expect(values).toHaveBeenCalledTimes(1);
		expect(sizes).toHaveBeenCalledTimes(1);

		expect(state.selected.add('b')).toBe(state.selected);
		flushSync();
		expect(hasA).toHaveBeenCalledTimes(1);
		expect(values).toHaveBeenCalledTimes(2);
		expect(sizes).toHaveBeenCalledTimes(2);
		expect(state.selected.clear()).toBeUndefined();
		flushSync();
		expect(hasA).toHaveBeenCalledTimes(2);
		expect(values).toHaveBeenCalledTimes(3);
		expect(sizes).toHaveBeenCalledTimes(3);
	});

	it('supports compiler collection helpers and recursive snapshots', () => {
		const state = reactive({
			values: new Map<string, { count: number }>([['a', { count: 1 }]]),
			selected: new Set([{ id: 'first' }])
		});
		expect(mutateReactiveCollection(state, ['values'], 'map', 'set', ['b', { count: 2 }])).toBe(
			state.values
		);
		expect(
			mutateReactiveCollection(state, ['selected'], 'set', 'delete', [{ id: 'missing' }])
		).toBe(false);

		const copy = snapshot(state);
		expect(copy).not.toBe(state);
		expect(copy.values).toBeInstanceOf(Map);
		expect(copy.values.get('a')).toEqual({ count: 1 });
		expect(copy.values.get('a')).not.toBe(state.values.get('a'));
		expect(copy.selected).toBeInstanceOf(Set);
	});

	it('compares accessors without invoking them', () => {
		let reads = 0;
		const getter = () => {
			reads++;
			return 1;
		};
		const first = {} as { value: number };
		const second = {} as { value: number };
		Object.defineProperty(first, 'value', { configurable: true, enumerable: true, get: getter });
		Object.defineProperty(second, 'value', { configurable: true, enumerable: true, get: getter });
		const state = reactive({ record: first });
		state.record = second;
		expect(reads).toBe(0);
		expect(unwrap(state.record)).toBe(first);
	});

	it('notifies mutations performed before a throwing array comparator', () => {
		const state = reactive({ items: [3, 2, 1] });
		const seen: string[] = [];
		watch(() => seen.push(state.items.join(',')));
		let comparisons = 0;
		expect(() =>
			state.items.sort((left, right) => {
				if (++comparisons > 1) throw new Error('stop');
				return left - right;
			})
		).toThrow('stop');
		flushSync();
		if (state.items.join(',') !== '3,2,1') expect(seen.at(-1)).toBe(state.items.join(','));
	});

	it('preserves postfix-update and array-mutator return semantics', () => {
		const state = reactive({ count: 1, items: ['a'] });
		expect(updateReactiveValue(state, ['count'], (previous) => Number(previous) + 1, true)).toBe(1);
		expect(state.count).toBe(2);
		expect(mutateReactiveArray(state, ['items'], 'push', ['b'])).toBe(2);
		expect(mutateReactiveArray(state, ['items'], 'pop', [])).toBe('b');
	});

	it('tracks object and array structural changes', () => {
		const state = reactive({
			user: { first: 'Ada' } as Record<string, string>,
			items: ['a', 'b']
		});
		const keys = computed(() => Object.keys(state.user).join(','));
		const list = computed(() => state.items.join(''));

		expect(unwrap(keys)).toBe('first');
		expect(unwrap(list)).toBe('ab');

		state.user.last = 'Lovelace';
		state.items.reverse();
		flushSync();

		expect(unwrap(keys)).toBe('first,last');
		expect(unwrap(list)).toBe('ba');
	});

	it('tracks direct array length truncation', () => {
		const state = reactive({ items: ['a', 'b', 'c'] });
		const list = computed(() => state.items.join(''));
		const seen: string[] = [];
		const source = ref(list)!;

		subscribe(source, () => seen.push(source.get()));
		expect(unwrap(list)).toBe('abc');

		state.items.length = 1;
		flushSync();

		expect(seen).toEqual(['a']);
		expect(unwrap(list)).toBe('a');
	});

	it('tracks array splice, sort, and reverse as structural changes', () => {
		const state = reactive({ items: ['c', 'a', 'b'] });
		const list = computed(() => state.items.join(''));
		const seen: string[] = [];
		const source = ref(list)!;

		subscribe(source, () => seen.push(source.get()));
		expect(unwrap(list)).toBe('cab');

		state.items.splice(1, 1, 'd');
		flushSync();
		state.items.sort();
		flushSync();
		state.items.reverse();
		flushSync();

		expect(seen).toEqual(['cdb', 'bcd', 'dcb']);
	});

	it('does not notify for structurally identical object replacement', () => {
		const state = reactive({ user: { name: 'Ada', roles: ['admin'] } });
		const seen: string[] = [];
		const label = computed(() => state.user.name);
		const source = ref(label)!;
		subscribe(source, () => seen.push(source.get()));

		state.user = { name: 'Ada', roles: ['admin'] };
		flushSync();
		expect(seen).toEqual([]);

		state.user = { name: 'Grace', roles: ['admin'] };
		flushSync();
		expect(seen).toEqual(['Grace']);
	});

	it('distinguishes sparse arrays, prototypes, and alias topology', () => {
		const sparse = new Array(1);
		const dense = [undefined];
		const shared = {};
		const state = reactive({ version: 0 });
		const value = computed(() =>
			state.version === 0
				? { array: sparse, record: {}, pair: [shared, shared] }
				: { array: dense, record: Object.create(null), pair: [{}, {}] }
		);
		const notifications = vi.fn();
		subscribe(ref(value)!, notifications);
		value.get();
		state.version = 1;
		flushSync();
		expect(notifications).toHaveBeenCalledTimes(1);
	});

	it('tracks shared raw children through the accessed parent without broad invalidation', () => {
		const shared = { value: 1 };
		const state = reactive({ left: shared, right: shared });
		const left = vi.fn(() => state.left.value);
		const right = vi.fn(() => state.right.value);
		watch(left);
		watch(right);

		state.left = { value: 2 };
		flushSync();
		expect(left).toHaveBeenCalledTimes(2);
		expect(right).toHaveBeenCalledTimes(1);
		state.right.value = 2;
		flushSync();
		expect(right).toHaveBeenCalledTimes(2);
	});

	it('keeps equivalent default proxy options canonical and incompatible options separate', () => {
		const raw = { value: 1 };
		expect(reactive(raw)).toBe(reactive(raw, {}));
		expect(reactive(raw, { readonly: true })).toBe(reactive(raw, { readonly: true }));
		expect(reactive(raw)).not.toBe(reactive(raw, { readonly: true }));
	});
});
