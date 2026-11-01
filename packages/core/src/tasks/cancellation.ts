import { describeFailureReason } from '../failure-description.js';

/** Realm-stable cancellation identity, separate from application and platform AbortError names. */
const cancellationBrand = Symbol.for('@exactjs/task-cancellation/abi-2');

/** Framework cancellation raised when a task generation loses ownership. */
export class TaskCancellation extends Error {
	readonly reason: unknown;

	/** Creates a cancellation result that is excluded from application task error state. */
	constructor(reason?: unknown) {
		super(describeFailureReason(reason, 'Component task was cancelled'));
		this.name = 'AbortError';
		this.reason = reason;
		Object.defineProperty(this, cancellationBrand, { value: true });
	}
}

/** Recognizes framework cancellation across compatible provider copies in the same realm without trusting an AbortError name. Hostile prototype traps are ordinary failures. */
export function isTaskCancellation(error: unknown): error is TaskCancellation {
	try {
		return (
			error instanceof TaskCancellation ||
			(error instanceof Error &&
				Object.getOwnPropertyDescriptor(error, cancellationBrand)?.value === true)
		);
	} catch {
		return false;
	}
}

/** Links an active child to its parent's cancellation. Release the listener at structural settlement. */
export function linkTaskAbort(
	signal: AbortSignal,
	target: AbortController
): (() => void) | undefined {
	if (signal.aborted) {
		target.abort(signal.reason);
		return;
	}
	const abort = () => target.abort(signal.reason);
	signal.addEventListener('abort', abort, { once: true });
	return () => signal.removeEventListener('abort', abort);
}

/** Rejects promptly when task ownership is cancelled without cancelling the source promise. */
export function raceTaskCancellation<T>(
	signal: AbortSignal,
	settlement: T | PromiseLike<T>
): Promise<T> {
	if (signal.aborted) {
		void Promise.resolve(settlement).catch(() => undefined);
		return Promise.reject(new TaskCancellation(signal.reason));
	}
	return new Promise<T>((resolve, reject) => {
		const cancel = () => reject(new TaskCancellation(signal.reason));
		signal.addEventListener('abort', cancel, { once: true });
		Promise.resolve(settlement).then(
			(value) => {
				signal.removeEventListener('abort', cancel);
				resolve(value);
			},
			(error) => {
				signal.removeEventListener('abort', cancel);
				reject(error);
			}
		);
	});
}
