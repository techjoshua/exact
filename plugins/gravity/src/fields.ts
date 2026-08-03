import type { Vector2 } from '@exactjs/physics';
import type {
	BoundedGravityOptions,
	GravityField,
	GravityFieldOptions,
	GravitySamplePoint,
	PointGravityOptions,
	RadialGravityOptions
} from './contracts.js';

const prepared = Symbol('exact.gravity.field');

/** Validates and freezes a reusable pure gravity field. */
export function defineGravityField(
	name: string,
	sample: (point: GravitySamplePoint) => Vector2,
	metadata: { readonly kind?: string; readonly parameters?: Record<string, unknown> } = {}
): GravityField {
	if (!name) throw new TypeError('A gravity field needs a stable name');
	if (typeof sample !== 'function') throw new TypeError('A gravity field needs a sample function');
	return Object.freeze({
		name,
		kind: metadata.kind ?? 'custom',
		parameters: Object.freeze({ ...(metadata.parameters ?? {}) }),
		[prepared]: true,
		accelerationAt(point: GravitySamplePoint) {
			validatePoint(point);
			return finiteVector(sample(point), `gravity field "${name}" result`);
		}
	}) as unknown as GravityField;
}

/** Creates a constant acceleration field. */
export function uniformGravity(
	acceleration: Vector2,
	options: GravityFieldOptions = {}
): GravityField {
	const value = cap(finiteVector(acceleration, 'uniform acceleration'), options.maxAcceleration);
	return defineGravityField(options.name ?? 'uniform gravity', () => value, {
		kind: 'uniform',
		parameters: { acceleration: value, maxAcceleration: options.maxAcceleration }
	});
}

/** Creates a constant acceleration from a direction and magnitude. */
export function directionalGravity(options: {
	readonly name?: string;
	readonly direction: Vector2;
	readonly acceleration: number;
	readonly maxAcceleration?: number;
}): GravityField {
	const direction = finiteVector(options.direction, 'gravity direction');
	const magnitude = Math.hypot(direction.x, direction.y);
	if (magnitude === 0) throw new RangeError('Gravity direction must not be zero');
	const acceleration = nonnegative(options.acceleration, 'gravity acceleration');
	return uniformGravity(
		{ x: (direction.x / magnitude) * acceleration, y: (direction.y / magnitude) * acceleration },
		{ name: options.name ?? 'directional gravity', maxAcceleration: options.maxAcceleration }
	);
}

/** Creates a softened inverse-square point attractor. */
export function pointGravity(options: PointGravityOptions): GravityField {
	const position = finiteVector(options.position, 'point gravity position');
	const strength = nonnegative(options.strength, 'point gravity strength');
	const softening = positive(options.softening, 'point gravity softening');
	const maximum = optionalPositive(options.maxAcceleration, 'point gravity maxAcceleration');
	return defineGravityField(
		options.name ?? 'point gravity',
		(point) => pointAcceleration(position, point.position, strength, softening, maximum),
		{ kind: 'point', parameters: { position, strength, softening, maxAcceleration: maximum } }
	);
}

/** Creates a bounded radial field with an explicit falloff policy. */
export function radialGravity(options: RadialGravityOptions): GravityField {
	const center = finiteVector(options.center, 'radial gravity center');
	const acceleration = finite(options.acceleration, 'radial gravity acceleration');
	const radius =
		options.radius === undefined ? undefined : positive(options.radius, 'radial gravity radius');
	const softening = positive(options.softening ?? 1, 'radial gravity softening');
	const maximum = optionalPositive(options.maxAcceleration, 'radial gravity maxAcceleration');
	const falloff = options.falloff ?? 'constant';
	return defineGravityField(
		options.name ?? 'radial gravity',
		(point) => {
			const delta = { x: center.x - point.position.x, y: center.y - point.position.y };
			const distance = Math.hypot(delta.x, delta.y);
			if (radius !== undefined && distance > radius) return { x: 0, y: 0 };
			if (distance === 0) return { x: 0, y: 0 };
			let magnitude = acceleration;
			if (falloff === 'linear' && radius !== undefined) magnitude *= 1 - distance / radius;
			if (falloff === 'inverse-square') magnitude /= distance * distance + softening * softening;
			return cap(
				{ x: (delta.x / distance) * magnitude, y: (delta.y / distance) * magnitude },
				maximum
			);
		},
		{
			kind: 'radial',
			parameters: { center, acceleration, radius, falloff, softening, maxAcceleration: maximum }
		}
	);
}

/** Restricts another field to an inclusive axis-aligned volume. */
export function boundedGravity(field: GravityField, options: BoundedGravityOptions): GravityField {
	const min = finiteVector(options.min, 'gravity bound min');
	const max = finiteVector(options.max, 'gravity bound max');
	if (min.x > max.x || min.y > max.y) throw new RangeError('Gravity bounds must have min <= max');
	return defineGravityField(
		options.name ?? `bounded ${field.name}`,
		(point) =>
			point.position.x >= min.x &&
			point.position.x <= max.x &&
			point.position.y >= min.y &&
			point.position.y <= max.y
				? field.accelerationAt(point)
				: { x: 0, y: 0 },
		{ kind: 'bounded', parameters: { field: field.name, min, max } }
	);
}

/** Adds several prepared acceleration fields in stable source order. */
export function combineGravity(name: string, fields: readonly GravityField[]): GravityField {
	const stable = Object.freeze([...fields]);
	return defineGravityField(
		name,
		(point) => {
			let x = 0;
			let y = 0;
			for (const field of stable) {
				const value = field.accelerationAt(point);
				x += value.x;
				y += value.y;
			}
			return { x, y };
		},
		{ kind: 'composite', parameters: { fields: stable.map((field) => field.name) } }
	);
}

/** Samples a moving softened point attractor without allocating a field. */
export function pointAcceleration(
	attractor: Vector2,
	position: Vector2,
	strength: number,
	softening: number,
	maxAcceleration?: number
): Vector2 {
	const delta = { x: attractor.x - position.x, y: attractor.y - position.y };
	const distance = Math.hypot(delta.x, delta.y);
	if (distance === 0) return { x: 0, y: 0 };
	const magnitude = strength / (distance * distance + softening * softening);
	return cap(
		{ x: (delta.x / distance) * magnitude, y: (delta.y / distance) * magnitude },
		maxAcceleration
	);
}

function cap(value: Vector2, maximum?: number): Vector2 {
	const limit = optionalPositive(maximum, 'maxAcceleration');
	if (limit === undefined) return Object.freeze({ ...value });
	const magnitude = Math.hypot(value.x, value.y);
	return Object.freeze(
		magnitude > limit
			? { x: (value.x / magnitude) * limit, y: (value.y / magnitude) * limit }
			: { ...value }
	);
}

function validatePoint(point: GravitySamplePoint): void {
	finiteVector(point.position, 'gravity sample position');
	finite(point.time, 'gravity sample time');
	positive(point.mass, 'gravity sample mass');
}

function finiteVector(value: Vector2, name: string): Vector2 {
	return Object.freeze({ x: finite(value.x, `${name}.x`), y: finite(value.y, `${name}.y`) });
}

function finite(value: number, name: string): number {
	if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
	return value;
}

function nonnegative(value: number, name: string): number {
	finite(value, name);
	if (value < 0) throw new RangeError(`${name} must be non-negative`);
	return value;
}

function positive(value: number, name: string): number {
	finite(value, name);
	if (value <= 0) throw new RangeError(`${name} must be positive`);
	return value;
}

function optionalPositive(value: number | undefined, name: string): number | undefined {
	return value === undefined ? undefined : positive(value, name);
}
