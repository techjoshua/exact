import { describe, expect, it } from 'vitest';
import type { Vector2 } from '@exactjs/physics';
import type { GravityField } from './contracts.js';
import { defineGravityAttractor } from './attractors.js';
import { defineGravityField, uniformGravity } from './fields.js';
import { sampleGravity } from './testing.js';
import { verifyGravityReadonlyValues } from '../../../packages/component-composition-corpus/test-support/gravity-readonly-journey.mjs';

const point = { position: { x: 0, y: 0 }, time: 0, mass: 1 };

/** Compile-time controls keep readonly shallow while runtime aliases remain writable. */
function readonlyControls(field: GravityField, vector: Vector2): void {
	// @ts-expect-error field metadata is readonly through this reference
	field.name = 'changed';
	// @ts-expect-error vector coordinates are readonly through this reference
	vector.x = 9;
}
void readonlyControls;

describe('gravity TypeScript readonly values', () => {
	it('validates the captured attractor definition rather than rereading authored accessors', () => {
		let reads = 0;
		const definition = defineGravityAttractor({
			get strength() {
				return ++reads === 1 ? 100 : Number.NaN;
			},
			softening: 1
		});
		expect(definition.strength).toBe(100);
		expect(reads).toBe(1);
	});
	it('shares the native and browser readonly journey', () => {
		expect(
			verifyGravityReadonlyValues({
				uniformGravity,
				defineGravityField,
				defineGravityAttractor,
				sampleGravity
			})
		).toBe(true);
	});
	it('allows writable field aliases and ordinary method assignment', () => {
		const field = uniformGravity({ x: 1, y: 2 });
		const alias: { name: string } = field;
		alias.name = 'updated';
		field.accelerationAt = () => ({ x: 3, y: 4 });
		expect(field.name).toBe('updated');
		expect(field.accelerationAt(point)).toEqual({ x: 3, y: 4 });
	});

	it('returns independent sample values that permit writable aliases', () => {
		const field = uniformGravity({ x: 1, y: 2 });
		const value: { x: number; y: number } = field.accelerationAt(point);
		value.x = 9;
		expect(value.x).toBe(9);
		expect(field.accelerationAt(point)).toEqual({ x: 1, y: 2 });
		const sampled = sampleGravity(field, [point]) as { x: number; y: number }[];
		sampled[0]!.y = 8;
		sampled.push({ x: 0, y: 0 });
		expect(sampled).toEqual([
			{ x: 1, y: 8 },
			{ x: 0, y: 0 }
		]);
	});

	it('keeps nested metadata mutable and prepared inputs separate from the authored object', () => {
		const nested = { label: 'before' };
		const field = defineGravityField('custom', () => ({ x: 0, y: 0 }), { parameters: { nested } });
		nested.label = 'after';
		expect(field.parameters.nested).toBe(nested);
		const parameters: Record<string, unknown> = field.parameters;
		parameters.extra = true;
		expect(field.parameters.extra).toBe(true);
		const input = { strength: 100, softening: 1 };
		const attractor = defineGravityAttractor(input);
		input.strength = 200;
		expect(attractor.strength).toBe(100);
		const alias: { strength: number } = attractor;
		alias.strength = 300;
		expect(attractor.strength).toBe(300);
	});
});
