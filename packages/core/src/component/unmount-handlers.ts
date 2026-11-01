import { attemptCleanup, createCleanupFailure, throwCleanupFailure } from '../cleanup.js';
import { observeLifecyclePromise } from './async.js';
import { isPromiseLike } from './async-value.js';
import type { AnyComponentInstance } from './contracts.js';
import { createErrorReport, handleComponentError } from './errors.js';
import {
	clearComponentLifecycleHandlers,
	componentLifecycleHandlers
} from './lifecycle-handlers.js';

/** Releases every registered unmount handler through its component error and async ownership. */
export function releaseComponentUnmountHandlers(
	instance: AnyComponentInstance,
	reason: string
): void {
	const failure = createCleanupFailure();
	for (const handler of componentLifecycleHandlers(instance, 'unmount')) {
		try {
			const result = handler({ signal: AbortSignal.abort(reason), reason });
			if (isPromiseLike(result))
				observeLifecyclePromise(instance, Promise.resolve(result), 'unmount');
		} catch (error) {
			attemptCleanup(failure, () =>
				handleComponentError(instance, createErrorReport(error, 'lifecycle', instance, 'unmount'))
			);
		}
	}
	clearComponentLifecycleHandlers(instance);
	throwCleanupFailure(failure);
}
