import type { Vector2 } from './contracts.js';

/** Adds two vectors without mutating either operand. */
export function add(a: Vector2, b: Vector2): Vector2 {
	return { x: a.x + b.x, y: a.y + b.y };
}

/** Subtracts the second vector from the first. */
export function subtract(a: Vector2, b: Vector2): Vector2 {
	return { x: a.x - b.x, y: a.y - b.y };
}

/** Multiplies both coordinates by a scalar. */
export function scale(value: Vector2, factor: number): Vector2 {
	return { x: value.x * factor, y: value.y * factor };
}

/** Computes the scalar dot product. */
export function dot(a: Vector2, b: Vector2): number {
	return a.x * b.x + a.y * b.y;
}

/** Computes a vector's Euclidean magnitude. */
export function length(value: Vector2): number {
	return Math.hypot(value.x, value.y);
}

/** Returns a unit vector, or the supplied fallback for a near-zero input. */
export function normalize(value: Vector2, fallback: Vector2 = { x: 1, y: 0 }): Vector2 {
	const magnitude = length(value);
	return magnitude > 1e-12 ? scale(value, 1 / magnitude) : fallback;
}

/** Computes the two-dimensional scalar cross product. */
export function cross(a: Vector2, b: Vector2): number {
	return a.x * b.y - a.y * b.x;
}

/** Validates and copies an externally supplied vector. */
export function finiteVector(value: Vector2, label: string): Vector2 {
	if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) {
		throw new TypeError(`${label} must contain finite coordinates`);
	}
	return { x: value.x, y: value.y };
}
