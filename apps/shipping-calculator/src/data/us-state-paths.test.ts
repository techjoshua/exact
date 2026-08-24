import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Census map paths', () => {
	it('includes the states, DC, and Puerto Rico without projection spikes', async () => {
		const svg = await readFile(new URL('../../public/assets/us-states.svg', import.meta.url), 'utf8');
		const states = [...svg.matchAll(/<path class="[^"]+" data-state="([A-Z]+)" d="([^"]+)"/g)].map(
			(match) => ({ abbreviation: match[1]!, d: match[2]! })
		);
		expect(states).toHaveLength(52);
		expect(states.map((state) => state.abbreviation)).toEqual(
			expect.arrayContaining(['CA', 'AK', 'HI', 'DC', 'PR'])
		);
		for (const state of states) {
			const points = [...state.d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((match) => [
				Number(match[1]),
				Number(match[2])
			]);
			expect(points.length, state.abbreviation).toBeGreaterThan(2);
			for (const [x, y] of points) {
				expect(x, `${state.abbreviation} x`).toBeGreaterThanOrEqual(0);
				expect(x, `${state.abbreviation} x`).toBeLessThanOrEqual(800);
				expect(y, `${state.abbreviation} y`).toBeGreaterThanOrEqual(0);
				expect(y, `${state.abbreviation} y`).toBeLessThanOrEqual(370);
			}
		}
	});
});
