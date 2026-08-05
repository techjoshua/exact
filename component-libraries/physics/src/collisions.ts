import type { PhysicsCollisionListener } from './contracts.js';

const prepared = Symbol('exact.physics.collision-listener');

/** Names and freezes a reusable body collision listener. */
export function definePhysicsCollisionListener(
	name: string,
	listener: (events: Parameters<PhysicsCollisionListener>[0]) => void
): PhysicsCollisionListener {
	if (!name) throw new TypeError('A physics collision listener needs a stable name');
	if (typeof listener !== 'function') throw new TypeError('A physics collision listener must be callable');
	const preparedListener = ((events) => listener(events)) as PhysicsCollisionListener;
	Object.defineProperties(preparedListener, {
		physicsName: { value: name, enumerable: true },
		[prepared]: { value: true }
	});
	return Object.freeze(preparedListener);
}
