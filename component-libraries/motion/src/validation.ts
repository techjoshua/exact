import type { MotionEffect } from './contracts.js';

/** Rejects effects whose authored timing cannot settle as finite motion work. */
export function validateMotionEffect(
	effect: MotionEffect,
	label = 'motion effect',
	options: { allowInfiniteIterations?: boolean } = {}
): void {
	if (!effect || typeof effect !== 'object' || !effect.keyframes) {
		throw new TypeError(`${label} requires keyframes`);
	}
	const timing = effect.options;
	if (!timing) return;
	finiteNonnegative(timing.delay, `${label} delay`);
	finiteNonnegative(timing.endDelay, `${label} endDelay`, true);
	finiteNonnegative(timing.iterationStart, `${label} iterationStart`);
	if (timing.iterations === Infinity && options.allowInfiniteIterations) {
		// Component-owned looping playback is detached from structural settlement.
	} else {
		finiteNonnegative(timing.iterations, `${label} iterations`);
	}
	if (typeof timing.duration === 'number') {
		finiteNonnegative(timing.duration, `${label} duration`);
	}
}

function finiteNonnegative(value: number | undefined, label: string, allowNegative = false): void {
	if (value === undefined) return;
	if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
	if (!allowNegative && value < 0) throw new RangeError(`${label} must be non-negative`);
}
