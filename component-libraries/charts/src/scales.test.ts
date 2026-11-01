import { verifyChartNumericValues } from '../../../packages/component-composition-corpus/test-support/chart-numeric-journey.mjs';
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

describe('chart scale numeric boundaries', () => {
	it('shares built-package and browser numeric controls', () => {
		expect(verifyChartNumericValues({ linearTicks, scaleLinear })).toBe(true);
	});
	it.each([
		[1e16, 1e16 + 2],
		[0, Number.MIN_VALUE],
		[-1e308, 1e308],
		[1e-20, 9e-20]
	] as const)('bounds tick work for %s through %s', (low, high) => {
		const ticks = linearTicks([low, high], 100);
		expect(ticks.length).toBeGreaterThan(0);
		expect(ticks.length).toBeLessThanOrEqual(300);
		expect(ticks.every(Number.isFinite)).toBe(true);
		expect(ticks.every((value, index) => index === 0 || value > ticks[index - 1]!)).toBe(true);
		expect(linearTicks([high, low], 100)).toEqual([...ticks].reverse());
	});
	it('maps finite extreme domains and ranges without intermediate overflow', () => {
		expect(scaleLinear({ domain: [-1e308, 1e308], range: [0, 100] }, 0)).toBe(50);
		expect(scaleLinear({ domain: [1e308, -1e308], range: [0, 100] }, 0)).toBe(50);
		expect(scaleLinear({ domain: [1, 1], range: [1e308, 1e308] }, 1)).toBe(1e308);
		expect(scaleLinear({ domain: [1, 1], range: [Number.MIN_VALUE, Number.MIN_VALUE] }, 1)).toBe(
			Number.MIN_VALUE
		);
		expect(scaleLinear({ domain: [0, 1], range: [-1e308, -5e307] }, 3)).toBe(5e307);
		expect(scaleLinear({ domain: [0, 1], range: [-1e308, 1e308] }, 0.5)).toBe(0);
		expect(() => scaleLinear({ domain: [0, 1], range: [0, 1e308] }, 2)).toThrow(/finite/);
	});
});
