import { describe, expect, it } from 'vitest';
import { linearTicks, scaleCategory, scaleLinear } from './scales.js';

describe('chart scales', () => {
	it('maps normal, reversed, and collapsed linear domains', () => {
		expect(scaleLinear({ domain: [0, 100], range: [10, 210] }, 25)).toBe(60);
		expect(scaleLinear({ domain: [100, 0], range: [10, 210] }, 25)).toBe(160);
		expect(scaleLinear({ domain: [5, 5], range: [0, 100] }, 5)).toBe(50);
	});

	it('chooses stable human-scale ticks', () => {
		expect(linearTicks([0, 100], 6)).toEqual([0, 20, 40, 60, 80, 100]);
		expect(linearTicks([1, 9], 5)).toEqual([2, 4, 6, 8]);
		expect(linearTicks([9, 1], 5)).toEqual([8, 6, 4, 2]);
	});

	it('places categories at band centers', () => {
		expect(scaleCategory(['Exact', 'React'], 'Exact', [0, 100])).toBe(25);
		expect(scaleCategory(['Exact', 'React'], 'React', [0, 100])).toBe(75);
	});
});
