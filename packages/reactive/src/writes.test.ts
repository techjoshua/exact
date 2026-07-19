import { describe, expect, it, vi } from 'vitest';
import {
	batch,
	flushSync,
	reactive,
	registerReactiveListKey,
	watch,
	writeReactive
} from './index.js';

describe('@exact/reactive writes', () => {
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
});
