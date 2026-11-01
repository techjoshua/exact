import { describe, expect, it, vi } from 'vitest';
import {
	batch,
	deleteReactiveValue,
	flushSync,
	mutateReactiveArray,
	reactive,
	ref,
	registerReactiveListKey,
	updateReactiveValue,
	updateReactiveValueWithResult,
	unwrap,
	watch,
	writeReactive,
	writeReactiveLazy
} from './index.js';
import { keyedCollectionMetadata } from './internal/keyed-collections.js';
import { indexedReactive } from './indexed.js';
import {
	deleteIndexedReactiveValue,
	updateIndexedReactiveValue,
	updateIndexedReactiveValueWithResult,
	writeIndexedReactiveValue,
	withReactivePropertyMutationObserver
} from './writes.js';

describe('@exactjs/reactive writes', () => {
	it('retains a moved child proxy and observes its new parent path', () => {
		const state = reactive({ items: [{ value: 1 }, { value: 2 }] });
		const retained = state.items[0]!;
		state.items.reverse();
		expect(state.items[1]).toBe(retained);
		expect(ref(state.items[1])!.get()).toBe(retained);
		const values: number[] = [];
		const stop = watch(() => values.push(retained.value));
		try {
			state.items[1] = { value: 3 };
			flushSync();
			// A retained proxy keeps its raw value but observes replacement of its migrated path.
			expect(values).toEqual([1, 1]);
		} finally {
			stop();
		}
	});

	it('does not reschedule a watcher installed by a synchronous replacement scheduler', () => {
		const state = reactive({ count: 0 });
		const stable = watch(() => void state.count);
		let replacement: () => void = () => undefined;
		let schedules = 0;
		const install = () => {
			replacement = watch(
				() => void state.count,
				() => {
					schedules++;
					replacement();
					install();
				}
			);
		};
		install();

		batch(() => state.count++);

		expect(schedules).toBe(1);
		stable();
		replacement();
	});

	it('replaces keyed records when an assignment reorders records', () => {
		const state = reactive({
			records: [
				{ id: 'a', title: 'A' },
				{ id: 'b', title: 'B' }
			]
		});
		const a = state.records[0];
		const b = state.records[1];
		registerReactiveListKey(state.records, (item) => (item as { id: string }).id);

		writeReactive(
			state,
			['records'],
			[
				{ id: 'b', title: 'B updated' },
				{ id: 'a', title: 'A' }
			]
		);

		expect(state.records[0]).not.toBe(b);
		expect(b.title).toBe('B');
		expect(state.records[1]).not.toBe(a);
		expect(state.records[0].title).toBe('B updated');
	});

	it('tracks property-existence reads', () => {
		const state = reactive({ record: {} as Record<string, number> });
		const values: boolean[] = [];
		watch(() => values.push('answer' in state.record));
		state.record.answer = 42;
		flushSync();
		expect(values).toEqual([false, true]);
	});

	it('rejects recreated dynamic extractors whose captured behavior disagrees', () => {
		const state = reactive({ records: [{ id: 'a', slug: 'first' }] });
		const extractor = (field: 'id' | 'slug') => (item: unknown) =>
			(item as { id: string; slug: string })[field];
		registerReactiveListKey(state.records, extractor('id'), 'ZList');

		expect(() => registerReactiveListKey(state.records, extractor('slug'), 'AList')).toThrow(
			'(AList and ZList)'
		);
	});

	it('tracks defineProperty writes and rolls them back', () => {
		const state = reactive({ value: 1 });
		const seen: number[] = [];
		watch(() => seen.push(state.value));
		Object.defineProperty(state, 'value', {
			configurable: true,
			enumerable: true,
			writable: true,
			value: 2
		});
		flushSync();
		expect(seen).toEqual([1, 2]);
		expect(() =>
			batch(() => {
				Object.defineProperty(state, 'value', {
					configurable: true,
					enumerable: true,
					writable: true,
					value: 3
				});
				throw new Error('rollback');
			})
		).toThrow('rollback');
		expect(state.value).toBe(2);
	});

	it('keeps retained shared-child aliases subscribed to their own parent paths', () => {
		const shared = { value: 1 };
		const state = reactive({ left: shared, right: shared });
		const leftAlias = state.left;
		const rightAlias = state.right;
		const left = vi.fn(() => leftAlias.value);
		const right = vi.fn(() => rightAlias.value);
		watch(left);
		watch(right);

		state.left = { value: 2 };
		flushSync();
		expect(left).toHaveBeenCalledTimes(2);
		expect(right).toHaveBeenCalledTimes(1);
	});

	it('resolves a lazy assignment target before evaluating a side-effecting right-hand side', () => {
		const state = reactive({ selected: 'first', records: { first: 1, second: 2 } });

		const result = writeReactiveLazy(state, ['records', state.selected], () => {
			state.selected = 'second';
			return 10;
		});

		expect(result).toBe(10);
		expect(state.records).toEqual({ first: 10, second: 2 });
		expect(state.selected).toBe('second');
	});

	it('preserves JavaScript assignment results for prefix, postfix, and compound updates', () => {
		const state = reactive({ count: 2 });

		expect(updateReactiveValue(state, ['count'], (value) => Number(value) + 1, true)).toBe(2);
		expect(state.count).toBe(3);
		expect(updateReactiveValue(state, ['count'], (value) => Number(value) * 2)).toBe(6);
		expect(
			updateReactiveValueWithResult(state, ['count'], (value) => [
				Number(value) + 4,
				`was:${value}`
			])
		).toBe('was:6');
		expect(state.count).toBe(10);
	});

	it('writes compiler-proven indexed slots without changing reactive semantics', () => {
		const state = indexedReactive<{ count?: number; record?: { value: number } }>([
			'count',
			'record'
		]);
		state.count = 2;
		state.record = { value: 1 };
		const seen: Array<number | undefined> = [];
		watch(() => seen.push(state.count));

		expect(writeIndexedReactiveValue(state, 0, 3)).toBe(3);
		expect(updateIndexedReactiveValue(state, 0, (value) => Number(value) * 2)).toBe(6);
		expect(
			updateIndexedReactiveValueWithResult(state, 0, (value) => [Number(value) + 1, `was:${value}`])
		).toBe('was:6');
		flushSync();
		expect(seen).toEqual([2, 7]);

		const record = state.record;
		writeIndexedReactiveValue(state, 1, { value: 2 });
		expect(state.record).not.toBe(record);
		expect(record?.value).toBe(1);
		expect(state.record?.value).toBe(2);
		expect(deleteIndexedReactiveValue(state, 0)).toBe(true);
		expect('count' in state).toBe(false);
		expect(() => writeIndexedReactiveValue(state, 2, 1)).toThrow('invalid indexed slot');
	});

	it('writes direct compiler values without invoking function-valued state', () => {
		const state = indexedReactive<{ callback?: () => number; count?: number }>([
			'callback',
			'count'
		]);
		const callback = () => 42;

		expect(writeIndexedReactiveValue(state, 0, callback)).toBe(callback);
		expect(state.callback).toBe(callback);
		expect(writeIndexedReactiveValue(state, 1, 3)).toBe(3);
		expect(state.count).toBe(3);
		expect(() => writeIndexedReactiveValue(state, 2, 1)).toThrow('invalid indexed slot');
	});

	it('invokes an indexed setter without evaluating its getter', () => {
		const state = indexedReactive<{ count: number }>(['count']);
		state.count = 2;
		const target = unwrap(state);
		let reads = 0;
		let stored = 2;
		Object.defineProperty(target, 'count', {
			configurable: true,
			enumerable: true,
			get() {
				reads++;
				return stored;
			},
			set(value: number) {
				stored = value;
			}
		});

		expect(writeIndexedReactiveValue(state, 0, 3)).toBe(3);
		expect(reads).toBe(0);
		expect(stored).toBe(3);
		expect(state.count).toBe(3);
	});

	it('delegates array mutations while rejecting non-array compiler targets', () => {
		const state = reactive({ items: ['a'], label: 'not-an-array' });

		expect(mutateReactiveArray(state, ['items'], 'push', () => ['b', 'c'])).toBe(3);
		expect(state.items).toEqual(['a', 'b', 'c']);
		expect(mutateReactiveArray(state, ['items'], 'splice', [1, 1, 'B'])).toEqual(['b']);
		expect(state.items).toEqual(['a', 'B', 'c']);
		expect(() => mutateReactiveArray(state, ['label'], 'pop', [])).toThrow(
			'Cannot call pop on a non-array reactive value'
		);
	});

	it('handles compiler delete and invalid empty-path contracts deterministically', () => {
		const state = reactive({ record: { value: 1 } as { value?: number } });
		const existence: boolean[] = [];
		watch(() => existence.push('value' in state.record));

		expect(deleteReactiveValue(state, ['record', 'value'])).toBe(true);
		flushSync();
		expect(existence).toEqual([true, false]);
		expect(deleteReactiveValue(state, [])).toBe(false);
		expect(() => writeReactive(state, [], 1)).toThrow('writeReactive requires a state path');
		expect(() => writeReactiveLazy(state, [], () => 1)).toThrow(
			'writeReactiveLazy requires a state path'
		);
	});

	it('keeps compatible list-key registrations active until their last owner stops', () => {
		const state = reactive({ records: [{ id: 'a', slug: 'first' }] });
		const byId = (item: unknown) => (item as { id: string }).id;
		const first = registerReactiveListKey(state.records, byId, 'first', 'records');
		const second = registerReactiveListKey(state.records, byId, 'second', 'records');

		first();
		expect(() =>
			registerReactiveListKey(
				state.records,
				(item) => (item as { slug: string }).slug,
				'incompatible',
				'other'
			)
		).toThrow('Conflicting this.map() key extractors');
		second();
		let replacement!: () => void;
		expect(() => {
			replacement = registerReactiveListKey(
				state.records,
				(item) => (item as { slug: string }).slug,
				'replacement',
				'other'
			);
		}).not.toThrow();
		replacement();
	});

	it('creates keyed metadata lazily and releases it after the final registration stops', () => {
		const records = [{ id: 'one' }];
		const byId = (item: unknown) => (item as { id: string }).id;
		const first = registerReactiveListKey(records, byId);
		const second = registerReactiveListKey(records, byId);

		expect(keyedCollectionMetadata(records)).toBeUndefined();
		expect(keyedCollectionMetadata(records, byId)).toBeDefined();
		expect(keyedCollectionMetadata(records)).toBeDefined();
		first();
		expect(keyedCollectionMetadata(records)).toBeDefined();
		second();
		expect(keyedCollectionMetadata(records)).toBeUndefined();
	});
});

// Evidence uses the successful put key, which can differ from the earlier native get key.
it('reports the actual canonical key without additional coercion or accessor readback', () => {
	const state = { left: 1, right: 10 };
	const trace: string[] = [];
	let conversions = 0;
	const key = {
		[Symbol.toPrimitive]() {
			trace.push('key');
			return ++conversions === 1 ? 'left' : 'right';
		}
	} as unknown as PropertyKey;
	const observed: unknown[] = [];
	const result = withReactivePropertyMutationObserver(
		(receiver, actualKey, operation) => observed.push([receiver, actualKey, operation]),
		() =>
			updateReactiveValue(state, [key], (previous) => {
				trace.push('rhs');
				return Number(previous) + 2;
			})
	);
	expect(trace).toEqual(['key', 'rhs', 'key']);
	expect(result).toBe(3);
	expect(state).toEqual({ left: 1, right: 3 });
	expect(observed).toEqual([[state, 'right', 'set']]);
});

it('reports no evidence for a failed put or delete and does not recoerce its key', () => {
	const state = Object.defineProperty({}, 'value', {
		value: 1,
		writable: false,
		configurable: false
	});
	const observed: unknown[] = [];
	let conversions = 0;
	const key = {
		[Symbol.toPrimitive]() {
			conversions++;
			return 'value';
		}
	} as unknown as PropertyKey;
	withReactivePropertyMutationObserver(
		(...entry) => observed.push(entry),
		() => {
			expect(() => writeReactiveLazy(state, [key], () => 1)).toThrow(TypeError);
			expect(() => deleteReactiveValue(state, [key])).toThrow(TypeError);
		}
	);
	expect(conversions).toBe(2);
	expect(observed).toEqual([]);
});

// A primitive owns no persistent property, but native inherited setters still receive it.
it('preserves primitive setter receivers without inventing object mutation evidence', () => {
	const key = '__exactPrimitiveWrite';
	const previous = Object.getOwnPropertyDescriptor(Number.prototype, key);
	const receivers: unknown[] = [];
	const observed: unknown[] = [];
	try {
		Object.defineProperty(Number.prototype, key, {
			configurable: true,
			set(value: unknown) {
				receivers.push(typeof this, Number(this), value);
			}
		});
		withReactivePropertyMutationObserver(
			(...entry) => observed.push(entry),
			() => {
				expect(writeReactiveLazy(1 as unknown as object, [key], () => 2)).toBe(2);
				expect(deleteReactiveValue(1 as unknown as object, ['absent'])).toBe(true);
				expect(() => deleteReactiveValue('x' as unknown as object, ['0'])).toThrow(TypeError);
			}
		);
		expect(receivers).toEqual(['number', 1, 2]);
		expect(observed).toEqual([]);
	} finally {
		if (previous) Object.defineProperty(Number.prototype, key, previous);
		else Reflect.deleteProperty(Number.prototype, key);
	}
});
