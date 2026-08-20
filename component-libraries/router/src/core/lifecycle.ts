import type { FetcherSnapshot } from './contracts.js';

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
	aborts.get(key)?.abort();
	aborts.delete(key);
	if (!fetchers.delete(key)) return;
	publish();
}

/** Releases all retained resources owned by a router instance. */
export function disposeRouterResources(
	aborts: Map<string, AbortController>,
	operations: { dispose(): void },
	unsubscribe: (() => void) | undefined,
	listeners: Set<() => void>,
	blockers: Set<unknown>
): void {
	operations.dispose();
	for (const abort of aborts.values()) abort.abort();
	aborts.clear();
	unsubscribe?.();
	listeners.clear();
	blockers.clear();
}
