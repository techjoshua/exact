import { describe, expect, it } from 'vitest';
import { usStatePaths } from './us-state-paths.js';

describe('Census map paths', () => {
	it('includes the states, DC, and Puerto Rico without projection spikes', () => {
		expect(usStatePaths).toHaveLength(52);
		expect(usStatePaths.map((state) => state.abbreviation)).toEqual(
			expect.arrayContaining(['CA', 'AK', 'HI', 'DC', 'PR'])
		);
		for (const state of usStatePaths) {
			const points = [...state.d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((match) => [
				Number(match[1]),
				Number(match[2])
			]);
			expect(points.length, state.name).toBeGreaterThan(2);
			for (const [x, y] of points) {
				expect(x, `${state.name} x`).toBeGreaterThanOrEqual(0);
				expect(x, `${state.name} x`).toBeLessThanOrEqual(800);
				expect(y, `${state.name} y`).toBeGreaterThanOrEqual(0);
				expect(y, `${state.name} y`).toBeLessThanOrEqual(370);
			}
		}
	});
});
