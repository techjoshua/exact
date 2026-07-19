import {
	adoptComponentRoot,
	adoptDocumentRoot,
	adoptMarkerlessComponentRoot,
	adoptStatic,
	consumeDomWork,
	createDomWorkBudget,
	render,
	unmount,
	type DomWorkBudget
} from '@exact/dom';
import type { VNode } from '@exact/core';
import type {
	ExactClient,
	FetchLike,
	HydrateOptions,
	HydrationRoot,
	HydrateProfileEvent,
	ExactInvocationKind,
	ExactInvocationRequest,
	ExactInvocationResult
} from './types.js';
import { enqueueExactOperation } from './batching.js';
import {
	cloneEndpointRoutes,
	mergeClientIslands,
	mergeHydrationRegistration,
	readExactHydrationConfig,
	resolveHydrateOptions
} from './config.js';
import { hydrateClientIslands } from './islands.js';
import { invokeExact } from './invocations.js';
import {
	applyPatches,
	boundaryInnerHtml,
	boundaryInnerHtmls,
	createPatchBoundaryResolver,
	reportMismatch
} from './patches.js';
import { stateForContract } from './state.js';
import { captureHydrationDom, restoreFormState } from './adoption/form-state.js';
import { adoptStaticTree, createStaticAdoptionBudget } from './adoption/static-tree.js';

export { applyPatches } from './patches.js';
export { hydrateClientIslands } from './islands.js';
export { invokeExact, invokeExactBatch } from './invocations.js';
export { readExactHydrationConfig } from './config.js';
export type * from './types.js';

const roots = new WeakMap<Element, HydrationRoot>();
const requestVersions = new WeakMap<Element, Map<string, number>>();

/** Hydrates an SSR container and returns the eXact client attached to that container. */
export function hydrate(
	vnode: VNode,
	container: Element | Document,
	options: HydrateOptions = {}
): HydrationRoot {
	const started = options.onProfile ? performance.now() : undefined;
	try {
		return hydrateRoot(vnode, container, options);
	} finally {
		if (started !== undefined) {
			options.onProfile?.(
				Object.freeze({
					subsystem: 'hydrate',
					phase: 'hydrate',
					elapsedMs: performance.now() - started
				} satisfies HydrateProfileEvent)
			);
		}
	}
}

function hydrateRoot(
	vnode: VNode,
	container: Element | Document,
	options: HydrateOptions
): HydrationRoot {
	const documentNode = container instanceof Document ? container : undefined;
	const rootContainer = documentNode?.documentElement ?? (container as Element);
	const existing = roots.get(rootContainer);
	if (existing) {
		render(vnode, rootContainer, {
			logger: options.logger,
			onErrorReport: options.onErrorReport,
			maxTreeDepth: options.maxTreeDepth,
			maxTreeNodes: options.maxTreeNodes,
			allowUnsafeHtml: options.allowUnsafeHtml,
			onUnsafeHtml: options.onUnsafeHtml,
			onProfile: options.onProfile
		});
		return existing;
	}
	const resolvedOptions = resolveHydrateOptions(rootContainer, options);
	const work = createDomWorkBudget(resolvedOptions.maxTreeNodes);
	const captured = captureHydrationDom(rootContainer, work);
	const formState = captured.formState;
	if (documentNode) {
		const adopted = adoptDocumentRoot(vnode, documentNode, {
			logger: resolvedOptions.logger,
			onErrorReport: resolvedOptions.onErrorReport,
			maxTreeDepth: resolvedOptions.maxTreeDepth,
			maxTreeNodes: remainingDomWork(work),
			workBudget: work,
			allowUnsafeHtml: resolvedOptions.allowUnsafeHtml,
			onUnsafeHtml: resolvedOptions.onUnsafeHtml
		});
		if (!adopted) {
			reportMismatch(
				resolvedOptions,
				'server document did not match the authored client document',
				'adoption-mismatch'
			);
			throw new Error(
				'eXact cannot safely replace a mismatched Document root; reload the document or correct the authored root.'
			);
		}
		const root = createExactClient(rootContainer, resolvedOptions);
		roots.set(rootContainer, root);
		rootContainer.setAttribute('data-exact-hydrated', 'true');
		restoreFormState(rootContainer, formState, work);
		return root;
	}
	if (!captured.hasMarkers) {
		const adopted =
			resolvedOptions.allowMarkerless && typeof vnode.type === 'function'
				? adoptMarkerlessComponentRoot(vnode, rootContainer, {
						logger: resolvedOptions.logger,
						onErrorReport: resolvedOptions.onErrorReport,
						maxTreeDepth: resolvedOptions.maxTreeDepth,
						maxTreeNodes: remainingDomWork(work),
						workBudget: work,
						allowUnsafeHtml: resolvedOptions.allowUnsafeHtml,
						onUnsafeHtml: resolvedOptions.onUnsafeHtml
					})
				: false;
		if (adopted) {
			const root = createExactClient(rootContainer, resolvedOptions);
			roots.set(rootContainer, root);
			rootContainer.setAttribute('data-exact-hydrated', 'true');
			restoreFormState(rootContainer, formState, work);
			return root;
		}
		reportMismatch(
			resolvedOptions,
			resolvedOptions.allowMarkerless
				? 'server markup did not match the client tree'
				: 'missing exact hydration markers',
			resolvedOptions.allowMarkerless ? 'adoption-mismatch' : 'missing-markers'
		);
		rootContainer.replaceChildren();
		render(vnode, rootContainer, {
			logger: resolvedOptions.logger,
			onErrorReport: resolvedOptions.onErrorReport,
			maxTreeDepth: resolvedOptions.maxTreeDepth,
			maxTreeNodes: remainingDomWork(work),
			workBudget: work,
			allowUnsafeHtml: resolvedOptions.allowUnsafeHtml,
			onUnsafeHtml: resolvedOptions.onUnsafeHtml,
			onProfile: options.onProfile
		});
	} else {
		if (
			typeof vnode.type === 'function'
				? adoptComponentRoot(vnode, rootContainer, {
						logger: resolvedOptions.logger,
						onErrorReport: resolvedOptions.onErrorReport,
						maxTreeDepth: resolvedOptions.maxTreeDepth,
						maxTreeNodes: remainingDomWork(work),
						workBudget: work,
						allowUnsafeHtml: resolvedOptions.allowUnsafeHtml,
						onUnsafeHtml: resolvedOptions.onUnsafeHtml
					})
				: adoptStaticTree(
						vnode,
						rootContainer,
						createStaticAdoptionBudget(resolvedOptions, work)
					) &&
					adoptStatic(vnode, rootContainer, {
						logger: resolvedOptions.logger,
						onErrorReport: resolvedOptions.onErrorReport,
						maxTreeDepth: resolvedOptions.maxTreeDepth,
						maxTreeNodes: remainingDomWork(work),
						workBudget: work,
						allowUnsafeHtml: resolvedOptions.allowUnsafeHtml,
						onUnsafeHtml: resolvedOptions.onUnsafeHtml
					})
		) {
			const root = createExactClient(rootContainer, resolvedOptions);
			roots.set(rootContainer, root);
			rootContainer.setAttribute('data-exact-hydrated', 'true');
			restoreFormState(rootContainer, formState, work);
			return root;
		}
		// The DOM renderer currently mounts a new mounted graph.  Clear the SSR
		// range first so a hydration attempt cannot leave duplicate interactive
		// markup behind while marker adoption is unavailable for a boundary.
		rootContainer.replaceChildren();
		render(vnode, rootContainer, {
			logger: resolvedOptions.logger,
			onErrorReport: resolvedOptions.onErrorReport,
			maxTreeDepth: resolvedOptions.maxTreeDepth,
			maxTreeNodes: remainingDomWork(work),
			workBudget: work,
			allowUnsafeHtml: resolvedOptions.allowUnsafeHtml,
			onUnsafeHtml: resolvedOptions.onUnsafeHtml,
			onProfile: options.onProfile
		});
	}

	restoreFormState(rootContainer, formState, work);

	const root = createExactClient(rootContainer, resolvedOptions);
	roots.set(rootContainer, root);
	rootContainer.setAttribute('data-exact-hydrated', 'true');
	return root;
}

/** Creates a client runtime for invoking eXact server actions and boundary refreshes. */
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

function remainingDomWork(work: DomWorkBudget): number {
	const remaining = work.limit - work.used;
	if (remaining <= 0) consumeDomWork(work);
	return remaining;
}

/** Returns the hydration client previously attached to a container. */
export function getHydrationRoot(container: Element): HydrationRoot | undefined {
	return roots.get(container);
}

async function invokeAndApply(
	container: Element,
	client: ExactClient,
	type: ExactInvocationKind,
	id: string,
	payload: unknown,
	options: HydrateOptions
): Promise<ExactInvocationResult> {
	const work = createDomWorkBudget(options.maxTreeNodes);
	let versions = requestVersions.get(container);
	if (!versions) {
		versions = new Map();
		requestVersions.set(container, versions);
	}
	const configuredBoundaries = options.actionBoundaries?.[id];
	const requestKeys = [
		...new Set(
			type === 'refresh'
				? [`boundary:${id}`]
				: configuredBoundaries?.length
					? configuredBoundaries.map((boundary) => `boundary:${boundary}`)
					: [`action:${id}`]
		)
	];
	const requestVersion = Math.max(0, ...requestKeys.map((key) => versions!.get(key) ?? 0)) + 1;
	for (const key of requestKeys) versions.set(key, requestVersion);
	const requestOrdinal = (versions.get('request') ?? 0) + 1;
	versions.set('request', requestOrdinal);
	const operation: ExactInvocationRequest = {
		type,
		id,
		payload,
		state:
			type === 'action'
				? stateForContract(client.state, client.stateContracts?.[id])
				: client.state,
		boundaryHtml: type === 'refresh' ? boundaryInnerHtml(container, id, work) : undefined,
		boundaryHtmls:
			type === 'action'
				? boundaryHtmlsFor(container, options.actionBoundaries?.[id], work)
				: undefined
	};
	const endpoint = requireEndpoint(endpointForOperation(client, type, id));
	const transport = transportForEndpoint(options, endpoint);
	// Operations can route to per-action or per-boundary endpoints, which keeps
	// server components usable inside independently deployed micro-frontend bundles.
	const result =
		options.batch === false
			? await invokeExact({
					endpoint,
					...operation,
					fetch: transport.fetch,
					headers: transport.headers,
					logger: options.logger,
					stream: options.stream,
					streamLimits: options.streamLimits,
					signal: options.signal
				})
			: await enqueueExactOperation(container, {
					endpoint,
					operation,
					fetch: transport.fetch,
					headers: transport.headers,
					logger: options.logger,
					stream: options.stream,
					streamLimits: options.streamLimits,
					signal: options.signal
				});
	const staleKeys = new Set(requestKeys.filter((key) => versions!.get(key) !== requestVersion));
	if (staleKeys.size === requestKeys.length) {
		options.onDiagnostic?.({
			code: 'stale-response',
			message: `ignored stale exact ${type} response for ${id}`,
			patch: { type, id }
		});
		return result;
	}
	let responsePatches = result.patches;
	const partiallyStale = staleKeys.size > 0;
	if (partiallyStale && configuredBoundaries && responsePatches) {
		const rejected: string[] = [];
		const boundaryForPatch = createPatchBoundaryResolver(container, configuredBoundaries, work);
		responsePatches = responsePatches.filter((patch) => {
			const owner = boundaryForPatch(patch.id);
			const accepted = owner !== undefined && !staleKeys.has(`boundary:${owner}`);
			if (!accepted) rejected.push(`${patch.type}:${patch.id}`);
			return accepted;
		});
		options.onDiagnostic?.({
			code: 'stale-response',
			message:
				`partially ignored stale exact ${type} response for ${id}` +
				(rejected.length ? ` (${rejected.join(', ')})` : ''),
			patch: { type, id }
		});
	}
	const patchOptions = { ...options, workBudget: work };
	let patchesApplied = responsePatches
		? applyPatches(container, responsePatches, patchOptions)
		: true;
	if (!patchesApplied && type === 'refresh' && result.html) {
		patchesApplied = applyPatches(
			container,
			[{ type: 'replace', id, html: result.html }],
			patchOptions
		);
	}
	if (!patchesApplied) {
		options.onDiagnostic?.({
			code: 'invalid-patch',
			message: `rejected exact ${type} response for ${id}; DOM and state were left unchanged`,
			patch: { type, id }
		});
		return result;
	}
	if (responsePatches?.length && options.islands)
		hydrateClientIslands(container, options.islands, options);
	if (
		!partiallyStale &&
		'state' in result &&
		requestOrdinal >= (versions.get('state-committed') ?? 0)
	) {
		versions.set('state-committed', requestOrdinal);
		client.state = result.state;
	}
	return result;
}

function requireEndpoint(endpoint: string | undefined): string {
	if (!endpoint) throw new Error('eXact endpoint is not configured');
	return endpoint;
}

function endpointForOperation(
	client: ExactClient,
	type: ExactInvocationKind,
	id: string
): string | undefined {
	if (type === 'action') return client.endpoints?.actions?.[id] ?? client.endpoint;
	return client.endpoints?.boundaries?.[id] ?? client.endpoint;
}

function transportForEndpoint(
	options: HydrateOptions,
	endpoint: string
): { fetch?: FetchLike; headers?: Record<string, string> } {
	const transport = options.transports?.[endpoint];
	return {
		fetch: transport?.fetch ?? options.fetch,
		headers: {
			...(options.headers ?? {}),
			...(transport?.headers ?? {})
		}
	};
}

function boundaryHtmlsFor(
	container: Element,
	ids: readonly string[] | undefined,
	work: DomWorkBudget
): Record<string, string> | undefined {
	if (!ids?.length) return undefined;
	const htmls = boundaryInnerHtmls(container, ids, work);
	return Object.keys(htmls).length ? htmls : undefined;
}
