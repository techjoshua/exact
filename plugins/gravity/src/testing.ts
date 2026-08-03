import type { GravityField, GravitySamplePoint } from './contracts.js';

/** Samples a field over stable points and returns frozen acceleration results. */
export function sampleGravity(
	field: GravityField,
	points: readonly GravitySamplePoint[]
): readonly Readonly<{ x: number; y: number }>[] {
	return Object.freeze(points.map((point) => Object.freeze(field.accelerationAt(point))));
}
