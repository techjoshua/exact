import { describe, expect, it } from 'vitest';
import {
	boundedGravity,
	combineGravity,
	pointGravity,
	radialGravity,
	uniformGravity
} from './fields.js';

const sample = (x: number, y: number) => ({ position: { x, y }, time: 0, mass: 1 });

describe('gravity fields', () => {
	it('samples uniform and composite fields without a physics world', () => {
		const field = combineGravity('combined', [
			uniformGravity({ x: 2, y: 3 }),
			uniformGravity({ x: -1, y: 4 })
		]);
		expect(field.accelerationAt(sample(100, -20))).toEqual({ x: 1, y: 7 });
		expect(Object.isFrozen(field)).toBe(true);
	});

	it('keeps softened point gravity finite, symmetric, monotonic, and capped', () => {
		const field = pointGravity({
			position: { x: 0, y: 0 },
			strength: 1_000,
			softening: 2,
			maxAcceleration: 25
		});
		const right = field.accelerationAt(sample(3, 0));
		const left = field.accelerationAt(sample(-3, 0));
		expect(right.x).toBeCloseTo(-left.x);
		expect(right.y).toBe(0);
		expect(Math.hypot(right.x, right.y)).toBeLessThanOrEqual(25);
		expect(Math.abs(field.accelerationAt(sample(20, 0)).x)).toBeLessThan(Math.abs(right.x));
		for (let index = 0; index < 100; index++) {
			const value = field.accelerationAt(sample(index / 10, -index / 7));
			expect(Number.isFinite(value.x) && Number.isFinite(value.y)).toBe(true);
		}
	});

	it('supports bounded radial falloff', () => {
		const radial = radialGravity({
			center: { x: 0, y: 0 },
			acceleration: 10,
			radius: 10,
			falloff: 'linear'
		});
		const bounded = boundedGravity(radial, { min: { x: -5, y: -5 }, max: { x: 5, y: 5 } });
		expect(bounded.accelerationAt(sample(5, 0))).toEqual({ x: -5, y: 0 });
		expect(bounded.accelerationAt(sample(6, 0))).toEqual({ x: 0, y: 0 });
	});

	it('rejects singular and non-finite preparation', () => {
		expect(() => pointGravity({ position: { x: 0, y: 0 }, strength: 1, softening: 0 })).toThrow(
			'softening'
		);
		expect(() => uniformGravity({ x: Number.NaN, y: 0 })).toThrow('finite');
	});
});
