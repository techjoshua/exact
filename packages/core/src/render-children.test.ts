import { describe, expect, it } from 'vitest';
import { normalizeChildren, normalizeRenderResult } from './render-children.js';

describe('render child normalization', () => {
	it('preserves descendant order, values, and object identity without mutating inputs', () => {
		const child = { label: 'owned child' };
		const nested = Object.freeze([null, Object.freeze([child, false]), undefined]);
		const input = [0, [], nested, 'tail'];
		const result = normalizeChildren(input);
		expect(result).toEqual([0, null, child, false, undefined, 'tail']);
		expect(result[2]).toBe(child);
		expect(input[2]).toBe(nested);
	});

	it('retains array iteration order and holes while visiting nested children', () => {
		const visits: string[] = [];
		const nested = [1, 2];
		Object.defineProperty(nested, 0, {
			get() {
				visits.push('nested');
				return 'first';
			}
		});
		const input = new Array<unknown>(3);
		input[0] = nested;
		Object.defineProperty(input, 2, {
			get() {
				visits.push('last');
				return 'last';
			}
		});
		expect(normalizeChildren(input)).toEqual(['first', 2, undefined, 'last']);
		expect(visits).toEqual(['nested', 'last']);
	});

	it('accepts a nested child list larger than the engine function-argument limit', () => {
		const input = Array.from({ length: 200_000 }, (_, index) => index);
		const result = normalizeChildren([input]);
		expect(result).toHaveLength(input.length);
		expect(result[0]).toBe(0);
		expect(result[result.length - 1]).toBe(input.length - 1);
	});

	it('preserves an already flat render result and normalizes nested render output', () => {
		const flat = ['first', null, 'last'];
		expect(normalizeRenderResult(flat)).toBe(flat);
		expect(normalizeRenderResult([['first'], [null, ['last']]])).toEqual(flat);
	});
});
