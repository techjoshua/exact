import type { PhysicsShape } from './contracts.js';

/** Validates positive shape dimensions and returns an immutable canonical shape. */
export function validateShape(shape: PhysicsShape): PhysicsShape {
	if (shape.kind === 'circle')
		return Object.freeze({ kind: 'circle', radius: positive(shape.radius, 'radius') });
	return Object.freeze({
		kind: 'box',
		width: positive(shape.width, 'width'),
		height: positive(shape.height, 'height')
	});
}

/** Computes planar rotational inertia for a centered circle or axis-aligned box. */
export function shapeInertia(shape: PhysicsShape, mass: number): number {
	return shape.kind === 'circle'
		? (mass * shape.radius * shape.radius) / 2
		: (mass * (shape.width * shape.width + shape.height * shape.height)) / 12;
}

/** Returns a finite authored number or throws a field-named type error. */
export function finite(value: number, name: string): number {
	if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
	return value;
}

/** Returns a finite number greater than or equal to zero or throws a field-named range error. */
export function nonnegative(value: number, name: string): number {
	finite(value, name);
	if (value < 0) throw new RangeError(`${name} must be non-negative`);
	return value;
}

/** Returns a finite number greater than zero or throws a field-named range error. */
export function positive(value: number, name: string): number {
	finite(value, name);
	if (value <= 0) throw new RangeError(`${name} must be positive`);
	return value;
}

/** Returns a finite value in the inclusive zero-to-one interval or throws. */
export function unit(value: number, name: string): number {
	finite(value, name);
	if (value < 0 || value > 1) throw new RangeError(`${name} must be between 0 and 1`);
	return value;
}

/** Returns a positive integer or throws a field-named range error. */
export function positiveInteger(value: number, name: string): number {
	if (!Number.isInteger(value) || value <= 0)
		throw new RangeError(`${name} must be a positive integer`);
	return value;
}
