import type { PhysicsCollisionEvent, Vector2 } from './contracts.js';
import { add, dot, length, normalize, scale, subtract } from './math.js';
import type { BodyResource } from './body-resource.js';

/** Contact manifold retained across fixed steps for lifecycle event publication. */
export interface PhysicsContact {
	bodyA: BodyResource;
	bodyB: BodyResource;
	normal: Vector2;
	penetration: number;
	point: Vector2;
}

/** Finds a contact for the supported finite circle/box shape combinations. */
export function collideBodies(
	bodyA: BodyResource,
	bodyB: BodyResource
): PhysicsContact | undefined {
	if (bodyA.shape.kind === 'circle' && bodyB.shape.kind === 'circle') {
		return circleCircle(bodyA, bodyB);
	}
	if (bodyA.shape.kind === 'box' && bodyB.shape.kind === 'box') return boxBox(bodyA, bodyB);
	if (bodyA.shape.kind === 'circle') return circleBox(bodyA, bodyB);
	const reversed = circleBox(bodyB, bodyA);
	return reversed ? { ...reversed, bodyA, bodyB, normal: scale(reversed.normal, -1) } : undefined;
}

function circleCircle(bodyA: BodyResource, bodyB: BodyResource): PhysicsContact | undefined {
	if (bodyA.shape.kind !== 'circle' || bodyB.shape.kind !== 'circle') return undefined;
	const delta = subtract(bodyB.pose.position, bodyA.pose.position);
	const distance = length(delta);
	const radius = bodyA.shape.radius + bodyB.shape.radius;
	if (distance >= radius) return undefined;
	const normal = normalize(delta);
	return {
		bodyA,
		bodyB,
		normal,
		penetration: radius - distance,
		point: add(bodyA.pose.position, scale(normal, bodyA.shape.radius))
	};
}

function boxBox(bodyA: BodyResource, bodyB: BodyResource): PhysicsContact | undefined {
	if (bodyA.shape.kind !== 'box' || bodyB.shape.kind !== 'box') return undefined;
	const delta = subtract(bodyB.pose.position, bodyA.pose.position);
	const overlapX = (bodyA.shape.width + bodyB.shape.width) / 2 - Math.abs(delta.x);
	const overlapY = (bodyA.shape.height + bodyB.shape.height) / 2 - Math.abs(delta.y);
	if (overlapX <= 0 || overlapY <= 0) return undefined;
	const alongX = overlapX < overlapY;
	const normal = alongX ? { x: delta.x < 0 ? -1 : 1, y: 0 } : { x: 0, y: delta.y < 0 ? -1 : 1 };
	return {
		bodyA,
		bodyB,
		normal,
		penetration: alongX ? overlapX : overlapY,
		point: scale(add(bodyA.pose.position, bodyB.pose.position), 0.5)
	};
}

function circleBox(circle: BodyResource, box: BodyResource): PhysicsContact | undefined {
	if (circle.shape.kind !== 'circle' || box.shape.kind !== 'box') return undefined;
	const halfWidth = box.shape.width / 2;
	const halfHeight = box.shape.height / 2;
	const relative = subtract(circle.pose.position, box.pose.position);
	const closest = {
		x: Math.max(-halfWidth, Math.min(halfWidth, relative.x)),
		y: Math.max(-halfHeight, Math.min(halfHeight, relative.y))
	};
	const point = add(box.pose.position, closest);
	const fromCircle = subtract(point, circle.pose.position);
	const distance = length(fromCircle);
	if (distance >= circle.shape.radius) return undefined;
	let normal = normalize(fromCircle, { x: 1, y: 0 });
	let penetration = circle.shape.radius - distance;
	if (distance < 1e-12) {
		const gapX = halfWidth - Math.abs(relative.x);
		const gapY = halfHeight - Math.abs(relative.y);
		normal =
			gapX < gapY ? { x: relative.x < 0 ? 1 : -1, y: 0 } : { x: 0, y: relative.y < 0 ? 1 : -1 };
		penetration = circle.shape.radius + Math.min(gapX, gapY);
	}
	return { bodyA: circle, bodyB: box, normal, penetration, point };
}

/** Applies the normal collision impulse for one solver iteration. */
export function resolveContactVelocity(contact: PhysicsContact): void {
	const inverseA = inverseMass(contact.bodyA);
	const inverseB = inverseMass(contact.bodyB);
	const total = inverseA + inverseB;
	if (total === 0) return;
	const relative = subtract(contact.bodyB.velocity, contact.bodyA.velocity);
	const normalVelocity = dot(relative, contact.normal);
	if (normalVelocity >= 0) return;
	const restitution = Math.min(contact.bodyA.restitution, contact.bodyB.restitution);
	const impulseMagnitude = (-(1 + restitution) * normalVelocity) / total;
	const impulse = scale(contact.normal, impulseMagnitude);
	if (inverseA) changeVelocity(contact.bodyA, scale(impulse, -inverseA));
	if (inverseB) changeVelocity(contact.bodyB, scale(impulse, inverseB));
	contact.bodyA.wakeNow();
	contact.bodyB.wakeNow();
}

/** Applies positional correction for one contact solver iteration. */
export function resolveContactPosition(contact: PhysicsContact): void {
	const inverseA = inverseMass(contact.bodyA);
	const inverseB = inverseMass(contact.bodyB);
	const total = inverseA + inverseB;
	if (total === 0) return;
	const correction = scale(contact.normal, Math.max(contact.penetration - 1e-5, 0) / total);
	if (inverseA) moveBody(contact.bodyA, scale(correction, -inverseA));
	if (inverseB) moveBody(contact.bodyB, scale(correction, inverseB));
}

export function inverseMass(body: BodyResource): number {
	return body.type === 'dynamic' ? 1 / body.mass : 0;
}

export function moveBody(body: BodyResource, delta: Vector2): void {
	body.state.pose.position.x += delta.x;
	body.state.pose.position.y += delta.y;
}

function changeVelocity(body: BodyResource, delta: Vector2): void {
	body.state.velocity.x += delta.x;
	body.state.velocity.y += delta.y;
}

/** Creates the immutable collision event exposed by the world API. */
export function physicsContactEvent(
	phase: 'begin' | 'persist' | 'end',
	contact: PhysicsContact,
	step: number
): PhysicsCollisionEvent {
	return Object.freeze({
		phase,
		bodyA: contact.bodyA,
		bodyB: contact.bodyB,
		normal: Object.freeze({ ...contact.normal }),
		penetration: contact.penetration,
		point: Object.freeze({ ...contact.point }),
		step
	});
}

/** Stable pair identity for contact lifecycle tracking. */
export function physicsContactKey(a: BodyResource, b: BodyResource): string {
	return `${a.id}\u0000${b.id}`;
}
