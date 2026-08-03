/** Framework cancellation raised when a task generation loses ownership. */
export class TaskCancellation extends Error {
	readonly reason: unknown;

	/** Creates a cancellation result that is excluded from application task error state. */
	constructor(reason?: unknown) {
		super(reason === undefined ? 'Component task was cancelled' : String(reason));
		this.name = 'AbortError';
		this.reason = reason;
	}
}

/** Reports whether a rejected value represents framework task cancellation. */
export function isTaskCancellation(error: unknown): error is TaskCancellation {
	return error instanceof TaskCancellation;
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
