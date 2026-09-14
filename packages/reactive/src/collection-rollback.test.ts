import { describe, expect, it } from 'vitest';
import { batch, captureReactiveMutations, flushSync, reactive, watch } from './index.js';

describe('collection rollback invariants', () => {
	it('retains distinct primitive, object, and function subscriptions through clear', () => {
		const keys = [1, '1', {}, () => undefined];
		const map = reactive(new Map<unknown, number>(keys.map((key) => [key, 0])));
		const seen: number[] = [];
		const stops = keys.map((key, index) =>
			watch(() => {
				seen[index] = map.get(key) ?? -1;
			})
		);
		try {
			map.clear();
			flushSync();
			expect(seen).toEqual([-1, -1, -1, -1]);
			keys.forEach((key, index) => map.set(key, index + 1));
			flushSync();
			expect(seen).toEqual([1, 2, 3, 4]);
		} finally {
			stops.forEach((stop) => stop());
		}
	});
	it.each(['Map', 'Set'] as const)('restores a deleted %s tail after newer insertions', (kind) => {
		const collection = reactive(
			kind === 'Map'
				? new Map<unknown, unknown>([
						['a', 1],
						['b', 2]
					])
				: new Set<unknown>(['a', 'b'])
		);
		const journal = captureReactiveMutations(() => collection.delete('b'));
		if (collection instanceof Map) collection.set('new', 9);
		else collection.add('new');
		journal.rollback();
		expect([...collection.keys()]).toEqual(['a', 'new', 'b']);
		if (collection instanceof Map) expect(collection.get('new')).toBe(9);
	});

	it.each(['Map', 'Set'] as const)('restores a %s NaN key before surviving successors', (kind) => {
		const object = {};
		const keys = [NaN, 'removed-successor', object];
		const collection = reactive(
			kind === 'Map'
				? new Map<unknown, unknown>(keys.map((key) => [key, key]))
				: new Set<unknown>(keys)
		);
		const journal = captureReactiveMutations(() => collection.delete(NaN));
		collection.delete('removed-successor');
		journal.rollback();
		expect([...collection.keys()]).toEqual([NaN, object]);
	});

	it.each(['delete', 'clear'] as const)('retains map observers after aborted %s', (operation) => {
		const map = reactive(
			new Map([
				['a', 1],
				['b', 2]
			])
		);
		const seen: unknown[] = [];
		const stop = watch(() => {
			seen.push(map.get('a'));
		});
		try {
			expect(() =>
				batch(() => {
					if (operation === 'delete') map.delete('a');
					else map.clear();
					throw Error('abort');
				})
			).toThrow('abort');
			map.set('a', 3);
			flushSync();
			expect(seen).toEqual([1, 3]);
		} finally {
			stop();
		}
	});
	it('restores map and set iteration order after aborted deletion', () => {
		const map = reactive(
			new Map([
				['a', 1],
				['b', 2],
				['c', 3]
			])
		);
		const set = reactive(new Set(['a', 'b', 'c']));
		expect(() =>
			batch(() => {
				map.delete('b');
				set.delete('b');
				throw Error('abort');
			})
		).toThrow('abort');
		expect([...map.keys()]).toEqual(['a', 'b', 'c']);
		expect([...set]).toEqual(['a', 'b', 'c']);
	});
	it('does not roll back an authoritative reinsert after optimistic deletion', () => {
		const map = reactive(new Map([['a', 'base']]));
		const journal = captureReactiveMutations(() => {
			map.delete('a');
		});
		map.set('a', 'authoritative');
		journal.rollback();
		expect(map.get('a')).toBe('authoritative');
	});

	it.each(['delete', 'clear'] as const)('retains set observers after aborted %s', (operation) => {
		const set = reactive(new Set(['a', 'b']));
		const seen: boolean[] = [];
		const stop = watch(() => {
			seen.push(set.has('a'));
		});
		try {
			expect(() =>
				batch(() => {
					if (operation === 'delete') set.delete('a');
					else set.clear();
					throw Error('abort');
				})
			).toThrow('abort');
			set.delete('a');
			flushSync();
			expect(seen).toEqual([true, false]);
		} finally {
			stop();
		}
	});
	it('keeps absent-key subscriptions through an ordinary clear', () => {
		const map = reactive(new Map([['a', 1]]));
		const seen: unknown[] = [];
		const stop = watch(() => {
			seen.push(map.get('missing'));
		});
		try {
			map.clear();
			flushSync();
			map.set('missing', 3);
			flushSync();
			expect(seen).toEqual([undefined, 3]);
		} finally {
			stop();
		}
	});
	it('restores deleted order without replacing unrelated authoritative values', () => {
		const map = reactive(
			new Map([
				['a', 1],
				['b', 2],
				['c', 3]
			])
		);
		const journal = captureReactiveMutations(() => {
			map.delete('b');
		});
		map.set('c', 9);
		journal.rollback();
		expect([...map]).toEqual([
			['a', 1],
			['b', 2],
			['c', 9]
		]);
	});
});
