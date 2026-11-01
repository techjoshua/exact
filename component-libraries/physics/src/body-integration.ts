import type { BodyResource } from './body-resource.js';
import { length } from './math.js';

const SLEEP_LINEAR_THRESHOLD = 0.01;
const SLEEP_ANGULAR_THRESHOLD = 0.01;
const SLEEP_AFTER_SECONDS = 0.5;

/** Advances one finite body state. The surrounding world transaction owns rollback on failure. */
export function integrateBody(
	body: BodyResource,
	seconds: number,
	forceX: number,
	forceY: number,
	torque: number
): void {
	if (!Number.isFinite(forceX) || !Number.isFinite(forceY))
		throw new TypeError('Accumulated body force must be finite');
	const state = body.state;
	const velocity = state.velocity;
	const pose = state.pose;
	const position = pose.position;
	const linearDecay = Math.exp(-body.damping * seconds);
	const angularDecay = Math.exp(-body.angularDamping * seconds);
	const nextX = (velocity.x + (forceX / body.mass) * seconds) * linearDecay;
	const nextY = (velocity.y + (forceY / body.mass) * seconds) * linearDecay;
	const nextAngular = (state.angularVelocity + (torque / body.inertia) * seconds) * angularDecay;
	const positionX = position.x + nextX * seconds;
	const positionY = position.y + nextY * seconds;
	const angle = pose.angle + nextAngular * seconds;
	if (
		!Number.isFinite(nextX) ||
		!Number.isFinite(nextY) ||
		!Number.isFinite(nextAngular) ||
		!Number.isFinite(positionX) ||
		!Number.isFinite(positionY) ||
		!Number.isFinite(angle)
	)
		throw new TypeError('Integrated body state must be finite');
	velocity.x = nextX;
	velocity.y = nextY;
	state.angularVelocity = nextAngular;
	position.x = positionX;
	position.y = positionY;
	pose.angle = angle;
}

/** Advances the quiet-time policy after contact resolution within the world transaction. */
export function updateBodySleep(body: BodyResource, seconds: number): void {
	if (body.type !== 'dynamic') return;
	if (
		length(body.velocity) <= SLEEP_LINEAR_THRESHOLD &&
		Math.abs(body.angularVelocity) <= SLEEP_ANGULAR_THRESHOLD
	) {
		body.state.sleepTime += seconds;
		if (body.state.sleepTime >= SLEEP_AFTER_SECONDS) {
			body.state.velocity.x = 0;
			body.state.velocity.y = 0;
			body.state.angularVelocity = 0;
			body.state.sleeping = true;
		}
	} else {
		body.state.sleepTime = 0;
		body.state.sleeping = false;
	}
}
