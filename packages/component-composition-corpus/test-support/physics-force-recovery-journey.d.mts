import type { createPhysicsWorld } from '../../../component-libraries/physics/src/world.js';
import type { captureReactiveMutations } from '../../reactive/src/internal/deps.js';

/** Executes owned force rollback, authoritative command and coordinate snapshot controls. */
export function verifyPhysicsForceRecovery(api: {
	createPhysicsWorld: typeof createPhysicsWorld;
	captureReactiveMutations: typeof captureReactiveMutations;
}): true;

/** Executes ordinary readonly aliases and independent snapshot controls. */
export function verifyPhysicsReadonlyValues(api: {
	createPhysicsWorld: typeof createPhysicsWorld;
	definePhysicsProjection: typeof import('../../../component-libraries/physics/src/projections.js').definePhysicsProjection;
	definePhysicsCollisionListener: typeof import('../../../component-libraries/physics/src/collisions.js').definePhysicsCollisionListener;
}): true;

/** Executes correction and queued-command numeric failure, rollback and repair controls. */
export function verifyPhysicsFiniteCorrections(api: {
	createPhysicsWorld: typeof createPhysicsWorld;
}): true;

/** Executes finite clock rejection and committed timeline preservation controls. */
export function verifyPhysicsClockArithmetic(api: {
	createPhysicsWorld: typeof createPhysicsWorld;
}): true;
