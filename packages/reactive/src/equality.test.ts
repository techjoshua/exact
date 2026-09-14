import { describe, expect, it, vi } from 'vitest';
import { structurallyEqual } from './internal/equality.js';

describe('reactive structural equality', () => {
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
