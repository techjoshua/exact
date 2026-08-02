import { describe, expect, it } from 'vitest';
import { defineMotion, isMotionDefinition } from './definitions.js';
import { fade, pop, scale, slideDown, slideLeft, slideRight, slideUp } from './presets.js';

describe('motion definitions', () => {
	it('prepares immutable reusable definitions', () => {
		const definition = defineMotion({
			enter: {
				keyframes: [{ opacity: 0 }, { opacity: 1 }],
				options: { duration: 120 }
			},
			reduced: 'skip'
		});

		expect(isMotionDefinition(definition)).toBe(true);
		expect(Object.isFrozen(definition)).toBe(true);
		expect(Object.isFrozen(definition.enter)).toBe(true);
		expect(Object.isFrozen((definition.enter as { keyframes: Keyframe[] }).keyframes)).toBe(true);
		expect(
			() => ((definition.enter as { options: { duration: number } }).options.duration = 300)
		).toThrow();
	});

	it('rejects effects without keyframes', () => {
		expect(() => defineMotion({ enter: {} as never })).toThrow('requires keyframes');
	});

	it('ships a small stable side-effect-free preset set', () => {
		for (const preset of [fade, scale, pop, slideUp, slideDown, slideLeft, slideRight]) {
			expect(isMotionDefinition(preset)).toBe(true);
			expect(preset.enter).toBeDefined();
			expect(preset.leave).toBeDefined();
		}
	});
});
