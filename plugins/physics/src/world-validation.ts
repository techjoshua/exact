import type { PhysicsShape } from './contracts.js';

export function validateShape(shape: PhysicsShape): PhysicsShape {
	if (shape.kind === 'circle')
		return Object.freeze({ kind: 'circle', radius: positive(shape.radius, 'radius') });
	return Object.freeze({
		kind: 'box',
		width: positive(shape.width, 'width'),
		height: positive(shape.height, 'height')
	});
}

export function shapeInertia(shape: PhysicsShape, mass: number): number {
	return shape.kind === 'circle'
		? (mass * shape.radius * shape.radius) / 2
		: (mass * (shape.width * shape.width + shape.height * shape.height)) / 12;
}

export function finite(value: number, name: string): number {
	if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
	return value;
}

export function nonnegative(value: number, name: string): number {
	finite(value, name);
	if (value < 0) throw new RangeError(`${name} must be non-negative`);
	return value;
}

export function positive(value: number, name: string): number {
	finite(value, name);
	if (value <= 0) throw new RangeError(`${name} must be positive`);
	return value;
}

export function unit(value: number, name: string): number {
	finite(value, name);
	if (value < 0 || value > 1) throw new RangeError(`${name} must be between 0 and 1`);
	return value;
}

export function positiveInteger(value: number, name: string): number {
	if (!Number.isInteger(value) || value <= 0)
		throw new RangeError(`${name} must be a positive integer`);
	return value;
}
