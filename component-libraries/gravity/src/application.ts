import type { PhysicsBody, PhysicsWorld, Vector2 } from '@exactjs/physics';
import type {
	GravityApplication,
	GravityApplicationInspection,
	GravityApplicationOptions,
	GravityField
} from './contracts.js';

/** Registers a prepared field through a world's ordered force-contributor seam. */
export function applyGravity(
	world: PhysicsWorld,
	field: GravityField,
	options: GravityApplicationOptions = {}
): GravityApplication {
	const bodies = options.bodies ? new Set(options.bodies) : undefined;
	const groups = options.groups ? new Set(options.groups) : undefined;
	const layers = options.collisionLayers ? new Set(options.collisionLayers) : undefined;
	let selectedBodies = 0;
	let sampleCount = 0;
	let clampCount = 0;
	let observedTime = -1;
	let disposed = false;
	const name = options.name ?? field.name;
	const registration = world.addForce({
		name,
		order: options.order,
		apply(body) {
			if (world.time !== observedTime) {
				observedTime = world.time;
				selectedBodies = 0;
			}
			if (
				!readBoolean(options.enabled, true) ||
				!selected(body, bodies, groups, layers, options.predicate)
			) {
				return undefined;
			}
			const scale = readScale(options.scale);
			if (scale === 0) return undefined;
			selectedBodies++;
			sampleCount++;
			const acceleration = field.accelerationAt({
				position: body.pose.position,
				time: world.time,
				mass: body.mass
			});
			const maximum = field.parameters.maxAcceleration;
			if (
				typeof maximum === 'number' &&
				Math.abs(Math.hypot(acceleration.x, acceleration.y) - maximum) <= maximum * 1e-12
			) {
				clampCount++;
			}
			return finiteForce(acceleration, body.mass * scale, field.name);
		}
	});
	return {
		inspect(): GravityApplicationInspection {
			return Object.freeze({ name, field: field.name, selectedBodies, sampleCount, clampCount });
		},
		[Symbol.dispose]() {
			if (disposed) return;
			disposed = true;
			registration[Symbol.dispose]();
		}
	};
}

function selected(
	body: PhysicsBody,
	bodies: Set<PhysicsBody> | undefined,
	groups: Set<string> | undefined,
	layers: Set<string> | undefined,
	predicate: ((body: PhysicsBody) => boolean) | undefined
): boolean {
	if (bodies && !bodies.has(body)) return false;
	if (groups && !body.groups.some((group) => groups.has(group))) return false;
	if (layers && (!body.collisionLayer || !layers.has(body.collisionLayer))) return false;
	return predicate?.(body) ?? true;
}

function readBoolean(value: boolean | (() => boolean) | undefined, fallback: boolean): boolean {
	return value === undefined ? fallback : typeof value === 'function' ? value() : value;
}

function readScale(value: number | (() => number) | undefined): number {
	const scale = value === undefined ? 1 : typeof value === 'function' ? value() : value;
	if (!Number.isFinite(scale)) throw new TypeError('Gravity application scale must be finite');
	return scale;
}

function finiteForce(acceleration: Vector2, factor: number, field: string): Vector2 {
	const force = { x: acceleration.x * factor, y: acceleration.y * factor };
	if (!Number.isFinite(force.x) || !Number.isFinite(force.y)) {
		throw new TypeError(`Gravity field "${field}" produced a non-finite force`);
	}
	return force;
}
