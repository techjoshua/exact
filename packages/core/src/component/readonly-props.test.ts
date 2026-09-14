import { describe, expect, it, vi } from 'vitest';
import { createComponentProps } from './state.js';

describe('readonly component array props', () => {
	it.each([
		['push', (items: number[]) => items.push(4)],
		['pop', (items: number[]) => items.pop()],
		['shift', (items: number[]) => items.shift()],
		['unshift', (items: number[]) => items.unshift(4)],
		['splice', (items: number[]) => items.splice(1, 1, 4)],
		['reverse', (items: number[]) => items.reverse()],
		['fill', (items: number[]) => items.fill(4)],
		['copyWithin', (items: number[]) => items.copyWithin(0, 1)]
	] as const)('rejects %s without changing the parent array', (_name, mutate) => {
		const raw = { nested: { items: [3, 1, 2] } };
		const props = createComponentProps(raw, ['nested']);
		const nested = props.nested as typeof raw.nested;
		expect(() => mutate(nested.items)).toThrow('Cannot write to readonly props.');
		expect(raw.nested.items).toEqual([3, 1, 2]);
	});

	it('rejects sort before invoking a comparator', () => {
		const raw = { items: [3, 1, 2] };
		const props = createComponentProps(raw, ['items']);
		const compare = vi.fn((a: number, b: number) => a - b);
		expect(() => (props.items as number[]).sort(compare)).toThrow('readonly props.sort');
		expect(compare).not.toHaveBeenCalled();
		expect(raw.items).toEqual([3, 1, 2]);
	});

	it('allows reading and copying arrays without changing parent ownership', () => {
		const raw = { items: [3, 1, 2] };
		const props = createComponentProps(raw, ['items']);
		const items = props.items as number[];
		expect(items.map((item) => item * 2)).toEqual([6, 2, 4]);
		expect(items.slice().sort()).toEqual([1, 2, 3]);
		expect(() => {
			items[0] = 4;
		}).toThrow('readonly props.0');
		expect(raw.items).toEqual([3, 1, 2]);
	});
});
