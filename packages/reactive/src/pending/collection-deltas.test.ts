import { expect, it } from 'vitest';
import { PendingCollectionDelta } from './collection-deltas.js';

it('retains Map results and insertion order without publishing pending edits', () => {
	const original = new Map([
		['a', 1],
		['b', 2]
	]);
	const pending = new PendingCollectionDelta(original);
	pending.set('a', 3);
	expect(pending.delete('b')).toBe(true);
	expect(pending.delete('b')).toBe(false);
	pending.set('c', 4);
	pending.set('b', 5);
	expect([...pending.iterate()]).toEqual([
		['a', 3],
		['c', 4],
		['b', 5]
	]);
	expect(pending.get('b')).toBe(5);
	expect(pending.size).toBe(3);
	expect([...original]).toEqual([
		['a', 1],
		['b', 2]
	]);
});

it('combines clear and later edits with live iteration and committed changes', () => {
	const original = new Map([
		['a', 1],
		['b', 2]
	]);
	const pending = new PendingCollectionDelta(original);
	const iterator = pending.iterate();
	expect(iterator.next().value).toEqual(['a', 1]);
	pending.clear();
	pending.set('c', 3);
	expect([...iterator]).toEqual([['c', 3]]);
	expect(pending.size).toBe(1);
	expect(pending.has('a')).toBe(false);
	original.set('d', 4);
	expect(pending.has('d')).toBe(false);
	expect([...original]).toEqual([
		['a', 1],
		['b', 2],
		['d', 4]
	]);
});

it('preserves Set ordering and native membership results', () => {
	const original = new Set([1, 2]);
	const pending = new PendingCollectionDelta(original);
	pending.delete(1);
	pending.set(3, 3);
	pending.set(1, 1);
	expect([...pending.iterate()]).toEqual([
		[2, 2],
		[3, 3],
		[1, 1]
	]);
	expect(pending.has(1)).toBe(true);
	expect(pending.size).toBe(3);
	expect([...original]).toEqual([1, 2]);
});

it('does not traverse collection storage for a single-key edit', () => {
	class LargeMap extends Map<string, number> {
		override entries(): MapIterator<[string, number]> {
			throw new Error('Copied storage');
		}
		override [Symbol.iterator](): MapIterator<[string, number]> {
			throw new Error('Copied storage');
		}
	}
	const original = new LargeMap();
	for (let index = 0; index < 100_000; index++) original.set(String(index), index);
	const pending = new PendingCollectionDelta(original);
	pending.set('50000', 9);
	expect(pending.get('50000')).toBe(9);
	expect(pending.size).toBe(100_000);
	expect(original.get('50000')).toBe(50_000);
});
