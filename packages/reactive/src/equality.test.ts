import { describe, expect, it, vi } from 'vitest';
import { structurallyEqual } from './internal/equality.js';
import { hasChanged } from './change-detection.js';
import { computed, reactive } from './index.js';

describe('reactive structural equality', () => {
	it('compares primitive identities while keeping wrapped and structural values observable', () => {
		const fn = () => undefined;
		const symbol = Symbol('value');
		for (const value of [undefined, null, false, 1, 'value', 1n, NaN, fn, symbol])
			expect(hasChanged(value, value)).toBe(false);
		for (const [left, right] of [
			[0, -0],
			[1, '1'],
			[null, undefined],
			[fn, () => undefined]
		])
			expect(hasChanged(left, right)).toBe(true);
		const state = reactive({ value: 1 });
		const value = computed(() => state.value);
		expect(hasChanged(value, 1)).toBe(false);
		expect(hasChanged(1, value)).toBe(false);
		state.value = 2;
		expect(hasChanged(value, 1)).toBe(true);
		expect(hasChanged(2, value)).toBe(false);
		expect(hasChanged({ value: 2 }, { value: 2 })).toBe(false);
		expect(hasChanged({ value: 2 }, { value: 3 })).toBe(true);
	});

	it('preserves identity and unwrap order for primitive comparisons', () => {
		const unwrap = vi.fn((value: unknown) => value);
		expect(structurallyEqual(NaN, NaN, unwrap)).toBe(true);
		expect(unwrap).not.toHaveBeenCalled();
		expect(structurallyEqual(0, -0, unwrap)).toBe(false);
		expect(unwrap.mock.calls).toEqual([[0], [-0]]);
	});

	it('preserves cycles and distinguishes shared from independent children', () => {
		const left: { self?: unknown } = {};
		const right: { self?: unknown } = {};
		left.self = left;
		right.self = right;
		const unwrap = (value: unknown) => value;
		expect(structurallyEqual(left, right, unwrap)).toBe(true);
		expect(structurallyEqual([left, left], [right, { self: right }], unwrap)).toBe(false);
	});

	it('compares accessor descriptors without executing getters', () => {
		const get = vi.fn(() => 1);
		const left = Object.defineProperty({}, 'value', { get, enumerable: true });
		const right = Object.defineProperty({}, 'value', { get, enumerable: true });
		const unwrap = (value: unknown) => value;
		expect(structurallyEqual(left, right, unwrap)).toBe(true);
		expect(structurallyEqual(left, { value: 1 }, unwrap)).toBe(false);
		expect(get).not.toHaveBeenCalled();
	});
});

it('preserves sparse slots, symbol properties, and array property descriptors', () => {
	const symbol = Symbol('detail');
	const left = Object.assign([undefined, , 2], { [symbol]: { value: 3 } });
	const right = Object.assign([undefined, , 2], { [symbol]: { value: 3 } });
	const unwrap = (value: unknown) => value;
	expect(structurallyEqual(left, right, unwrap)).toBe(true);
	right[1] = undefined;
	expect(structurallyEqual(left, right, unwrap)).toBe(false);
	delete right[1];
	right[symbol].value = 4;
	expect(structurallyEqual(left, right, unwrap)).toBe(false);
	right[symbol].value = 3;
	Object.defineProperty(right, '0', { writable: false });
	expect(structurallyEqual(left, right, unwrap)).toBe(false);
});

it('unwraps queued property pairs in their original traversal order', () => {
	const left = { first: 1, second: 2 };
	const right = { first: 3, second: 4 };
	const unwrap = vi.fn((value: unknown) => value);
	expect(structurallyEqual(left, right, unwrap)).toBe(false);
	expect(unwrap.mock.calls).toEqual([[left], [right], [2], [4]]);
});
