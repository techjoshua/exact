import {
	isExactComponentAuthorizationIdentity,
	sameExactComponentAuthorization
} from '@exactjs/core';
import {
	decodeExactValueWithSchema,
	readPreparedExactClientExecutableComponentContract,
	type AnyExactComponentCallable
} from '@exactjs/core/framework/component-contracts';
import { createDomWorkBudget, walkDomSubtree } from '@exactjs/dom/framework/component-root';
import {
	isRecord,
	normalizeSerializedComponentResumptions,
	positiveLimit
} from './config-validation.js';
import { utf8ByteLength } from './limits.js';
import { decodeBoundedReactiveProtocolValue } from './protocol-decoding.js';
import type { ExactHydrationConfig, ExactHydrationConfigLimits, HydrateOptions } from './types.js';
import { hasOnlyKeys } from './validation.js';

const rootConfigKeys = [
	'pluginRegistryFingerprint',
	'state',
	'm',
	'resumptions',
	'publicContexts',
	'wallClockSnapshot',
	'h',
	'executionRoot',
	'binding',
	'buildKey',
	'componentAuthorization'
] as const;

interface ParsedRootConfigCacheEntry {
	readonly source: string;
	readonly maxBytes: number | undefined;
	readonly maxDepth: number | undefined;
	readonly maxNodes: number | undefined;
	readonly config: ExactHydrationConfig;
}

const rootConfigScriptCache = new WeakMap<Element, HTMLScriptElement>();
const parsedRootConfigCache = new WeakMap<HTMLScriptElement, ParsedRootConfigCacheEntry>();

/** Resolves the field inventory consumed by the hydration-only client entry. */
export function resolveRootHydrateOptions(
	container: Element,
	options: HydrateOptions
): HydrateOptions {
	const config = readRootConfig(container, options.configLimits, options.maxTreeNodes);
	if (
		config.pluginRegistryFingerprint &&
		options.clientPluginRegistryFingerprint &&
		config.pluginRegistryFingerprint !== options.clientPluginRegistryFingerprint
	)
		throw new Error('Client and server eXact plugin registry fingerprints do not match');
	if (config.buildKey && options.buildKey && config.buildKey !== options.buildKey)
		throw new Error('Client and server eXact build identities do not match');
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
		state: options.state === undefined ? config.state : options.state,
		markerlessRoot: options.markerlessRoot ?? config.markerlessRoot,
		allowMarkerless: options.allowMarkerless ?? config.markerlessRoot,
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

function readRootConfig(
	container: Element,
	limits: ExactHydrationConfigLimits = {},
	maxDomNodes?: number
): ExactHydrationConfig {
	const cached = rootConfigScriptCache.get(container);
	if (cached && cached.id === '__exact_hydration' && scriptBelongsToContainer(cached, container))
		return parseRootConfig(cached, limits);
	const root = container.getRootNode() as Node;
	const documentRoot = root.nodeType === 9 ? (root as Document) : root.ownerDocument;
	const indexed = documentRoot?.getElementById('__exact_hydration');
	let scripts: HTMLScriptElement[] = [];
	if (indexed instanceof HTMLScriptElement && (root === documentRoot || root.contains(indexed)))
		scripts = [indexed];
	else {
		const work = createDomWorkBudget(maxDomNodes);
		walkDomSubtree(
			root,
			(node) => {
				if (node instanceof HTMLScriptElement && node.id === '__exact_hydration')
					scripts.push(node);
			},
			{ budget: work }
		);
	}
	for (let cursor: Element | null = container; cursor; cursor = cursor.parentElement) {
		const script = scripts.find((candidate) => cursor!.contains(candidate));
		if (script) {
			rootConfigScriptCache.set(container, script);
			return parseRootConfig(script, limits);
		}
	}
	if (!scripts[0]) return {};
	rootConfigScriptCache.set(container, scripts[0]);
	return parseRootConfig(scripts[0], limits);
}

function scriptBelongsToContainer(script: HTMLScriptElement, container: Element): boolean {
	if (script.getRootNode() !== container.getRootNode()) return false;
	for (let cursor: Element | null = container; cursor; cursor = cursor.parentElement) {
		if (cursor.contains(script)) return true;
	}
	return false;
}

/** Reads server-published component-root props before constructing the client root operation. */
export function readPublishedRootProps<Props extends Record<string, unknown>>(
	container: Element,
	limits?: ExactHydrationConfigLimits,
	maxDomNodes?: number
): Props;
export function readPublishedRootProps<Props extends Record<string, unknown>>(
	component: AnyExactComponentCallable,
	container: Element,
	limits?: ExactHydrationConfigLimits,
	maxDomNodes?: number
): Props;
export function readPublishedRootProps<Props extends Record<string, unknown>>(
	componentOrContainer: AnyExactComponentCallable | Element,
	containerOrLimits?: Element | ExactHydrationConfigLimits,
	limitsOrMaxDomNodes?: ExactHydrationConfigLimits | number,
	maxDomNodes?: number
): Props {
	const component = typeof componentOrContainer === 'function' ? componentOrContainer : undefined;
	const container = (component ? containerOrLimits : componentOrContainer) as Element;
	const limits = (component ? limitsOrMaxDomNodes : containerOrLimits) as
		| ExactHydrationConfigLimits
		| undefined;
	const domLimit = (component ? maxDomNodes : limitsOrMaxDomNodes) as number | undefined;
	const config = readRootConfig(container, limits, domLimit);
	let value = config.state;
	if (component && Array.isArray(value)) {
		const artifact = readPreparedExactClientExecutableComponentContract(component).artifact;
		if (value.length !== 2 || value[0] !== artifact.id || !artifact.serialization)
			throw new TypeError('Missing or malformed eXact published root props');
		value = decodeExactValueWithSchema(value[1], artifact.serialization);
		// The parsed request-owned config becomes the single named graph shared by root creation and
		// hydration. The immutable artifact retains only schema strings and tuple kinds.
		(config as { state?: unknown }).state = value;
	}
	if (!isRecord(value)) throw new TypeError('Missing or malformed eXact published root props');
	return value as Props;
}

function parseRootConfig(
	script: HTMLScriptElement,
	limits: ExactHydrationConfigLimits
): HydrateOptions {
	try {
		const source = script.textContent ?? '{}';
		const cached = parsedRootConfigCache.get(script);
		if (
			cached?.source === source &&
			cached.maxBytes === limits.maxBytes &&
			cached.maxDepth === limits.maxDepth &&
			cached.maxNodes === limits.maxNodes
		)
			return cached.config;
		const maxBytes = positiveLimit(limits.maxBytes, 16 * 1024 * 1024);
		if (source.length > maxBytes || utf8ByteLength(source) > maxBytes) return {};
		const value = decodeBoundedReactiveProtocolValue(
			JSON.parse(source),
			{ maxDepth: limits.maxDepth, maxNodes: limits.maxNodes, maxBytes },
			() => new TypeError('Malformed eXact hydration config')
		);
		if (!value || typeof value !== 'object') return {};
		let pluginRegistryFingerprint: unknown;
		let state: unknown;
		let hasState = false;
		let markerlessRoot = false;
		let serializedResumptions: unknown;
		let publicContexts: unknown;
		let wallClockSnapshot: unknown;
		let hydrationTableValue: unknown;
		let executionRoot: unknown;
		let binding: unknown;
		let buildKeyValue: unknown;
		let componentAuthorizationValue: unknown;
		if (Array.isArray(value)) {
			const mask = value[1];
			if (
				value[0] !== 1 ||
				typeof mask !== 'number' ||
				!Number.isSafeInteger(mask) ||
				mask < 0 ||
				(mask & ~16_383) !== 0 ||
				(mask & 38) !== 0
			)
				return {};
			let index = 2;
			if (mask & 1) pluginRegistryFingerprint = value[index++];
			if (mask & 8) {
				hasState = true;
				state = value[index++];
			}
			markerlessRoot = Boolean(mask & 16);
			if (mask & 64) serializedResumptions = value[index++];
			if (mask & 128) publicContexts = value[index++];
			if (mask & 256) wallClockSnapshot = value[index++];
			if (mask & 512) hydrationTableValue = value[index++];
			if (mask & 1024) executionRoot = value[index++];
			if (mask & 2048) binding = value[index++];
			if (mask & 4096) buildKeyValue = value[index++];
			if (mask & 8192) componentAuthorizationValue = value[index++];
			if (index !== value.length) return {};
		} else {
			const record = value as Record<string, unknown>;
			// This decoder is narrow, not permissive: fields owned by the complete runtime fail closed.
			if (!hasOnlyKeys(record, rootConfigKeys)) return {};
			pluginRegistryFingerprint = record.pluginRegistryFingerprint;
			hasState = 'state' in record;
			state = record.state;
			markerlessRoot = record.m === 1;
			serializedResumptions = record.resumptions;
			publicContexts = record.publicContexts;
			wallClockSnapshot = record.wallClockSnapshot;
			hydrationTableValue = record.h;
			executionRoot = record.executionRoot;
			binding = record.binding;
			buildKeyValue = record.buildKey;
			componentAuthorizationValue = record.componentAuthorization;
		}
		const componentAuthorization = isExactComponentAuthorizationIdentity(
			componentAuthorizationValue
		)
			? componentAuthorizationValue
			: undefined;
		const buildKey = typeof buildKeyValue === 'string' ? buildKeyValue : undefined;
		if (componentAuthorization && buildKey && componentAuthorization.buildKey !== buildKey)
			return {};
		let resumptions: HydrateOptions['resumptions'];
		try {
			resumptions = normalizeSerializedComponentResumptions(serializedResumptions);
		} catch {
			resumptions = undefined;
		}
		const hydrationTable = normalizeRootHydrationTable(hydrationTableValue);
		const config: ExactHydrationConfig = {
			...(typeof pluginRegistryFingerprint === 'string' ? { pluginRegistryFingerprint } : {}),
			...(hasState ? { state } : {}),
			...(markerlessRoot ? { markerlessRoot: true as const } : {}),
			...(resumptions ? { resumptions } : {}),
			...(isRecord(publicContexts) ? { publicContexts } : {}),
			...(typeof wallClockSnapshot === 'number' && Number.isFinite(wallClockSnapshot)
				? { wallClockSnapshot }
				: {}),
			...(hydrationTable ? { hydrationTable } : {}),
			...(typeof executionRoot === 'string' ? { executionRoot } : {}),
			...(typeof binding === 'string' ? { binding } : {}),
			...(buildKey ? { buildKey } : {}),
			...(componentAuthorization ? { componentAuthorization } : {})
		};
		parsedRootConfigCache.set(script, {
			source,
			maxBytes: limits.maxBytes,
			maxDepth: limits.maxDepth,
			maxNodes: limits.maxNodes,
			config
		});
		return config;
	} catch {
		return {};
	}
}

function normalizeRootHydrationTable(value: unknown): ExactHydrationConfig['hydrationTable'] {
	if (!Array.isArray(value) || value.length !== 2 || value[0] !== 1 || !Array.isArray(value[1]))
		return undefined;
	const groups = value[1].map((group) => {
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
		return [group[0], group[1] as string[], rows] as const;
	});
	return [1, groups];
}
