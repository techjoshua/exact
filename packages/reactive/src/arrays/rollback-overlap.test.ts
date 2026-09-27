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
