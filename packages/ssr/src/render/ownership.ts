import {
	attachSuppressedCleanupFailure,
	attemptCleanup,
	createCleanupFailure,
	throwCleanupFailure
} from '@exact/core';
import type { ComponentInstance, TaskObserver } from '../types.js';

/** Creates a ssr owner. */
export function createSsrOwner(): {
	observer: TaskObserver;
	pending: Set<Promise<unknown>>;
	dispose(reason?: unknown): void;
} {
	const pending = new Set<Promise<unknown>>();
	const instances = new Set<ComponentInstance<any>>();
	return {
		pending,
		observer: {
			register(promise) {
				const observed = promise.finally(() => pending.delete(observed));
				pending.add(observed);
			},
			retain(instance) {
				instances.add(instance);
			}
		},
		dispose(reason = 'ssr render complete') {
			// Children are constructed after parents; dispose in reverse order so a
			// parent context stays valid throughout child teardown.
			const failure = createCleanupFailure();
			for (const instance of [...instances].reverse())
				attemptCleanup(failure, () => instance.unmount(String(reason)));
			instances.clear();
			throwCleanupFailure(failure);
		}
	};
}

/** Provides the canonical no primary failure value. */
export const noPrimaryFailure = Symbol('no primary SSR failure');

/** Releases preserving primary and its owned resources. */
export function disposePreservingPrimary(dispose: () => void, primary: unknown): void {
	try {
		dispose();
	} catch (cleanup) {
		if (primary === noPrimaryFailure) throw cleanup;
		attachSuppressedCleanupFailure(primary, cleanup);
	}
}
