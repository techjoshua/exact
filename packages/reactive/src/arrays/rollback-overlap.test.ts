import { it, expect } from 'vitest';
import {
	reactive,
	captureReactiveMutations,
	watch,
	flushSync,
	computed,
	unwrap
} from '../index.js';
const orders = [
	[0, 1, 2],
	[0, 2, 1],
	[1, 0, 2],
	[1, 2, 0],
	[2, 0, 1],
	[2, 1, 0]
];
for (const mode of ['push', 'unshift', 'splice-insert', 'pop', 'shift'] as const)
	for (const order of orders)
		it(`${mode} rollback ${order}`, () => {
			const items = reactive(['a', 'b', 'c', 'd']);
			const journals = [1, 2, 3].map(() =>
				captureReactiveMutations(() => {
					if (mode === 'push') items.push('same');
					if (mode === 'unshift') items.unshift('same');
					if (mode === 'splice-insert') items.splice(1, 0, 'same');
					if (mode === 'pop') items.pop();
					if (mode === 'shift') items.shift();
				})
			);
			for (const i of order) journals[i]!.rollback();
			expect(items).toEqual(['a', 'b', 'c', 'd']);
		});
it('moves pending property inverses and invalidates numeric observers', () => {
	const items = reactive(['base']);
	const joined = computed(() => items.join(','));
	expect(unwrap(joined)).toBe('base');
	const seen: string[] = [];
	const stop = watch(() => {
		seen.push(items[1] ?? 'missing');
	});
	try {
		const a = captureReactiveMutations(() => items.push('a'));
		items.push('b');
		const b = captureReactiveMutations(() => {
			items[2] = 'edited';
		});
		flushSync();
		a.rollback();
		flushSync();
		expect(items).toEqual(['base', 'edited']);
		expect(seen.at(-1)).toBe('edited');
		b.rollback();
		flushSync();
		expect(items).toEqual(['base', 'b']);
		expect(seen.at(-1)).toBe('b');
		const c = captureReactiveMutations(() => items.push('c'));
		const d = captureReactiveMutations(() => items.push('c'));
		c.rollback();
		const e = captureReactiveMutations(() => items.push('c'));
		d.rollback();
		e.rollback();
		expect(items).toEqual(['base', 'b']);
		flushSync();
		expect(unwrap(joined)).toBe('base,b');
	} finally {
		stop();
	}
});

it('rolls back a truncation before removing an older rejected insertion', () => {
	const items = reactive(['b']);
	const first = captureReactiveMutations(() => items.unshift('a'));
	const second = captureReactiveMutations(() => {
		items.length = 0;
	});
	first.rollback();
	second.rollback();
	expect(items).toEqual(['b']);
	items.reverse();
	items.push('next');
	expect(items).toEqual(['b', 'next']);
});

it('restores a reordered suffix after another rollback removes its unchanged prefix', () => {
	const items = reactive(['c', 'b']);
	const prefix = captureReactiveMutations(() => items.unshift('a'));
	const order = captureReactiveMutations(() => items.sort());
	prefix.rollback();
	order.rollback();
	expect(items).toEqual(['c', 'b']);
});

it.each(['reverse', 'sort'] as const)('removes rejected insertions after ordinary %s', (method) => {
	const items = reactive(['b', 'c']);
	const journal = captureReactiveMutations(() => items.push('a'));
	items[method]();
	journal.rollback();
	expect(items).toEqual(method === 'reverse' ? ['c', 'b'] : ['b', 'c']);
	const next = captureReactiveMutations(() => items.push('next'));
	next.rollback();
	expect(items).toEqual(method === 'reverse' ? ['c', 'b'] : ['b', 'c']);
});

for (const order of orders)
	it(`restores entry identity across overlapping insertion, reversal, and sort: ${order}`, () => {
		const items = reactive(['c', 'b']);
		const journals = [
			captureReactiveMutations(() => items.push('a')),
			captureReactiveMutations(() => items.reverse()),
			captureReactiveMutations(() => items.sort())
		];
		for (const index of order) journals[index]!.rollback();
		expect(items).toEqual(['c', 'b']);
	});

it('restores a moved property without replacing later authoritative entry writes', () => {
	const items = reactive(['b', 'c']);
	const first = captureReactiveMutations(() => {
		items[0] = 'optimistic';
	});
	items.reverse();
	first.rollback();
	expect(items).toEqual(['c', 'b']);
	const second = captureReactiveMutations(() => {
		items[0] = 'optimistic';
	});
	items.reverse();
	items[1] = 'authoritative';
	second.rollback();
	expect(items).toEqual(['b', 'authoritative']);
});

it('retains duplicate occurrences, holes, and undefined values through sorting and rollback', () => {
	const items = reactive(['b', , undefined, 'a', 'a']);
	const journal = captureReactiveMutations(() => items.unshift('a', undefined));
	items.sort();
	journal.rollback();
	expect(items).toEqual(['a', 'a', 'b', undefined, ,]);
	expect(4 in items).toBe(false);
});

it('keeps a later ordinary order when an earlier optimistic reorder is rejected', () => {
	const items = reactive([3, 1, 2]);
	const journal = captureReactiveMutations(() => items.reverse());
	items.sort((left, right) => left - right);
	journal.rollback();
	expect(items).toEqual([1, 2, 3]);
});
