import { describe, expect, it, vi } from 'vitest';

import {
	captureReactiveMutations,
	flushSync,
	reactive,
	rollbackReactiveMutationJournals,
	watch
} from './index.js';

describe('reactive mutation journals', () => {
	it('publishes optimistic writes and restores deep collection state on rollback', () => {
		const state = reactive({
			count: 1,
			items: ['a'],
			lookup: new Map([['a', 1]]),
			selected: new Set(['a'])
		});
		const observed = vi.fn();
		const stop = watch(() => {
			observed([
				state.count,
				state.items.join(','),
				state.lookup.get('b'),
				state.selected.has('b')
			]);
		});

		const journal = captureReactiveMutations(() => {
			state.count = 2;
			state.items.push('b');
			state.lookup.set('b', 2);
			state.selected.add('b');
		});

		flushSync();
		expect(state).toMatchObject({ count: 2, items: ['a', 'b'] });
		journal.rollback();
		flushSync();
		expect(state.count).toBe(1);
		expect(state.items).toEqual(['a']);
		expect(state.lookup.has('b')).toBe(false);
		expect(state.selected.has('b')).toBe(false);
		expect(observed).toHaveBeenCalledTimes(3);
		stop();
	});

	it('retains mutations after the journal is discarded', () => {
		const state = reactive({ value: 'base' });
		const journal = captureReactiveMutations(() => {
			state.value = 'confirmed';
		});

		journal.discard();
		journal.rollback();
		expect(state.value).toBe('confirmed');
	});

	it('reveals newer authoritative writes instead of restoring an obsolete base', () => {
		const state = reactive({
			value: 'base',
			items: ['base'],
			lookup: new Map([['shared', 'base']]),
			selected: new Set(['base'])
		});
		const journal = captureReactiveMutations(() => {
			state.value = 'optimistic';
			state.items.push('optimistic');
			state.lookup.set('shared', 'optimistic');
			state.selected.add('optimistic');
		});

		state.value = 'authoritative';
		state.items.push('authoritative');
		state.lookup.set('shared', 'authoritative');
		state.selected.add('authoritative');
		journal.rollback();

		expect(state.value).toBe('authoritative');
		expect(state.items).toEqual(['base', 'authoritative']);
		expect(state.lookup.get('shared')).toBe('authoritative');
		expect(state.selected).toEqual(new Set(['base', 'authoritative']));
	});

	it('rolls back unaffected paths while preserving a separately updated collection entry', () => {
		const state = reactive({
			left: 'base',
			right: 'base',
			lookup: new Map([
				['optimistic', 'base'],
				['external', 'base']
			])
		});
		const journal = captureReactiveMutations(() => {
			state.left = 'optimistic';
			state.right = 'optimistic';
			state.lookup.set('optimistic', 'changed');
		});

		state.right = 'authoritative';
		state.lookup.set('external', 'authoritative');
		journal.rollback();

		expect(state.left).toBe('base');
		expect(state.right).toBe('authoritative');
		expect(state.lookup.get('optimistic')).toBe('base');
		expect(state.lookup.get('external')).toBe('authoritative');
	});

	it('rebases structural and reordering array mutations over authoritative appends', () => {
		const state = reactive({ items: ['a', 'b', 'c'] });
		const spliceJournal = captureReactiveMutations(() => {
			state.items.splice(1, 1, 'optimistic');
		});
		state.items.push('authoritative');
		spliceJournal.rollback();
		expect(state.items).toEqual(['a', 'b', 'c', 'authoritative']);

		const reverseJournal = captureReactiveMutations(() => {
			state.items.reverse();
		});
		state.items.push('later');
		reverseJournal.rollback();
		expect(state.items).toEqual(['a', 'b', 'c', 'authoritative', 'later']);
	});

	it('rolls back multiple owned journals without overwriting interleaved authoritative writes', () => {
		const state = reactive({ owned: 'base', interleaved: 'base' });
		const first = captureReactiveMutations(() => {
			state.owned = 'first';
			state.interleaved = 'first';
		});
		state.interleaved = 'authoritative';
		const second = captureReactiveMutations(() => {
			state.owned = 'second';
			state.interleaved = 'second';
		});

		rollbackReactiveMutationJournals([first, second]);

		expect(state.owned).toBe('base');
		expect(state.interleaved).toBe('authoritative');
	});
});
