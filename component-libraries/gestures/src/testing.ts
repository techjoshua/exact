import { installGestureClock, type GestureClock } from './session.js';

/** Deterministic monotonic clock for gesture recognition tests. */
export interface GestureTestClock extends GestureClock {
	advance(milliseconds: number): void;
}

/** Creates a deterministic manually advanced gesture clock. */
export function createGestureTestClock(initial = 0): GestureTestClock {
	let current = initial;
	return {
		now: () => current,
		advance(milliseconds) {
			if (!Number.isFinite(milliseconds) || milliseconds < 0)
				throw new RangeError('Gesture test time must advance by a non-negative finite value');
			current += milliseconds;
		}
	};
}

export { installGestureClock };
