import {
	decodeReactiveProtocolValue,
	sameJsonData,
	type ComponentResumptionActivation
} from '@exactjs/core';
import { createDomWorkBudget, walkDomSubtree, type DomWorkBudget } from '@exactjs/dom';
import type {
	ClientIslandRegistry,
	ExactEndpointRoutes,
	ExactEndpointTransport,
	ExactHydrationConfig,
	ExactHydrationConfigLimits,
	ExactHydrationRegistration,
	HydrateOptions
} from './types.js';
import type { ExactComponentContinuationContract } from '@exactjs/core';
import { hasOnlyKeys, isJsonSafe } from './validation.js';

/** Reads and validates the serialized hydration configuration embedded in the document. */
export function readExactHydrationConfig(
	root: ParentNode = document,
	scriptId = '__exact_hydration',
	limits: ExactHydrationConfigLimits = {},
	work: DomWorkBudget = createDomWorkBudget(limits.maxNodes)
): ExactHydrationConfig {
	let script: HTMLScriptElement | undefined;
	walkDomSubtree(
		root as Node,
		(node) => {
			if (!script && node instanceof HTMLScriptElement && node.id === scriptId) script = node;
		},
		{ budget: work }
	);
	return script ? parseHydrationConfig(script, limits) : {};
}

function parseHydrationConfig(
	script: HTMLScriptElement,
	limits: ExactHydrationConfigLimits
): ExactHydrationConfig {
	try {
		const source = script.textContent ?? '{}';
		const maxBytes = positiveLimit(limits.maxBytes, 16 * 1024 * 1024);
		if (source.length > maxBytes || new TextEncoder().encode(source).byteLength > maxBytes)
			return {};
		const encoded = JSON.parse(source);
		if (!isJsonSafe(encoded, { maxDepth: limits.maxDepth, maxNodes: limits.maxNodes, maxBytes }))
			return {};
		const value = decodeReactiveProtocolValue(encoded);
		if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
		const record = value as Record<string, unknown>;
		if (
			!isJsonSafe(record, { maxDepth: limits.maxDepth, maxNodes: limits.maxNodes, maxBytes }) ||
			!hasOnlyKeys(record, [
				'pluginRegistryFingerprint',
				'endpoint',
				'endpoints',
				'state',
				'continuations',
				'resumptions',
				'publicContexts',
				'executionRoot',
				'binding',
				'buildKey'
			])
		)
			return {};
		return {
			pluginRegistryFingerprint:
				typeof record.pluginRegistryFingerprint === 'string'
					? record.pluginRegistryFingerprint
					: undefined,
			endpoint: typeof record.endpoint === 'string' ? record.endpoint : undefined,
			endpoints: isEndpointRoutes(record.endpoints) ? record.endpoints : undefined,
			...('state' in record ? { state: record.state } : {}),
			continuations: isContinuationMap(record.continuations) ? record.continuations : undefined,
			resumptions: isComponentResumptions(record.resumptions) ? record.resumptions : undefined,
			publicContexts: isRecord(record.publicContexts) ? record.publicContexts : undefined,
			executionRoot: typeof record.executionRoot === 'string' ? record.executionRoot : undefined,
			binding: typeof record.binding === 'string' ? record.binding : undefined,
			buildKey: typeof record.buildKey === 'string' ? record.buildKey : undefined
		};
	} catch {
		return {};
	}
}

/** Combines explicit hydration options with the nearest serialized document config. */
export function resolveHydrateOptions(container: Element, options: HydrateOptions): HydrateOptions {
	const config = readNearestHydrationConfig(container, options.configLimits, options.maxTreeNodes);
	if (
		config.pluginRegistryFingerprint &&
		options.clientPluginRegistryFingerprint &&
		config.pluginRegistryFingerprint !== options.clientPluginRegistryFingerprint
	) {
		throw new Error('Client and server eXact plugin registry fingerprints do not match');
	}
	if (config.buildKey && options.buildKey && config.buildKey !== options.buildKey) {
		throw new Error('Client and server eXact build identities do not match');
	}
	return {
		...options,
		endpoint: options.endpoint ?? config.endpoint,
		endpoints: mergeEndpointRoutes(config.endpoints, options.endpoints),
		state: options.state === undefined ? config.state : options.state,
		continuations: mergeUniqueRecord(
			config.continuations,
			options.continuations,
			'continuation',
			sameJsonData
		),
		resumptions: options.resumptions ?? config.resumptions,
		publicContexts: options.publicContexts ?? config.publicContexts,
		executionRoot: options.executionRoot ?? config.executionRoot,
		binding: options.binding ?? config.binding,
		buildKey: options.buildKey ?? config.buildKey
	};
}

/** Merges a late-loaded hydration registration into an existing client runtime configuration. */
export function mergeHydrationRegistration(
	options: HydrateOptions,
	registration: ExactHydrationRegistration
): void {
	if (registration.endpoint !== undefined) {
		if (options.endpoint !== undefined && options.endpoint !== registration.endpoint) {
			throw new Error('Conflicting eXact hydration endpoint registration');
		}
		options.endpoint = registration.endpoint;
	}
	options.endpoints = mergeHydrationEndpointRoutes(options.endpoints, registration.endpoints);
	if (registration.state !== undefined) options.state = registration.state;
	if (registration.continuations) {
		options.continuations = mergeUniqueRecord(
			options.continuations,
			registration.continuations,
			'continuation',
			sameJsonData
		);
	}
	if (registration.resumptions) {
		options.resumptions = [...(options.resumptions ?? []), ...registration.resumptions];
	}
	if (registration.publicContexts) {
		options.publicContexts = mergeUniqueRecord(
			options.publicContexts,
			registration.publicContexts,
			'public context',
			sameJsonData
		);
	}
	if (registration.islands) mergeClientIslands(options, registration.islands);
	if (registration.transports) {
		options.transports = mergeUniqueRecord(
			options.transports,
			registration.transports,
			'endpoint transport',
			sameEndpointTransport
		);
	}
}

/** Merges client island component registrations while rejecting conflicting names. */
export function mergeClientIslands(options: HydrateOptions, islands: ClientIslandRegistry): void {
	options.islands = mergeUniqueRecord(
		options.islands,
		islands,
		'client island',
		(left, right) => left === right
	);
}

/** Creates a stable cache key for a header object independent of property order. */
export function headersCacheKey(headers: Record<string, string> | undefined): string {
	if (!headers) return '';
	return Object.entries(headers)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([name, value]) => `${name}:${value}`)
		.join('\n');
}

function mergeEndpointRoutes(
	base: ExactEndpointRoutes | undefined,
	override: ExactEndpointRoutes | undefined
): ExactEndpointRoutes | undefined {
	const actions = {
		...(base?.actions ?? {}),
		...(override?.actions ?? {})
	};
	const boundaries = {
		...(base?.boundaries ?? {}),
		...(override?.boundaries ?? {})
	};
	return Object.keys(actions).length || Object.keys(boundaries).length
		? {
				...(Object.keys(actions).length ? { actions } : {}),
				...(Object.keys(boundaries).length ? { boundaries } : {})
			}
		: undefined;
}

/** Clones endpoint routing maps so runtime mutation does not alter serialized config objects. */
export function cloneEndpointRoutes(
	routes: ExactEndpointRoutes | undefined
): ExactEndpointRoutes | undefined {
	return mergeEndpointRoutes(undefined, routes);
}

function mergeHydrationEndpointRoutes(
	base: ExactEndpointRoutes | undefined,
	registration: ExactEndpointRoutes | undefined
): ExactEndpointRoutes | undefined {
	if (!registration) return cloneEndpointRoutes(base);
	return mergeEndpointRoutes(base, {
		actions: mergeUniqueRecord(
			base?.actions,
			registration.actions,
			'action endpoint route',
			(left, right) => left === right
		),
		boundaries: mergeUniqueRecord(
			base?.boundaries,
			registration.boundaries,
			'boundary endpoint route',
			(left, right) => left === right
		)
	});
}

function mergeUniqueRecord<T>(
	base: Record<string, T> | undefined,
	next: Record<string, T> | undefined,
	label: string,
	same: (left: T, right: T) => boolean
): Record<string, T> | undefined {
	if (!base && !next) return undefined;
	const output: Record<string, T> = { ...(base ?? {}) };
	for (const [key, value] of Object.entries(next ?? {})) {
		// Duplicate registrations are accepted only when they are byte-for-byte equivalent;
		// this lets independently loaded bundles share contracts without masking conflicts.
		if (Object.prototype.hasOwnProperty.call(output, key) && !same(output[key]!, value)) {
			throw new Error(`Conflicting eXact hydration ${label} registration: ${key}`);
		}
		output[key] = value;
	}
	return output;
}

function sameEndpointTransport(
	left: ExactEndpointTransport,
	right: ExactEndpointTransport
): boolean {
	return left.fetch === right.fetch && sameHeaderMap(left.headers, right.headers);
}

function sameHeaderMap(
	left: Record<string, string> | undefined,
	right: Record<string, string> | undefined
): boolean {
	return headersCacheKey(left) === headersCacheKey(right);
}

function readNearestHydrationConfig(
	container: Element,
	limits: ExactHydrationConfigLimits = {},
	maxDomNodes?: number
): ExactHydrationConfig {
	const work = createDomWorkBudget(maxDomNodes);
	const root = container.getRootNode() as Node;
	const scripts: HTMLScriptElement[] = [];
	walkDomSubtree(
		root,
		(node) => {
			if (node instanceof HTMLScriptElement && node.id === '__exact_hydration') scripts.push(node);
		},
		{ budget: work }
	);
	for (let cursor: Element | null = container; cursor; cursor = cursor.parentElement) {
		const script = scripts.find((candidate) => cursor!.contains(candidate));
		if (script) return parseHydrationConfig(script, limits);
	}
	return scripts[0] ? parseHydrationConfig(scripts[0], limits) : {};
}

function isContinuationMap(
	value: unknown
): value is Record<string, ExactComponentContinuationContract> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	return Object.values(value as Record<string, unknown>).every(isContinuation);
}

/** Validates ordered SSR activations before they can affect component construction. */
function isComponentResumptions(value: unknown): value is ComponentResumptionActivation[] {
	return (
		Array.isArray(value) &&
		value.every((item) => {
			if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
			const record = item as Record<string, unknown>;
			return (
				hasOnlyKeys(record, ['componentId', 'values', 'contexts', 'settledContinuations']) &&
				typeof record.componentId === 'string' &&
				isRecord(record.values) &&
				Object.keys(record.values).every(safeResumptionPath) &&
				isRecord(record.contexts) &&
				Object.keys(record.contexts).every(safeContextName) &&
				isStringList(record.settledContinuations)
			);
		})
	);
}

/** Rejects prototype-bearing or empty state paths in serialized activations. */
function safeResumptionPath(path: string): boolean {
	return (
		path.length > 0 &&
		path
			.split('.')
			.every(
				(segment) =>
					segment.length > 0 &&
					segment !== '__proto__' &&
					segment !== 'prototype' &&
					segment !== 'constructor'
			)
	);
}

/** Rejects context keys that could mutate an ordinary protocol object's prototype. */
function safeContextName(name: string): boolean {
	return name.length > 0 && name !== '__proto__' && name !== 'prototype' && name !== 'constructor';
}

function isContinuation(value: unknown): value is ExactComponentContinuationContract {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	return (
		hasOnlyKeys(record, [
			'id',
			'componentId',
			'dependencies',
			'stateReads',
			'stateWrites',
			'publicContexts',
			'serverContexts',
			'contextWrites',
			'boundaries'
		]) &&
		typeof record.id === 'string' &&
		typeof record.componentId === 'string' &&
		isContinuationDependencies(record.dependencies) &&
		isStatePathList(record.stateReads) &&
		isStatePathList(record.stateWrites) &&
		isStringList(record.publicContexts) &&
		isStringList(record.serverContexts) &&
		record.serverContexts.length === 0 &&
		isStringList(record.contextWrites) &&
		isStringList(record.boundaries)
	);
}

/** Validates the transport-safe dependency source descriptors. */
function isContinuationDependencies(value: unknown): boolean {
	return (
		Array.isArray(value) &&
		value.every(
			(item) =>
				Boolean(item && typeof item === 'object' && !Array.isArray(item)) &&
				hasOnlyKeys(item as Record<string, unknown>, ['source']) &&
				((item as Record<string, unknown>).source === 'state' ||
					(item as Record<string, unknown>).source === 'props' ||
					(item as Record<string, unknown>).source === 'derived')
		)
	);
}

function isStatePathList(value: unknown): boolean {
	return (
		Array.isArray(value) &&
		value.every((item) => {
			if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
			const record = item as Record<string, unknown>;
			return (
				hasOnlyKeys(record, ['path', 'kind', 'confidence']) &&
				typeof record.path === 'string' &&
				(record.kind === 'read' || record.kind === 'write') &&
				(record.confidence === 'exact' ||
					record.confidence === 'broad' ||
					record.confidence === 'unknown')
			);
		})
	);
}

function positiveLimit(value: number | undefined, fallback: number): number {
	return Number.isSafeInteger(value) && value! > 0 ? value! : fallback;
}

function isStringList(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isEndpointRoutes(value: unknown): value is ExactEndpointRoutes {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	if (!hasOnlyKeys(record, ['actions', 'boundaries'])) return false;
	return (
		(record.actions === undefined || isEndpointMap(record.actions)) &&
		(record.boundaries === undefined || isEndpointMap(record.boundaries))
	);
}

function isEndpointMap(value: unknown): value is Record<string, string> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	return Object.entries(value as Record<string, unknown>).every(([id, endpoint]) => {
		return id.length > 0 && typeof endpoint === 'string' && endpoint.length > 0;
	});
}
