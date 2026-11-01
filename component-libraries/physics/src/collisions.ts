import type { PhysicsCollisionListener } from './contracts.js';

/** Names a reusable body collision listener. */
export function definePhysicsCollisionListener(
	name: string,
	listener: (events: Parameters<PhysicsCollisionListener>[0]) => void
): PhysicsCollisionListener {
	if (!name) throw new TypeError('A physics collision listener needs a stable name');
	if (typeof listener !== 'function')
		throw new TypeError('A physics collision listener must be callable');
	return Object.assign(((events) => listener(events)) as PhysicsCollisionListener, {
		physicsName: name
	});
}
