import { createDomWorkBudget, type DomWorkBudget } from '@exactjs/dom';
import type { ComponentInstance } from '@exactjs/core';
import { enqueueExactOperation } from '../batching.js';
import { ExactBuildUnsupportedError, invokeExact } from '../invocations.js';
import { hydrateClientIslands } from '../islands.js';
import {
	applyPatches,
	boundaryInnerHtml,
	boundaryInnerHtmls,
	createPatchBoundaryResolver
} from '../patches.js';
import { commitStateForContract, mergeStateForContract, stateForContract } from '../state.js';
import type {
	ExactClient,
	ExactInvocationKind,
	ExactInvocationRequest,
	ExactInvocationResult,
	FetchLike,
	HydrateOptions
} from '../types.js';
import { requestVersions } from './state.js';

/** Runs and apply with the supplied execution context. */
export async function invokeAndApply(
	container: Element,
	client: ExactClient,
	type: ExactInvocationKind,
	id: string,
	payload: unknown,
	options: HydrateOptions,
	component?: {
		instance: ComponentInstance<any>;
		dependencies: readonly unknown[];
		signal: AbortSignal;
	}
): Promise<ExactInvocationResult> {
	const work = createDomWorkBudget(options.maxTreeNodes);
	const continuation = type === 'action' ? options.continuations?.[id] : undefined;
	if (type === 'action' && !continuation)
		throw new Error(`No eXact client continuation contract is registered for ${id}`);
	let versions = requestVersions.get(container);
	if (!versions) {
		versions = new Map();
		requestVersions.set(container, versions);
	}
	const configuredBoundaries = continuation?.boundaries;
	const componentKey = component ? componentIdentity(component.instance) : undefined;
	const requestKeys = [
		...new Set(
			type === 'refresh'
				? [`boundary:${id}`]
				: configuredBoundaries?.length
					? configuredBoundaries.map((boundary) => `boundary:${boundary}`)
					: [`action:${id}`]
		)
	].map((key) => (componentKey ? `${componentKey}:${key}` : key));
	const requestVersion = Math.max(0, ...requestKeys.map((key) => versions!.get(key) ?? 0)) + 1;
	for (const key of requestKeys) versions.set(key, requestVersion);
	const requestOrdinalKey = componentKey ? `${componentKey}:request` : 'request';
	const stateCommittedKey = componentKey ? `${componentKey}:state-committed` : 'state-committed';
	const requestOrdinal = (versions.get(requestOrdinalKey) ?? 0) + 1;
	versions.set(requestOrdinalKey, requestOrdinal);
	const operation: ExactInvocationRequest = {
		type,
		root: options.executionRoot ?? 'page',
		id,
		payload: component ? { dependencies: component.dependencies } : payload,
		state:
			type === 'action'
				? stateForContract(
						component?.instance.state ?? client.state,
						{ reads: continuation!.stateReads }
					)
				: client.state,
		publicContext:
			type === 'action'
				? publicContextFor(options.publicContexts, continuation?.publicContexts)
				: undefined,
		boundaryHtml:
			type === 'refresh'
				? boundaryInnerHtml(container, id, work, options.executionRoot ?? 'page')
				: undefined,
		boundaryHtmls:
			type === 'action'
				? boundaryHtmlsFor(container, configuredBoundaries, work, options.executionRoot ?? 'page')
				: undefined
	};
	const endpoint = requireEndpoint(endpointForOperation(client, type, id));
	const transport = transportForEndpoint(options, endpoint);
	// Operations can route to per-action or per-boundary endpoints, which keeps
	// server components usable inside independently deployed micro-frontend bundles.
	let result: ExactInvocationResult;
	try {
		result =
			options.batch === false
				? await invokeExact({
						endpoint,
						...operation,
						fetch: transport.fetch,
						headers: transport.headers,
						logger: options.logger,
						stream: options.stream,
						streamLimits: options.streamLimits,
						signal: component?.signal ?? options.signal,
						onResponse: options.onResponse
					})
				: await enqueueExactOperation(container, {
						endpoint,
						operation,
						fetch: transport.fetch,
						headers: transport.headers,
						logger: options.logger,
						stream: options.stream,
						streamLimits: options.streamLimits,
						signal: component?.signal ?? options.signal,
						onResponse: options.onResponse
					});
	} catch (error) {
		if (error instanceof ExactBuildUnsupportedError) options.onBuildUnsupported?.();
		throw error;
	}
	if (continuation) {
		const invalidPatch = unauthorizedContinuationPatch(
			container,
			result.patches,
			continuation.boundaries,
			work
		);
		const mergedState =
			'state' in result
				? mergeStateForContract(client.state, result.state, {
						writes: continuation.stateWrites
					})
				: undefined;
		if (invalidPatch || mergedState?.ok === false) {
			options.onDiagnostic?.({
				code: 'invalid-response',
				message: `rejected exact action response outside the continuation contract for ${id}`,
				patch: invalidPatch
			});
			options.onOperation?.({
				operation,
				result,
				appliedPatches: [],
				patchesApplied: false,
				stale: false
			});
			return result;
		}
		if (mergedState?.ok) result = { ...result, state: mergedState.state };
	}
	const staleKeys = new Set(requestKeys.filter((key) => versions!.get(key) !== requestVersion));
	if (staleKeys.size === requestKeys.length) {
		options.onDiagnostic?.({
			code: 'stale-response',
			message: `ignored stale exact ${type} response for ${id}`,
			patch: { type, id }
		});
		options.onOperation?.({
			operation,
			result,
			appliedPatches: [],
			patchesApplied: false,
			stale: true
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
	let appliedPatches: readonly import('@exactjs/server').ExactPatch[] = responsePatches ?? [];
	let patchesApplied = responsePatches
		? applyPatches(container, responsePatches, patchOptions)
		: true;
	if (!patchesApplied && type === 'refresh' && result.html) {
		appliedPatches = [{ type: 'replace', id, html: result.html }];
		patchesApplied = applyPatches(container, appliedPatches, patchOptions);
	}
	if (!patchesApplied) {
		options.onDiagnostic?.({
			code: 'invalid-patch',
			message: `rejected exact ${type} response for ${id}; DOM and state were left unchanged`,
			patch: { type, id }
		});
		options.onOperation?.({
			operation,
			result,
			appliedPatches,
			patchesApplied: false,
			stale: partiallyStale
		});
		return result;
	}
	if (responsePatches?.length && options.islands)
		hydrateClientIslands(container, options.islands, options);
	if (
		!partiallyStale &&
		'state' in result &&
		requestOrdinal >= (versions.get(stateCommittedKey) ?? 0)
	) {
		versions.set(stateCommittedKey, requestOrdinal);
		if (component) {
			commitStateForContract(component.instance.state, result.state, {
				writes: continuation!.stateWrites
			});
		} else {
			client.state = result.state;
		}
	}
	options.onOperation?.({
		operation,
		result,
		appliedPatches,
		patchesApplied: true,
		stale: partiallyStale
	});
	return result;
}

const componentIds = new WeakMap<ComponentInstance<any>, number>();
let nextComponentId = 1;

/** Returns one request-generation namespace for a live component instance. */
function componentIdentity(instance: ComponentInstance<any>): string {
	let id = componentIds.get(instance);
	if (!id) {
		id = nextComponentId++;
		componentIds.set(instance, id);
	}
	return `component:${id}`;
}

/** Returns the first patch outside every compiler-declared affected boundary. */
function unauthorizedContinuationPatch(
	container: Element,
	patches: readonly import('@exactjs/server').ExactPatch[] | undefined,
	boundaries: readonly string[],
	work: DomWorkBudget
): import('@exactjs/server').ExactPatch | undefined {
	if (!patches?.length) return undefined;
	if (!boundaries.length) return patches[0];
	const boundaryForPatch = createPatchBoundaryResolver(container, boundaries, work);
	return patches.find((patch) => boundaryForPatch(patch.id) === undefined);
}

/** Selects only compiler-approved shared context projections for one activation record. */
function publicContextFor(
	values: Record<string, unknown> | undefined,
	tokens: readonly string[] | undefined
): Record<string, unknown> | undefined {
	if (!tokens?.length) return undefined;
	const output: Record<string, unknown> = {};
	for (const token of tokens) {
		if (!values || !Object.prototype.hasOwnProperty.call(values, token)) {
			throw new Error(`Missing eXact public context projection ${token}`);
		}
		output[token] = values[token];
	}
	return output;
}

/** Validates endpoint and throws when the contract is violated. */
export function requireEndpoint(endpoint: string | undefined): string {
	if (!endpoint) throw new Error('eXact endpoint is not configured');
	return endpoint;
}

/** Performs the endpoint for operation domain operation. */
export function endpointForOperation(
	client: ExactClient,
	type: ExactInvocationKind,
	id: string
): string | undefined {
	if (type === 'action') return client.endpoints?.actions?.[id] ?? client.endpoint;
	return client.endpoints?.boundaries?.[id] ?? client.endpoint;
}

/** Performs the transport for endpoint domain operation. */
export function transportForEndpoint(
	options: HydrateOptions,
	endpoint: string
): { fetch?: FetchLike; headers?: Record<string, string> } {
	const transport = options.transports?.[endpoint];
	return {
		fetch: transport?.fetch ?? options.fetch,
		headers: {
			...(options.headers ?? {}),
			...(transport?.headers ?? {}),
			...(options.binding ? { 'X-Exact-Binding': options.binding } : {}),
			...(options.buildKey ? { 'X-Exact-Build': options.buildKey } : {})
		}
	};
}

/** Performs the boundary htmls for domain operation. */
export function boundaryHtmlsFor(
	container: Element,
	ids: readonly string[] | undefined,
	work: DomWorkBudget,
	executionRoot?: string
): Record<string, string> | undefined {
	if (!ids?.length) return undefined;
	const htmls = boundaryInnerHtmls(container, ids, work, executionRoot);
	return Object.keys(htmls).length ? htmls : undefined;
}
