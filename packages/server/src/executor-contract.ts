import {
	composeExactComponentContracts,
	sameJsonData,
	type ComponentFunction,
	type ExactComponentBoundaryContract,
	type ExactComponentContinuationContract
} from '@exactjs/core';
import type {
	ComposeExactExecutorContractOptions,
	ExactEndpointRoutes,
	ExactExecutorContract,
	ExactHydrationConfig
} from './types.js';

/**
 * Composes the immutable executor allowlist from explicitly imported artifacts.
 *
 * Merely installing a package grants no server authority. Only contracts
 * reachable from the supplied executor component roots and explicit
 * application-owned entries are registered.
 */
export function composeExactExecutorContract(
	components: readonly ComponentFunction<any, any>[],
	options: ComposeExactExecutorContractOptions = {}
): ExactExecutorContract {
	const composed = composeExactComponentContracts(components, 'executor');
	const actions = mergeContractEntries(composed.continuations, options.actions, 'action');
	const boundaries = mergeContractEntries(composed.boundaries, options.boundaries, 'boundary');
	return Object.freeze({
		version: 1,
		endpoint: options.endpoint,
		endpoints: normalizeEndpointRoutes(options.endpoints),
		actions,
		executors: composed.executors,
		boundaries
	});
}

/** Creates the browser-visible resumption configuration from the executor allowlist. */
export function createExactHydrationConfig(
	contract: ExactExecutorContract,
	state?: unknown,
	publicContexts?: Record<string, unknown>
): ExactHydrationConfig {
	return {
		...(contract.endpoint === undefined ? {} : { endpoint: contract.endpoint }),
		...(contract.endpoints === undefined ? {} : { endpoints: contract.endpoints }),
		...(state === undefined ? {} : { state }),
		continuations: Object.fromEntries(
			Object.entries(contract.actions).map(([id, action]) => [
				id,
				{ ...action, serverContexts: [] }
			])
		),
		...(publicContexts === undefined ? {} : { publicContexts })
	};
}

/** Merges compiler and application contracts while rejecting ambiguous authority. */
function mergeContractEntries<T>(
	base: Record<string, T>,
	additional: Record<string, T> | undefined,
	kind: string
): Record<string, T> {
	const output = { ...base };
	for (const [id, entry] of Object.entries(additional ?? {})) {
		const previous = output[id];
		if (previous && !sameJsonData(previous, entry))
			throw new Error(`Conflicting eXact executor ${kind} ${id}`);
		output[id] = entry;
	}
	return output;
}

/** Validates and removes empty per-operation endpoint maps. */
function normalizeEndpointRoutes(
	routes: ExactEndpointRoutes | undefined
): ExactEndpointRoutes | undefined {
	if (routes === undefined) return undefined;
	if (!routes || typeof routes !== 'object' || Array.isArray(routes))
		throw new Error('Malformed eXact endpoint routes');
	const actions = normalizeEndpointMap(routes.actions);
	const boundaries = normalizeEndpointMap(routes.boundaries);
	return Object.keys(actions).length || Object.keys(boundaries).length
		? {
				...(Object.keys(actions).length ? { actions } : {}),
				...(Object.keys(boundaries).length ? { boundaries } : {})
			}
		: undefined;
}

/** Validates one endpoint map before it becomes trusted routing configuration. */
function normalizeEndpointMap(value: Record<string, string> | undefined): Record<string, string> {
	if (value === undefined) return {};
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('Malformed eXact endpoint routes');
	const output: Record<string, string> = {};
	for (const [id, endpoint] of Object.entries(value)) {
		if (!id || typeof endpoint !== 'string' || !endpoint)
			throw new Error('Malformed eXact endpoint routes');
		output[id] = endpoint;
	}
	return output;
}

/** Builds an application-owned operation contract without exposing compiler IDs. */
export function defineExactOperationContract(
	id: string,
	options: {
		componentId?: string;
		readiness?: ExactComponentContinuationContract['readiness'];
		reads?: ExactComponentContinuationContract['stateReads'];
		writes?: ExactComponentContinuationContract['stateWrites'];
		publicContexts?: readonly string[];
		serverContexts?: readonly string[];
		contextWrites?: readonly string[];
		boundaries?: readonly string[];
	} = {}
): ExactComponentContinuationContract {
	if (!id) throw new Error('eXact operation id must be non-empty');
	return Object.freeze({
		id,
		componentId: options.componentId ?? `application:${id}`,
		readiness: options.readiness ?? 'nonblocking',
		dependencies: [],
		stateReads: options.reads ?? [],
		stateWrites: options.writes ?? [],
		publicContexts: options.publicContexts ?? [],
		serverContexts: options.serverContexts ?? [],
		contextWrites: options.contextWrites ?? [],
		boundaries: options.boundaries ?? []
	});
}

/** Builds an application-owned boundary contract with explicit ownership. */
export function defineExactBoundaryContract(
	id: string,
	options: { componentId?: string; ownerComponentId?: string; kind?: string } = {}
): ExactComponentBoundaryContract {
	if (!id) throw new Error('eXact boundary id must be non-empty');
	const componentId = options.componentId ?? `application:${id}`;
	return Object.freeze({
		id,
		componentId,
		ownerComponentId: options.ownerComponentId ?? componentId,
		kind: options.kind ?? 'application'
	});
}
