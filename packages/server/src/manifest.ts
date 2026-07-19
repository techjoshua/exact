import { exactCompilerManifestVersion, exactServerManifestVersion } from './versions.js';
import { sameJsonData } from '@exact/core';
import type {
	CreateExactServerManifestOptions,
	ExactCompilerManifestLike,
	ExactContextEffect,
	ExactEndpointRoutes,
	ExactHydrationManifestConfig,
	ExactManifestAction,
	ExactManifestBoundary,
	ExactServerManifest,
	ExactStateContract,
	ExactStatePath
} from './types.js';

/** Builds a runtime server manifest from one or more compiler manifests plus app overrides. */
export function createExactServerManifest(
	compilerManifest: ExactCompilerManifestLike | readonly ExactCompilerManifestLike[],
	options: CreateExactServerManifestOptions = {}
): ExactServerManifest {
	const actions: Record<string, ExactManifestAction> = { ...options.actions };
	const boundaries: Record<string, ExactManifestBoundary> = { ...options.boundaries };
	const boundaryOverrides = new Set(Object.keys(options.boundaries ?? {}));
	let pluginRegistryFingerprint: string | undefined;

	for (const manifest of normalizeCompilerManifests(compilerManifest)) {
		assertCompilerManifestLike(manifest);
		if (manifest.version !== exactCompilerManifestVersion) {
			throw new Error(
				`Unsupported eXact compiler manifest version: ${String((manifest as { version?: unknown }).version)}`
			);
		}
		if (manifest.pluginRegistry?.fingerprint) {
			if (
				pluginRegistryFingerprint &&
				pluginRegistryFingerprint !== manifest.pluginRegistry.fingerprint
			) {
				throw new Error('Compiler manifests use incompatible eXact plugin registry fingerprints');
			}
			pluginRegistryFingerprint = manifest.pluginRegistry.fingerprint;
		}
		for (const action of Object.values(manifest.serverActions ?? {})) {
			if (action.placement !== 'server' && action.placement !== 'isomorphic') continue;
			const nextAction = {
				id: action.id,
				componentId: action.componentId,
				taskId: action.taskId,
				placement: action.placement,
				stateContract: action.stateContract,
				contextContract: action.contextContract
			};
			addManifestAction(actions, nextAction);
		}

		for (const boundary of manifest.boundaries ?? []) {
			addManifestBoundary(
				boundaries,
				{
					id: boundary.id,
					name: boundary.name,
					componentId: boundary.componentId,
					ownerComponentId: boundary.ownerComponentId,
					renderEdgeId: boundary.renderEdgeId,
					renderEdgeIndex: boundary.renderEdgeIndex,
					renderPath: boundary.renderPath,
					kind: boundary.kind
				},
				boundaryOverrides
			);
		}
		for (const component of manifest.components ?? []) {
			if (component.placement === 'client') continue;
			addManifestBoundary(
				boundaries,
				{
					id: component.id,
					componentId: component.id
				},
				boundaryOverrides
			);
		}
	}

	const endpoints = normalizeEndpointRoutes(options.endpoints);
	return {
		version: exactServerManifestVersion,
		pluginRegistryFingerprint,
		endpoint: options.endpoint,
		endpoints,
		actions,
		boundaries,
		actionBoundaries: inferActionBoundaries(actions, boundaries)
	};
}

/** Extracts action state contracts into the serialized hydration config shape. */
export function createExactHydrationStateContracts(
	manifest: ExactServerManifest
): Record<string, ExactStateContract> {
	const contracts: Record<string, ExactStateContract> = {};
	for (const [id, action] of Object.entries(manifest.actions ?? {})) {
		if (action.stateContract) contracts[id] = action.stateContract;
	}
	return contracts;
}

/** Extracts or infers action-to-boundary mappings for client refresh requests. */
export function createExactHydrationActionBoundaries(
	manifest: ExactServerManifest
): Record<string, readonly string[]> {
	return (
		manifest.actionBoundaries ??
		inferActionBoundaries(manifest.actions ?? {}, manifest.boundaries ?? {})
	);
}

/** Builds the client hydration manifest config derived from a server manifest and optional state. */
export function createExactHydrationManifestConfig(
	manifest: ExactServerManifest,
	state?: unknown
): ExactHydrationManifestConfig {
	return omitEmptyHydrationConfig({
		pluginRegistryFingerprint: manifest.pluginRegistryFingerprint,
		endpoint: manifest.endpoint,
		endpoints: manifest.endpoints,
		state,
		stateContracts: createExactHydrationStateContracts(manifest),
		actionBoundaries: createExactHydrationActionBoundaries(manifest)
	});
}

function addManifestAction(
	actions: Record<string, ExactManifestAction>,
	action: ExactManifestAction
): void {
	const existing = actions[action.id];
	if (existing && !sameManifestAction(existing, action)) {
		throw new Error(`Conflicting eXact action id in compiler manifests: ${action.id}`);
	}
	actions[action.id] = action;
}

function addManifestBoundary(
	boundaries: Record<string, ExactManifestBoundary>,
	boundary: ExactManifestBoundary,
	overrides: ReadonlySet<string>
): void {
	const existing = boundaries[boundary.id];
	if (existing) {
		// App-provided boundary overrides intentionally win; compiler/compiler collisions
		// still fail closed so opaque IDs stay trustworthy.
		if (!overrides.has(boundary.id) && !sameManifestBoundary(existing, boundary)) {
			throw new Error(`Conflicting eXact boundary id in compiler manifests: ${boundary.id}`);
		}
		return;
	}
	boundaries[boundary.id] = boundary;
}

function sameManifestAction(left: ExactManifestAction, right: ExactManifestAction): boolean {
	return (
		left.id === right.id &&
		left.componentId === right.componentId &&
		left.taskId === right.taskId &&
		left.placement === right.placement &&
		sameJsonData(left.stateContract ?? null, right.stateContract ?? null) &&
		sameJsonData(left.contextContract ?? null, right.contextContract ?? null)
	);
}

function sameManifestBoundary(left: ExactManifestBoundary, right: ExactManifestBoundary): boolean {
	return (
		left.id === right.id &&
		left.name === right.name &&
		left.componentId === right.componentId &&
		left.ownerComponentId === right.ownerComponentId &&
		left.renderEdgeId === right.renderEdgeId &&
		left.renderEdgeIndex === right.renderEdgeIndex &&
		left.renderPath === right.renderPath &&
		left.kind === right.kind
	);
}

function normalizeCompilerManifests(
	manifest: ExactCompilerManifestLike | readonly ExactCompilerManifestLike[]
): readonly ExactCompilerManifestLike[] {
	return isCompilerManifestList(manifest) ? manifest : [manifest];
}

function isCompilerManifestList(
	value: ExactCompilerManifestLike | readonly ExactCompilerManifestLike[]
): value is readonly ExactCompilerManifestLike[] {
	return Array.isArray(value);
}

function assertCompilerManifestLike(
	manifest: unknown
): asserts manifest is ExactCompilerManifestLike {
	if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
		throw new Error('Malformed eXact compiler manifest');
	}
	const record = manifest as Partial<ExactCompilerManifestLike> & { version?: unknown };
	if (record.version !== exactCompilerManifestVersion) return;
	if (
		record.serverActions !== undefined &&
		(!record.serverActions ||
			typeof record.serverActions !== 'object' ||
			Array.isArray(record.serverActions))
	) {
		throw new Error('Malformed eXact compiler manifest');
	}
	for (const action of Object.values(record.serverActions ?? {})) {
		if (!action || typeof action !== 'object' || Array.isArray(action))
			throw new Error('Malformed eXact compiler manifest');
		if (typeof action.id !== 'string' || !action.id)
			throw new Error('Malformed eXact compiler manifest');
		if (action.componentId !== undefined && typeof action.componentId !== 'string')
			throw new Error('Malformed eXact compiler manifest');
		if (action.taskId !== undefined && typeof action.taskId !== 'string')
			throw new Error('Malformed eXact compiler manifest');
		if (action.placement !== undefined && !isCompilerPlacement(action.placement))
			throw new Error('Malformed eXact compiler manifest');
		if (action.stateContract !== undefined && !isStateContract(action.stateContract))
			throw new Error('Malformed eXact compiler manifest');
		if (action.contextContract !== undefined && !isContextContract(action.contextContract))
			throw new Error('Malformed eXact compiler manifest');
	}
	if (record.components !== undefined && !Array.isArray(record.components))
		throw new Error('Malformed eXact compiler manifest');
	for (const component of record.components ?? []) {
		if (!component || typeof component !== 'object' || Array.isArray(component))
			throw new Error('Malformed eXact compiler manifest');
		if (typeof component.id !== 'string' || !component.id)
			throw new Error('Malformed eXact compiler manifest');
		if (component.placement !== undefined && !isCompilerPlacement(component.placement))
			throw new Error('Malformed eXact compiler manifest');
	}
	if (record.boundaries !== undefined && !Array.isArray(record.boundaries))
		throw new Error('Malformed eXact compiler manifest');
	for (const boundary of record.boundaries ?? []) {
		if (!boundary || typeof boundary !== 'object' || Array.isArray(boundary))
			throw new Error('Malformed eXact compiler manifest');
		if (typeof boundary.id !== 'string' || !boundary.id)
			throw new Error('Malformed eXact compiler manifest');
		if (boundary.name !== undefined && typeof boundary.name !== 'string')
			throw new Error('Malformed eXact compiler manifest');
		if (boundary.componentId !== undefined && typeof boundary.componentId !== 'string')
			throw new Error('Malformed eXact compiler manifest');
		if (boundary.ownerComponentId !== undefined && typeof boundary.ownerComponentId !== 'string')
			throw new Error('Malformed eXact compiler manifest');
		if (boundary.renderEdgeId !== undefined && typeof boundary.renderEdgeId !== 'string')
			throw new Error('Malformed eXact compiler manifest');
		if (
			boundary.renderEdgeIndex !== undefined &&
			(!Number.isInteger(boundary.renderEdgeIndex) || boundary.renderEdgeIndex < 1)
		)
			throw new Error('Malformed eXact compiler manifest');
		if (boundary.renderPath !== undefined && typeof boundary.renderPath !== 'string')
			throw new Error('Malformed eXact compiler manifest');
		if (boundary.kind !== undefined && typeof boundary.kind !== 'string')
			throw new Error('Malformed eXact compiler manifest');
	}
}

function isCompilerPlacement(
	value: unknown
): value is 'server' | 'isomorphic' | 'client' | 'unknown' {
	return value === 'server' || value === 'isomorphic' || value === 'client' || value === 'unknown';
}

function isStateContract(value: unknown): value is ExactStateContract {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const record = value as Partial<ExactStateContract>;
	return (
		(record.reads === undefined || isStatePathList(record.reads)) &&
		(record.writes === undefined || isStatePathList(record.writes))
	);
}

function isStatePathList(value: unknown): value is ExactStatePath[] {
	return (
		Array.isArray(value) &&
		value.every((item) => {
			if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
			const path = item as Partial<ExactStatePath>;
			return (
				typeof path.path === 'string' &&
				(path.kind === 'read' || path.kind === 'write') &&
				(path.confidence === 'exact' ||
					path.confidence === 'broad' ||
					path.confidence === 'unknown')
			);
		})
	);
}

function isContextContract(value: unknown): value is ExactContextEffect[] {
	return (
		Array.isArray(value) &&
		value.every((item) => {
			if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
			const effect = item as Partial<ExactContextEffect>;
			return (
				typeof effect.token === 'string' &&
				(effect.kind === 'read' || effect.kind === 'write') &&
				(effect.confidence === 'exact' || effect.confidence === 'unknown')
			);
		})
	);
}

function inferActionBoundaries(
	actions: Record<string, ExactManifestAction>,
	boundaries: Record<string, ExactManifestBoundary>
): Record<string, string[]> {
	const output: Record<string, string[]> = {};
	for (const action of Object.values(actions)) {
		if (!action.componentId) continue;
		const ids = Object.values(boundaries)
			.filter(
				(boundary) => (boundary.ownerComponentId ?? boundary.componentId) === action.componentId
			)
			.map((boundary) => boundary.id)
			.sort();
		if (ids.length) output[action.id] = ids;
	}
	return output;
}

function omitEmptyHydrationConfig(
	config: ExactHydrationManifestConfig
): ExactHydrationManifestConfig {
	return {
		...(config.endpoint === undefined ? {} : { endpoint: config.endpoint }),
		...(config.endpoints &&
		(Object.keys(config.endpoints.actions ?? {}).length ||
			Object.keys(config.endpoints.boundaries ?? {}).length)
			? { endpoints: config.endpoints }
			: {}),
		...(config.state === undefined ? {} : { state: config.state }),
		...(config.stateContracts && Object.keys(config.stateContracts).length
			? { stateContracts: config.stateContracts }
			: {}),
		...(config.actionBoundaries && Object.keys(config.actionBoundaries).length
			? { actionBoundaries: config.actionBoundaries }
			: {})
	};
}

function normalizeEndpointRoutes(
	routes: ExactEndpointRoutes | undefined
): ExactEndpointRoutes | undefined {
	if (!routes) return undefined;
	if (typeof routes !== 'object' || Array.isArray(routes))
		throw new Error('Malformed eXact endpoint routes');
	if (routes.actions !== undefined && !isEndpointMap(routes.actions))
		throw new Error('Malformed eXact endpoint routes');
	if (routes.boundaries !== undefined && !isEndpointMap(routes.boundaries))
		throw new Error('Malformed eXact endpoint routes');
	const actions = filterEndpointMap(routes.actions);
	const boundaries = filterEndpointMap(routes.boundaries);
	return Object.keys(actions).length || Object.keys(boundaries).length
		? {
				...(Object.keys(actions).length ? { actions } : {}),
				...(Object.keys(boundaries).length ? { boundaries } : {})
			}
		: undefined;
}

function isEndpointMap(value: unknown): value is Record<string, string> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	return Object.entries(value as Record<string, unknown>).every(
		([id, endpoint]) => id.length > 0 && typeof endpoint === 'string' && endpoint.length > 0
	);
}

function filterEndpointMap(map: Record<string, string> | undefined): Record<string, string> {
	const output: Record<string, string> = {};
	for (const [id, endpoint] of Object.entries(map ?? {})) {
		if (id && endpoint) output[id] = endpoint;
	}
	return output;
}
