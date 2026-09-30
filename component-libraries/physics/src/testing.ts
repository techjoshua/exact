import type { PhysicsStepResult, PhysicsWorld } from './contracts.js';

/** Deterministic clock that advances a world only when instructed by a test. */
export interface PhysicsManualClock {
	readonly elapsedSeconds: number;
	advance(elapsedSeconds: number): PhysicsStepResult;
	steps(count?: number): PhysicsStepResult;
}

/**
 * Advances a physics world explicitly for deterministic tests, with elapsed time in seconds.
 * `steps(count)` advances by `count * fixedStep`, defaulting to 1/120 second per step.
 * The clock does not read the world's configured step. Pass the same interval when the test
 * needs each clock step to match the world's simulation step.
 */
export function createPhysicsManualClock(
	world: PhysicsWorld,
	fixedStep = 1 / 120
): PhysicsManualClock {
	let elapsedSeconds = 0;
	return {
		get elapsedSeconds() {
			return elapsedSeconds;
		},
		advance(elapsed) {
			if (!Number.isFinite(elapsed) || elapsed < 0) {
				throw new RangeError('Manual clock elapsed time must be finite and non-negative');
			}
			elapsedSeconds += elapsed;
			return world.step(elapsed);
		},
		steps(count = 1) {
			if (!Number.isInteger(count) || count < 0) {
				throw new RangeError('Manual clock step count must be a non-negative integer');
			}
			return this.advance(count * fixedStep);
		}
	};
}
