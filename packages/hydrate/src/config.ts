import {
	isExactComponentAuthorizationIdentity,
	sameExactComponentAuthorization,
	sameJsonData
} from '@exactjs/core';
import { createDomWorkBudget, walkDomSubtree, type DomWorkBudget } from '@exactjs/dom';
import type {
	ClientIslandRegistry,
	ExactEndpointRoutes,
	ExactEndpointTransport,
	ExactHydrationConfig,
	ExactHydrationConfigLimits,
	ExactHydrationRegistration,
	ExactHydrationRegistrationInput,
	HydrateOptions
} from './types.js';
import { hasOnlyKeys } from './validation.js';
import {
	isEndpointRoutes,
	isRecord,
	normalizeComponentResumptions,
	normalizeContinuationMap,
	positiveLimit
} from './config-validation.js';
import { utf8ByteLength } from './limits.js';
import { decodeBoundedReactiveProtocolValue } from './protocol-decoding.js';

/** Contextually types a compiler-generated hydration registration without changing its value. */
export function defineExactHydrationRegistration(
	registration: ExactHydrationRegistrationInput
): ExactHydrationRegistration {
	const continuations = normalizeContinuationMap(registration.continuations);
	const resumptions = normalizeComponentResumptions(registration.resumptions);
	const {
		continuations: _serializedContinuations,
		resumptions: _serializedResumptions,
		...fields
	} = registration;
	return {
		...fields,
		...(continuations === undefined ? {} : { continuations }),
		...(resumptions === undefined ? {} : { resumptions })
	};
}

/** Reads and validates the serialized hydration configuration embedded in the document. */
export function readExactHydrationConfig(
	root: ParentNode = document,
	scriptId = '__exact_hydration',
	limits: ExactHydrationConfigLimits = {},
	work: DomWorkBudget = createDomWorkBudget(limits.maxNodes)
): ExactHydrationConfig {
	const indexed = indexedHydrationScript(root, scriptId);
	if (indexed) return parseHydrationConfig(indexed, limits);
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
		if (source.length > maxBytes || utf8ByteLength(source) > maxBytes) return {};
		const encoded = JSON.parse(source);
		const value = decodeBoundedReactiveProtocolValue(
			encoded,
			{ maxDepth: limits.maxDepth, maxNodes: limits.maxNodes, maxBytes },
			() => new TypeError('Malformed eXact hydration config')
		);
		if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
		const record = value as Record<string, unknown>;
		if (
			!hasOnlyKeys(record, [
				'pluginRegistryFingerprint',
				'endpoint',
				'endpoints',
				'state',
				'continuations',
				'resumptions',
				'publicContexts',
				'wallClockSnapshot',
				'h',
				'executionRoot',
				'binding',
				'buildKey',
				'componentAuthorization'
			])
		)
			return {};
		const componentAuthorization = isExactComponentAuthorizationIdentity(
			record.componentAuthorization
		)
			? record.componentAuthorization
			: undefined;
		const buildKey = typeof record.buildKey === 'string' ? record.buildKey : undefined;
		if (componentAuthorization && buildKey && componentAuthorization.buildKey !== buildKey)
			return {};
		const continuations = safelyNormalizeContinuationMap(record.continuations);
		const resumptions = safelyNormalizeComponentResumptions(record.resumptions);
		const endpoints = isEndpointRoutes(record.endpoints)
			? mergeEndpointRoutes(undefined, record.endpoints)
			: undefined;
		const hydrationTable = normalizeHydrationTable(record.h);
		return {
			...(typeof record.pluginRegistryFingerprint === 'string'
				? { pluginRegistryFingerprint: record.pluginRegistryFingerprint }
				: {}),
			...(typeof record.endpoint === 'string' ? { endpoint: record.endpoint } : {}),
			...(endpoints === undefined ? {} : { endpoints }),
			...('state' in record ? { state: record.state } : {}),
			...(continuations === undefined ? {} : { continuations }),
			...(resumptions === undefined ? {} : { resumptions }),
			...(isRecord(record.publicContexts) ? { publicContexts: record.publicContexts } : {}),
			...(typeof record.wallClockSnapshot === 'number' && Number.isFinite(record.wallClockSnapshot)
				? { wallClockSnapshot: record.wallClockSnapshot }
				: {}),
			...(hydrationTable ? { hydrationTable } : {}),
			...(typeof record.executionRoot === 'string' ? { executionRoot: record.executionRoot } : {}),
			...(typeof record.binding === 'string' ? { binding: record.binding } : {}),
			...(buildKey === undefined ? {} : { buildKey }),
			...(componentAuthorization === undefined ? {} : { componentAuthorization })
		};
	} catch {
		return {};
	}
}

function safelyNormalizeContinuationMap(value: unknown) {
	try {
		return normalizeContinuationMap(value);
	} catch {
		return undefined;
	}
}

function safelyNormalizeComponentResumptions(value: unknown) {
	try {
		return normalizeComponentResumptions(value);
	} catch {
		return undefined;
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
	if (
		config.componentAuthorization &&
		options.componentAuthorization &&
		!sameExactComponentAuthorization(config.componentAuthorization, options.componentAuthorization)
	)
		throw new Error('Client and server component authorization fingerprints do not match');
	const componentAuthorization = options.componentAuthorization ?? config.componentAuthorization;
	const buildKey = options.buildKey ?? config.buildKey;
	if (componentAuthorization && buildKey && componentAuthorization.buildKey !== buildKey)
		throw new Error('Component authorization identity does not match the hydration build key');
	return {
		...options,
		endpoint: options.endpoint ?? config.endpoint,
		endpoints: mergeEndpointRoutes(config.endpoints, options.endpoints),
		state: options.state === undefined ? config.state : options.state,
		continuations: mergeUniqueRecord(
			config.continuations,
			normalizeContinuationMap(options.continuations),
			'continuation',
			sameJsonData
		),
		resumptions: options.resumptions ?? config.resumptions,
		publicContexts: options.publicContexts ?? config.publicContexts,
		wallClockSnapshot: options.wallClockSnapshot ?? config.wallClockSnapshot,
		hydrationTable: options.hydrationTable ?? config.hydrationTable,
		executionRoot: options.executionRoot ?? config.executionRoot,
		binding: options.binding ?? config.binding,
		buildKey,
		componentAuthorization,
		headers: componentAuthorization
			? {
					...options.headers,
					'X-Exact-Component-Authorization': componentAuthorization.fingerprint
				}
			: options.headers
	};
}

function normalizeHydrationTable(value: unknown): ExactHydrationConfig['hydrationTable'] {
	if (!Array.isArray(value) || value.length !== 2 || value[0] !== 1 || !Array.isArray(value[1]))
		return undefined;
	const groups = value[1].map(
		(group): NonNullable<ExactHydrationConfig['hydrationTable']>[1][number] => {
			if (
				!Array.isArray(group) ||
				group.length !== 3 ||
				typeof group[0] !== 'string' ||
				!Array.isArray(group[1]) ||
				!group[1].every((name) => typeof name === 'string') ||
				new Set(group[1]).size !== group[1].length ||
				!Array.isArray(group[2])
			)
				return undefined;
			const rows = group[2].map((row) =>
				Array.isArray(row) && row.length === group[1].length + 1 && typeof row[0] === 'string'
					? (row as [string, ...unknown[]])
					: undefined
			);
			return [group[0], group[1], rows] as const;
		}
	);
	return [1, groups];
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
			normalizeRegistrationContinuations(registration.continuations),
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

/**
 * Canonicalizes valid compiler contracts while retaining malformed values for
 * the existing fail-closed duplicate-conflict path.
 */
function normalizeRegistrationContinuations(
	continuations: ExactHydrationRegistration['continuations']
): ExactHydrationRegistration['continuations'] {
	try {
		return normalizeContinuationMap(continuations);
	} catch {
		return continuations;
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
	const invocations = {
		...(base?.invocations ?? {}),
		...(override?.invocations ?? {})
	};
	const boundaries = {
		...(base?.boundaries ?? {}),
		...(override?.boundaries ?? {})
	};
	return Object.keys(invocations).length || Object.keys(boundaries).length
		? {
				...(Object.keys(invocations).length ? { invocations } : {}),
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
		invocations: mergeUniqueRecord(
			base?.invocations,
			registration.invocations,
			'invocation endpoint route',
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
	const root = container.getRootNode() as Node;
	const indexed = indexedHydrationScript(root as ParentNode, '__exact_hydration');
	if (indexed) return parseHydrationConfig(indexed, limits);
	const work = createDomWorkBudget(maxDomNodes);
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

/** Uses the document's id index when the requested root owns the indexed hydration script. */
function indexedHydrationScript(root: ParentNode, scriptId: string): HTMLScriptElement | undefined {
	const documentRoot = root.nodeType === 9 ? (root as Document) : (root as Node).ownerDocument;
	const candidate = documentRoot?.getElementById(scriptId);
	if (!(candidate instanceof HTMLScriptElement)) return undefined;
	return root === documentRoot || root.contains(candidate) ? candidate : undefined;
}
