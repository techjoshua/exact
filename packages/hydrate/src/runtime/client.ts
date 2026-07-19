import { consumeDomWork, unmount, type DomWorkBudget } from '@exact/dom';
import {
	cloneEndpointRoutes,
	mergeClientIslands,
	mergeHydrationRegistration,
	resolveHydrateOptions
} from '../config.js';
import { hydrateClientIslands } from '../islands.js';
import { applyPatches } from '../patches.js';
import type { ExactClient, HydrateOptions, HydrationRoot } from '../types.js';
import { invokeAndApply } from './operations.js';
import { requestVersions, roots } from './state.js';

export function createExactClient(container: Element, options: HydrateOptions = {}): ExactClient {
	const resolvedOptions = resolveHydrateOptions(container, options);
	const lifetime = new AbortController();
	const abortLifetime = () => lifetime.abort(resolvedOptions.signal?.reason);
	if (resolvedOptions.signal?.aborted) abortLifetime();
	else resolvedOptions.signal?.addEventListener('abort', abortLifetime, { once: true });
	const runtimeOptions: HydrateOptions = {
		...resolvedOptions,
		endpoints: cloneEndpointRoutes(resolvedOptions.endpoints),
		stateContracts: { ...(resolvedOptions.stateContracts ?? {}) },
		actionBoundaries: { ...(resolvedOptions.actionBoundaries ?? {}) },
		islands: { ...(resolvedOptions.islands ?? {}) },
		transports: { ...(resolvedOptions.transports ?? {}) },
		signal: lifetime.signal
	};
	let disposed = false;
	const assertActive = () => {
		if (disposed) throw new Error('eXact hydration root has been disposed');
	};
	const client: ExactClient = {
		get endpoint() {
			return runtimeOptions.endpoint;
		},
		get endpoints() {
			return runtimeOptions.endpoints;
		},
		get state() {
			return runtimeOptions.state;
		},
		set state(value: unknown) {
			runtimeOptions.state = value;
		},
		get stateContracts() {
			return runtimeOptions.stateContracts;
		},
		applyPatches(patches) {
			assertActive();
			return applyPatches(container, patches, runtimeOptions);
		},
		invokeAction(id, payload) {
			assertActive();
			return invokeAndApply(container, client, 'action', id, payload, runtimeOptions);
		},
		refreshBoundary(id, payload) {
			assertActive();
			return invokeAndApply(container, client, 'refresh', id, payload, runtimeOptions);
		},
		async refreshIsland(id, registry, payload) {
			assertActive();
			mergeClientIslands(runtimeOptions, registry);
			return invokeAndApply(container, client, 'refresh', id, payload, runtimeOptions);
		},
		registerManifest(config) {
			assertActive();
			mergeHydrationRegistration(runtimeOptions, config);
			if (config.islands)
				hydrateClientIslands(container, runtimeOptions.islands ?? {}, runtimeOptions);
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			resolvedOptions.signal?.removeEventListener('abort', abortLifetime);
			lifetime.abort(new DOMException('eXact hydration root disposed', 'AbortError'));
			roots.delete(container);
			container.removeAttribute('data-exact-hydrated');
			requestVersions.get(container)?.clear();
			unmount(container);
		}
	};
	return client;
}

export function remainingDomWork(work: DomWorkBudget): number {
	const remaining = work.limit - work.used;
	if (remaining <= 0) consumeDomWork(work);
	return remaining;
}

export function getHydrationRoot(container: Element): HydrationRoot | undefined {
	return roots.get(container);
}
