import { describe, expect, it, vi } from 'vitest';
import {
	batch,
	deleteReactiveValue,
	flushSync,
	mutateReactiveArray,
	reactive,
	registerReactiveListKey,
	updateReactiveValue,
	updateReactiveValueWithResult,
	watch,
	writeReactive,
	writeReactiveLazy
} from './index.js';

describe('@exactjs/reactive writes', () => {
	it('retains keyed record identity when an API response reorders records', () => {
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

		expect(state.records[0]).toBe(b);
		expect(state.records[1]).toBe(a);
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

	it('tracks defineProperty writes, honors readonly mode, and rolls them back', () => {
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
		const readonly = reactive({ value: 1 }, { readonly: true });
		expect(() => Object.defineProperty(readonly, 'value', { value: 2 })).toThrow();
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

		expect(updateReactiveValue(state, ['count'], (value) => value + 1, true)).toBe(2);
		expect(state.count).toBe(3);
		expect(updateReactiveValue(state, ['count'], (value) => value * 2)).toBe(6);
		expect(
			updateReactiveValueWithResult(state, ['count'], (value) => [value + 4, `was:${value}`])
		).toBe('was:6');
		expect(state.count).toBe(10);
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
});
