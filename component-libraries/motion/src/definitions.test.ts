import { describe, expect, it } from 'vitest';
import { resolveMotionEffect } from './playback.js';
import type { MotionEffect, MotionPhase } from './contracts.js';
import { defineMotion, isMotionDefinition } from './definitions.js';
import { fade, pop, scale, slideDown, slideLeft, slideRight, slideUp } from './presets.js';

describe('motion definitions', () => {
	it('prepares reusable snapshots with ordinary mutable nested values and aliases', () => {
		const source = { keyframes: [{ opacity: 0 }, { opacity: 1 }], options: { duration: 120 } };
		const definition = defineMotion({ enter: source, reduced: 'skip' });
		const effect = definition.enter as MotionEffect;
		expect(isMotionDefinition(definition)).toBe(true);
		effect.options!.duration = 300;
		(effect.keyframes as Keyframe[])[0]!.opacity = 0.5;
		(effect.keyframes as Keyframe[]).push({ opacity: 0.8 });
		expect(source.options.duration).toBe(120);
		expect(source.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
		const alias: { enter?: MotionPhase } = definition;
		alias.enter = { keyframes: [{ opacity: 1 }] };
		expect(definition.enter).toBe(alias.enter);
		effect.options!.duration = NaN;
		expect(() =>
			resolveMotionEffect(effect, {} as Element, 'enter', {
				enabled: true,
				reducedMotion: 'never',
				transition: {},
				appear: false
			})
		).toThrow('duration must be finite');
	});

	it.each([-1, -120])('allows finite negative start delay %s', (delay) => {
		const definition = defineMotion({
			leave: { keyframes: [{ opacity: 0 }], options: { delay, duration: 120 } }
		});
		expect((definition.leave as MotionEffect).options!.delay).toBe(delay);
	});

	it('rejects effects without keyframes', () => {
		expect(() => defineMotion({ enter: {} as never })).toThrow('requires keyframes');
	});

	it('rejects non-settling timing during preparation', () => {
		expect(() =>
			defineMotion({
				leave: { keyframes: [{ opacity: 0 }], options: { iterations: Infinity } }
			})
		).toThrow('iterations must be finite');
		expect(() =>
			defineMotion({
				change: { keyframes: [{ opacity: 1 }], options: { duration: Number.NaN } }
			})
		).toThrow('duration must be finite');
	});

	it('allows component-owned enter and change loops but keeps leave finite', () => {
		const loop = defineMotion({
			enter: {
				keyframes: [{ opacity: 0.5 }, { opacity: 1 }],
				options: { duration: 500, iterations: Infinity }
			}
		});
		expect((loop.enter as { options: KeyframeAnimationOptions }).options.iterations).toBe(Infinity);
		expect(() =>
			defineMotion({
				leave: {
					keyframes: [{ opacity: 0 }],
					options: { duration: 500, iterations: Infinity }
				}
			})
		).toThrow('iterations must be finite');
	});

	it('ships a small stable side-effect-free preset set', () => {
		for (const preset of [fade, scale, pop, slideUp, slideDown, slideLeft, slideRight]) {
			expect(isMotionDefinition(preset)).toBe(true);
			expect(preset.enter).toBeDefined();
			expect(preset.leave).toBeDefined();
		}
	});
});

it('validates the captured static timing rather than rereading authored getters', () => {
	let reads = 0;
	const definition = defineMotion({
		enter: {
			keyframes: [{ opacity: 0 }],
			options: {
				get duration() {
					return ++reads <= 2 ? 120 : NaN;
				}
			}
		}
	});
	expect(reads).toBe(1);
	expect((definition.enter as MotionEffect).options!.duration).toBe(120);
});
