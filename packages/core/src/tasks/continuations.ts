import { InteractionCancellation } from '../interaction/execution.js';
import type { ReservedTaskCallback, TaskContext } from './contracts.js';
import {
	attachTaskFrameSettlement,
	frameForTaskContext,
	withTaskFrameRecord
} from './frame-runtime.js';

/** Restores the task frame for one manually authored synchronous continuation. */
export function runTaskContinuation<T>(task: TaskContext, work: () => T): T {
	return withTaskFrameRecord(frameForTaskContext(task), work);
}

/** Attributes a synchronous reactive read segment to a retained task frame. */
export function trackTaskReads<T>(task: TaskContext, read: () => T): T {
	return runTaskContinuation(task, read);
}

/**
 * Binds causal ownership for a future callback without retaining the current
 * structural parent.
 */
export function bindTaskCallback<Args extends unknown[], Result>(
	task: TaskContext,
	callback: (...args: Args) => Result
): (...args: Args) => Result {
	const owner = frameForTaskContext(task).owner;
	return (...args) => {
		if (owner.signal.aborted) throw new InteractionCancellation(owner.signal.reason);
		return callback(...args);
	};
}

/** Reserves one structural child before exposing a callback to an external scheduler. */
export function reserveTaskCallback<Args extends unknown[], Result>(
	task: TaskContext,
	callback: (...args: Args) => Result
): ReservedTaskCallback<Args, Result> {
	const parent = frameForTaskContext(task);
	let used = false;
	let release!: () => void;
	const reservation = new Promise<void>((resolve) => {
		release = resolve;
	});
	attachTaskFrameSettlement(parent, reservation);
	const bound = ((...args: Args) => {
		if (used) throw new Error('Reserved task callback was already released');
		used = true;
		try {
			return withTaskFrameRecord(parent, () => callback(...args));
		} finally {
			release();
		}
	}) as ReservedTaskCallback<Args, Result>;
	bound.cancel = () => {
		if (used) return;
		used = true;
		release();
	};
	bound[Symbol.dispose] = bound.cancel;
	return bound;
}
