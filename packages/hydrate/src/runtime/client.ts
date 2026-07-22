import { createComponentDomain } from '@exact/core';
import { consumeDomWork, disposeOwnedSubtree, unmount, type DomWorkBudget } from '@exact/dom';
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

const requestClients = new WeakMap<import('@exact/core').ComponentDomain, ExactClient>();

/** @internal Associates a provider generation with its framework-owned request client. */
export function bindRequestClientDomain(
	domain: import('@exact/core').ComponentDomain,
	client: ExactClient
): void {
	requestClients.set(domain, client);
}

/** Resolves the request client privately owned by an immutable component root. */
export function requestClientForComponentDomain(
	domain: import('@exact/core').ComponentDomain
): ExactClient | undefined {
	return requestClients.get(domain);
}

/** Creates an exact client. */
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
	let retired = false;
	let pendingRequests = 0;
	const settlementWaiters = new Set<() => void>();
	const assertActive = () => {
		if (disposed) throw new Error('eXact hydration root has been disposed');
		if (retired) throw new Error('eXact hydration root has been retired');
	};
	const run = async <T>(operation: () => Promise<T>): Promise<T> => {
		assertActive();
		pendingRequests++;
		try {
			return await operation();
		} finally {
			pendingRequests--;
			if (!pendingRequests) {
				for (const settle of settlementWaiters) settle();
				settlementWaiters.clear();
			}
		}
	};
	// Assignment follows client construction because the framework-private
	// domain registry is bound only after the concrete client exists.
	// eslint-disable-next-line prefer-const
	let domain!: ExactClient['domain'];
	const client: ExactClient = {
		get domain() {
			return domain;
		},
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
		get pendingRequests() {
			return pendingRequests;
		},
		applyPatches(patches) {
			assertActive();
			return applyPatches(container, patches, runtimeOptions);
		},
		invokeAction(id, payload) {
			return run(() => invokeAndApply(container, client, 'action', id, payload, runtimeOptions));
		},
		refreshBoundary(id, payload) {
			return run(() => invokeAndApply(container, client, 'refresh', id, payload, runtimeOptions));
		},
		async refreshIsland(id, registry, payload) {
			assertActive();
			mergeClientIslands(runtimeOptions, registry);
			return run(() => invokeAndApply(container, client, 'refresh', id, payload, runtimeOptions));
		},
		registerManifest(config) {
			assertActive();
			mergeHydrationRegistration(runtimeOptions, config);
			if (config.islands)
				hydrateClientIslands(container, runtimeOptions.islands ?? {}, runtimeOptions);
		},
		retire() {
			if (!disposed) retired = true;
		},
		whenSettled() {
			if (!pendingRequests) return Promise.resolve();
			return new Promise<void>((resolve) => settlementWaiters.add(resolve));
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			retired = true;
			resolvedOptions.signal?.removeEventListener('abort', abortLifetime);
			lifetime.abort(new DOMException('eXact hydration root disposed', 'AbortError'));
			roots.delete(container);
			container.removeAttribute('data-exact-hydrated');
			requestVersions.get(container)?.clear();
			requestClients.delete(domain);
			disposeOwnedSubtree(container, false);
			unmount(container);
		}
	};
	domain = createComponentDomain(runtimeOptions.executionRoot ?? 'page');
	runtimeOptions.componentDomain = domain;
	bindRequestClientDomain(domain, client);
	const existing = roots.get(container);
	if (existing && existing !== client)
		throw new Error('An eXact client root is already registered for this container');
	roots.set(container, client);
	return client;
}

/** Performs the remaining dom work domain operation. */
export function remainingDomWork(work: DomWorkBudget): number {
	const remaining = work.limit - work.used;
	if (remaining <= 0) consumeDomWork(work);
	return remaining;
}

/** Resolves a hydration root. */
export function getHydrationRoot(container: Element): HydrationRoot | undefined {
	return roots.get(container);
}
