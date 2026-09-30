import type { ExactInvocationResult, PendingExactOperation } from './types.js';

/**
 * Owns one invocation's settlement and callbacks independently of a shared batch transport.
 * Cancellation settles immediately. Late transport events remain validatable but cannot reach
 * this invocation, and a response callback failure rejects only its own operation.
 */
export function ownPendingExactOperation(
	options: Omit<PendingExactOperation, 'resolve' | 'reject'>,
	resolve: (result: ExactInvocationResult) => void,
	reject: (error: unknown) => void
): PendingExactOperation {
	let settled = false;
	let progressClosed = false;
	const closeProgress = () => {
		if (progressClosed) return;
		progressClosed = true;
		options.progress?.close();
	};
	const finish = (publish: () => void) => {
		if (settled) return;
		settled = true;
		options.signal?.removeEventListener('abort', abort);
		closeProgress();
		publish();
	};
	const abort = () =>
		pending.reject(
			options.signal?.reason ?? new DOMException('eXact request aborted', 'AbortError')
		);
	const pending: PendingExactOperation = {
		operation: options.operation,
		signal: options.signal,
		progress: options.progress && {
			// Preserve the allowlist after cancellation so malformed wire events still fail validation.
			receivers: options.progress.receivers,
			report(receiver, snapshot) {
				if (!settled && !progressClosed) options.progress!.report(receiver, snapshot);
			},
			close: closeProgress
		},
		onResponse:
			options.onResponse &&
			((response) => {
				if (settled) return;
				try {
					options.onResponse!(response);
				} catch (error) {
					pending.reject(error);
				}
			}),
		resolve: (result) => finish(() => resolve(result)),
		reject: (error) => finish(() => reject(error))
	};
	if (options.signal?.aborted) abort();
	else options.signal?.addEventListener('abort', abort, { once: true });
	return pending;
}
