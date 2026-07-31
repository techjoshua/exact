import { decodeReactiveProtocolValue, sameJsonData } from '@exactjs/core';
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
import { hasOnlyKeys, isJsonSafe } from './validation.js';
import {
	isComponentResumptions,
	isContinuationMap,
	isEndpointRoutes,
	isRecord,
	positiveLimit
} from './config-validation.js';

/** Contextually types a compiler-generated hydration registration without changing its value. */
export function defineExactHydrationRegistration(
	registration: ExactHydrationRegistration
): ExactHydrationRegistration {
	return registration;
}

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
