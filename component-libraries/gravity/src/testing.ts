import type { GravityField, GravitySamplePoint } from './contracts.js';

/** Samples a field over stable points and returns ordinary values with readonly TypeScript views. */
export function sampleGravity(
	field: GravityField,
	points: readonly GravitySamplePoint[]
): readonly Readonly<{ x: number; y: number }>[] {
	return points.map((point) => field.accelerationAt(point));
}
