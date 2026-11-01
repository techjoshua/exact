import { attachSuppressedCleanupFailure, taskAwait } from '@exactjs/core';

/** Associates caller cancellation with an owned controller and identity-checked state cleanup. */
export type OwnRequestCancellation = (abort: AbortController, retire: () => void) => void;

/**
 * Rejects canceled callers with their exact reason without waiting for uncooperative work.
 * Cancels owned work before retiring its state, observes late settlement, and releases its listener.
 */
export function runRequestOperation<T>(
	signal: AbortSignal | null | undefined,
	work: (own: OwnRequestCancellation) => Promise<T>
): Promise<T> {
	return signal ? runCancelableRequest(signal, work) : work(detachedRequest);
}

/** Leaves router-owned cancellation in charge when no caller signal was supplied. */
const detachedRequest: OwnRequestCancellation = () => {};

/** Retains all delegated cancellation bindings until the caller operation settles. */
async function runCancelableRequest<T>(
	signal: AbortSignal,
	work: (own: OwnRequestCancellation) => Promise<T>
): Promise<T> {
	signal.throwIfAborted();
	const cancellations: (() => void)[] = [];
	const onAbort = () => {
		for (const cancel of cancellations) cancel();
	};
	signal.addEventListener('abort', onAbort, { once: true });
	try {
		const pending = work((abort, retire) => {
			const cancel = () => {
				abort.abort(signal.reason);
				try {
					retire();
				} catch (cleanup) {
					attachSuppressedCleanupFailure(signal.reason, cleanup);
				}
			};
			cancellations.push(cancel);
			if (signal.aborted) cancel();
		});
		return await taskAwait(signal, pending);
	} catch (error) {
		if (signal.aborted) throw signal.reason;
		throw error;
	} finally {
		signal.removeEventListener('abort', onAbort);
	}
}
