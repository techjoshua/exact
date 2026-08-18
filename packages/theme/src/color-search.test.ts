import { describe, expect, it } from 'vitest';
import {
	contrastRatio,
	ensureColorContrast,
	orderedLightnessCandidates,
	resolveColor
} from './color.js';
import type { ResolvedColor, ThemeAppearance } from './contracts.js';

describe('theme lightness search', () => {
	it('matches the exact exhaustive-grid result while visiting nearest candidates first', () => {
		const backgrounds = [
			[resolveColor({ l: 0.06, c: 0.01, h: 250 })],
			[resolveColor({ l: 0.96, c: 0.02, h: 80 })],
			[resolveColor({ l: 0.15, c: 0.03, h: 240 }), resolveColor({ l: 0.86, c: 0.02, h: 100 })]
		];
		for (const appearance of ['light', 'dark'] as const) {
			for (const requested of [
				{ l: 0.1835, c: 0.12, h: 24 },
				{ l: 0.51, c: 0.22, h: 278 },
				{ l: 0.8774, c: 0.08, h: 145 }
			]) {
				for (const against of backgrounds) {
					const actual = ensureColorContrast(requested, against, 4.5, appearance);
					const expected = exhaustiveContrast(requested, against, 4.5, appearance);
					expect(actual).toEqual(expected);
				}
			}
		}
	});

	it('enumerates the complete fixed grid in nondecreasing distance', () => {
		const candidates = [...orderedLightnessCandidates(0.5374)];
		expect(candidates).toHaveLength(1001);
		expect(new Set(candidates.map((candidate) => candidate.lightness)).size).toBe(1001);
		for (let index = 1; index < candidates.length; index++)
			expect(candidates[index]!.distance).toBeGreaterThanOrEqual(candidates[index - 1]!.distance);
	});
});

function exhaustiveContrast(
	requested: { l: number; c: number; h: number },
	backgrounds: readonly ResolvedColor[],
	ratio: number,
	appearance: ThemeAppearance
): { color: ResolvedColor; maximized: boolean } {
	let selected: { color: ResolvedColor; distance: number; minimum: number } | undefined;
	let fallback: { color: ResolvedColor; distance: number; minimum: number } | undefined;
	for (let step = 0; step <= 1000; step++) {
		const color = resolveColor({ ...requested, l: step / 1000 });
		const minimum = Math.min(...backgrounds.map((background) => contrastRatio(color, background)));
		const distance = Math.abs(step / 1000 - requested.l);
		const winsTie = (candidate: { color: ResolvedColor }) =>
			appearance === 'light'
				? color.oklch.l < candidate.color.oklch.l
				: color.oklch.l > candidate.color.oklch.l;
		if (
			minimum >= ratio &&
			(!selected ||
				distance < selected.distance ||
				(distance === selected.distance && winsTie(selected)))
		)
			selected = { color, distance, minimum };
		if (
			!fallback ||
			minimum > fallback.minimum ||
			(minimum === fallback.minimum && winsTie(fallback))
		)
			fallback = { color, distance, minimum };
	}
	return selected
		? { color: selected.color, maximized: false }
		: { color: fallback!.color, maximized: true };
}
