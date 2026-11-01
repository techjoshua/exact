import { resolveHydrationConfiguration } from './configuration-options.js';
import { sameJsonData } from '@exactjs/core';
import { addUniqueArrayClientBinding } from '@exactjs/core/framework/component-contracts';
import { createDomWorkBudget, walkDomSubtree, type DomWorkBudget } from '@exactjs/dom/root';
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
import {
	normalizeComponentResumptionRegistrations,
	normalizeContinuationMap
} from './config-validation.js';
import { parseDocumentHydrationConfig } from './document-config.js';
import { cloneEndpointRoutes, mergeEndpointRoutes } from './endpoint-routes.js';

/**
 * Validates and normalizes compiler-generated continuation and resumption registrations.
 * Returns a new registration object. Invalid entries throw rather than being silently omitted.
 */
export function defineExactHydrationRegistration(
	registration: ExactHydrationRegistrationInput
): ExactHydrationRegistration {
	const continuations = normalizeContinuationMap(registration.continuations);
	const resumptions = normalizeComponentResumptionRegistrations(registration.resumptions);
	const continuationArrays = mergeArrayClientBindings(undefined, registration.continuationArrays);
	const {
		continuations: _serializedContinuations,
		resumptions: _serializedResumptions,
		continuationArrays: _executableArrays,
		...fields
	} = registration;
	return {
		...fields,
		...(continuations === undefined ? {} : { continuations }),
		...(resumptions === undefined ? {} : { resumptions }),
		...(continuationArrays === undefined ? {} : { continuationArrays })
	};
}

/**
 * Reads serialized hydration configuration within the supplied search root.
 * With no root, searches `document`. An explicit root restricts lookup to that subtree,
 * including the root itself, without searching siblings or falling back to its owner document.
 * Returns `{}` if no matching script exists or its configuration is malformed or oversized.
 * Exceeding the DOM traversal budget throws.
 *
 * `createExactClient` and public `hydrate` discover configuration automatically, including
 * document-level sibling scripts. Ordinary bootstrap code does not need to call this reader.
 * For an isolated fragment or shadow root, pass the container holding the configuration script.
 *
 * @param scriptId Configuration script ID, defaulting to `__exact_hydration`.
 */
export function readExactHydrationConfig(
	root: ParentNode = document,
	scriptId = '__exact_hydration',
	limits: ExactHydrationConfigLimits = {},
	work: DomWorkBudget = createDomWorkBudget(limits.maxNodes)
): ExactHydrationConfig {
	const indexed = indexedHydrationScript(root, scriptId);
	if (indexed) return parseDocumentHydrationConfig(indexed, limits);
	let script: HTMLScriptElement | undefined;
	walkDomSubtree(
		root as Node,
		(node) => {
			if (!script && node instanceof HTMLScriptElement && node.id === scriptId) script = node;
		},
		{ budget: work }
	);
	return script ? parseDocumentHydrationConfig(script, limits) : {};
}

/** Combines explicit hydration options with the nearest serialized document config. */
export function resolveHydrateOptions(container: Element, options: HydrateOptions): HydrateOptions {
	const config = readNearestHydrationConfig(container, options.configLimits, options.maxTreeNodes);
	return resolveHydrationConfiguration(options, config, () => ({
		endpoint: options.endpoint ?? config.endpoint,
		continuationArrays: mergeArrayClientBindings(undefined, options.continuationArrays),
		endpoints: mergeEndpointRoutes(config.endpoints, options.endpoints),
		continuations: mergeUniqueRecord(
			config.continuations,
			normalizeContinuationMap(options.continuations),
			'continuation',
			sameJsonData
		)
	}));
}

/** Merges a late-loaded hydration registration into an existing client runtime configuration. */
export function mergeHydrationRegistration(
	options: HydrateOptions,
	registration: ExactHydrationRegistration
): void {
	const continuationArrays = mergeArrayClientBindings(
		options.continuationArrays,
		registration.continuationArrays
	);
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
	options.continuationArrays = continuationArrays;
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

/** Copies executable bindings into root ownership using composition's closed identity checks. */
function mergeArrayClientBindings(
	base: HydrateOptions['continuationArrays'],
	next: HydrateOptions['continuationArrays']
): HydrateOptions['continuationArrays'] {
	if (!base && !next) return undefined;
	const output = { ...base };
	for (const [id, binding] of Object.entries(next ?? {}))
		addUniqueArrayClientBinding(output, id, binding);
	return output;
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
	if (indexed) return parseDocumentHydrationConfig(indexed, limits);
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
		if (script) return parseDocumentHydrationConfig(script, limits);
	}
	return scripts[0] ? parseDocumentHydrationConfig(scripts[0], limits) : {};
}

/** Uses the document's id index when the requested root owns the indexed hydration script. */
function indexedHydrationScript(root: ParentNode, scriptId: string): HTMLScriptElement | undefined {
	const documentRoot = root.nodeType === 9 ? (root as Document) : (root as Node).ownerDocument;
	const candidate = documentRoot?.getElementById(scriptId);
	if (!(candidate instanceof HTMLScriptElement)) return undefined;
	return root === documentRoot || root.contains(candidate) ? candidate : undefined;
}
