import type { FetcherSnapshot } from './contracts.js';
import { attachSuppressedCleanupFailure } from '@exactjs/core';

/**
 * Registers ownership before abort and publication callbacks can retire or replace a fetcher.
 * Returns undefined for retired work. A publication failure releases only this operation and
 * rethrows its original value, retaining a cleanup failure as suppressed information when possible.
 */
export function startFetcherOperation(
	key: string,
	fetchers: Map<string, FetcherSnapshot>,
	aborts: Map<string, AbortController>,
	state: 'loading' | 'submitting',
	publish: () => void
): AbortController | undefined {
	const previous = aborts.get(key);
	const abort = new AbortController();
	aborts.set(key, abort);
	previous?.abort();
	if (aborts.get(key) !== abort || abort.signal.aborted) return undefined;
	fetchers.set(key, Object.freeze({ state }));
	try {
		publish();
	} catch (primary) {
		if (aborts.get(key) === abort)
			try {
				releaseFetcherResources(key, fetchers, aborts, publish);
			} catch (cleanup) {
				attachSuppressedCleanupFailure(primary, cleanup);
			}
		throw primary;
	}
	return aborts.get(key) === abort && !abort.signal.aborted ? abort : undefined;
}

/** Releases only the finishing operation's cancellation entry, preserving newer work on the same key. */
export function finishFetcherOperation(
	key: string,
	abort: AbortController,
	aborts: Map<string, AbortController>,
	publish: () => void
): void {
	if (aborts.get(key) !== abort) return;
	aborts.delete(key);
	publish();
}

/** Retains one callback-like resource until its returned release function runs. */
export function subscribeResource<T>(resources: Set<T>, resource: T): () => void {
	resources.add(resource);
	return () => resources.delete(resource);
}

/** Cancels and forgets the resources owned by one fetcher key. */
export function releaseFetcherResources(
	key: string,
	fetchers: Map<string, FetcherSnapshot>,
	aborts: Map<string, AbortController>,
	publish: () => void
): void {
	const abort = aborts.get(key);
	aborts.delete(key);
	const removed = fetchers.delete(key);
	// Retire maps and publish before abort callbacks can establish a newer owner for this key.
	try {
		if (removed) publish();
	} finally {
		abort?.abort();
	}
}

/** Releases all retained resources owned by a router instance. */
export function disposeRouterResources(
	disposeFetchers: () => void,
	operations: { dispose(): void },
	unsubscribe: (() => void) | undefined,
	listeners: Set<() => void>,
	blockers: Set<unknown>
): void {
	operations.dispose();
	disposeFetchers();
	unsubscribe?.();
	listeners.clear();
	blockers.clear();
}
