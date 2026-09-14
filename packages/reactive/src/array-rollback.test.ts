import { describe, expect, it } from 'vitest';
import {
	captureReactiveMutations,
	reactive,
	rollbackReactiveMutationJournals,
	updateReactive
} from './index.js';

describe('array rollback ownership', () => {
	it('restores an existing index without truncating a later append', () => {
		const items = reactive(['a', 'b']);
		const journal = captureReactiveMutations(() => {
			items[0] = 'optimistic';
		});
		items.push('later');
		journal.rollback();
		expect(items).toEqual(['a', 'b', 'later']);
	});

	it('restores a truncation without overwriting surviving authoritative slots', () => {
		const items = reactive(['a', 'b', 'c']);
		const journal = captureReactiveMutations(() => {
			items.length = 1;
		});
		items[0] = 'later';
		journal.rollback();
		expect(items).toEqual(['later', 'b', 'c']);
	});

	it('restores still-owned removed entries around a later append', () => {
		const items = reactive(['a', 'b', 'c']);
		const journal = captureReactiveMutations(() => {
			items.length = 1;
		});
		items.push('later');
		journal.rollback();
		expect(items).toEqual(['a', 'later', 'c']);
	});

	it('removes only its sparse extension while preserving later populated slots', () => {
		const items = reactive(['a']);
		const journal = captureReactiveMutations(() => {
			items[6] = 'optimistic';
		});
		items[3] = 'later';
		journal.rollback();
		expect(items.length).toBe(4);
		expect(items[3]).toBe('later');
		expect(1 in items).toBe(false);
		expect(6 in items).toBe(false);
	});

	it.each(['index', 'push', 'length'] as const)(
		'preserves a later explicit length after optimistic %s',
		(kind) => {
			const items = reactive(['a']);
			const journal = captureReactiveMutations(() => {
				if (kind === 'index') items[4] = 'optimistic';
				else if (kind === 'push') items.push('optimistic');
				else items.length = 5;
			});
			items.length = 10;
			journal.rollback();
			expect(items.length).toBe(10);
			expect(Object.keys(items)).toEqual(['0']);
		}
	);

	it('preserves an explicit length but restores still-owned entries within it', () => {
		const items = reactive(['a', 'b', 'c']);
		const journal = captureReactiveMutations(() => {
			items.length = 1;
		});
		items.length = 2;
		journal.rollback();
		expect(items).toEqual(['a', 'b']);
	});

	it('fences descriptor-based truncation like direct length assignment', () => {
		const items = reactive(['a', 'b', 'c']);
		const journal = captureReactiveMutations(() => {
			items[2] = 'optimistic';
		});
		Object.defineProperty(items, 'length', { value: 1 });
		journal.rollback();
		expect(items).toEqual(['a']);
	});

	it('restores sparse removed entries without turning holes into undefined values', () => {
		const initial = ['a'];
		initial[4] = 'e';
		const items = reactive(initial);
		const journal = captureReactiveMutations(() => {
			items.length = 1;
		});
		journal.rollback();
		expect(items.length).toBe(5);
		expect(items[4]).toBe('e');
		expect(2 in items).toBe(false);
	});

	it('retains the length of an authoritative reconciled snapshot', () => {
		const state = reactive({ items: ['a', 'b', 'c'] });
		const journal = captureReactiveMutations(() => {
			state.items.length = 1;
		});
		updateReactive(state, { items: ['server'] });
		journal.rollback();
		expect(state.items).toEqual(['server']);
	});

	it('unwinds mixed owned writes while retaining an intervening authoritative append', () => {
		const items = reactive(['a', 'b']);
		const first = captureReactiveMutations(() => {
			items[0] = 'first';
			items.length = 1;
		});
		items.push('authoritative');
		const second = captureReactiveMutations(() => {
			items[0] = 'second';
			items.push('temporary');
		});
		rollbackReactiveMutationJournals([first, second]);
		expect(items).toEqual(['a', 'authoritative']);
	});
});
