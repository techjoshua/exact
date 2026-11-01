import { describe, expect, it } from 'vitest';
import { flushSync, watch } from '@exactjs/reactive';
import { createComponentProps } from './state.js';
import '../runtime/collections.js';
import type { ReactiveOptions } from '@exactjs/reactive';

describe('TypeScript readonly component props', () => {
	it('retains shallow readonly types without imposing runtime immutability', () => {
		const raw = { count: 1, nested: { items: [3, 1, 2] } };
		const props = createComponentProps(raw, ['count', 'nested']);
		const authored: Readonly<typeof raw> = props as typeof raw;
		if (false) {
			// @ts-expect-error Runtime readonly enforcement is deliberately absent from reactive options.
			const options: ReactiveOptions = { readonly: true };
			void options;
			// @ts-expect-error TypeScript rejects assignment to a readonly property.
			authored.count = 2;
			// @ts-expect-error TypeScript rejects replacement of a readonly property.
			authored.nested = { items: [] };
		}
		// Readonly does not recursively change the authored nested value's type.
		authored.nested.items.sort((a, b) => a - b);
		authored.nested.items.push(4);
		expect(raw.nested.items).toEqual([1, 2, 3, 4]);
	});

	it('allows writable aliases and keeps indexed prop reads reactive', () => {
		const props = createComponentProps({ count: 1 }, ['count']);
		const authored: Readonly<{ count: number }> = props as { count: number };
		const writable = props as { count: number };
		const seen: number[] = [];
		const stop = watch(() => seen.push(authored.count));
		try {
			writable.count = 2;
			flushSync();
			expect(seen).toEqual([1, 2]);
		} finally {
			stop();
		}
	});

	it('preserves ordinary collection and property mutations through writable aliases', () => {
		const raw = { values: new Map([['first', 1]]), members: new Set([1]), items: [1] };
		const props = createComponentProps(raw, ['values', 'members', 'items'], true);
		const authored: Readonly<typeof raw> = props as typeof raw;
		authored.values.set('second', 2);
		authored.members.add(2);
		authored.items.splice(0, 1, 2);
		expect([...raw.values]).toEqual([
			['first', 1],
			['second', 2]
		]);
		expect([...raw.members]).toEqual([1, 2]);
		expect(raw.items).toEqual([2]);
	});
});
