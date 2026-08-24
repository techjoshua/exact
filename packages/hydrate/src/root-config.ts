import {
	isExactComponentAuthorizationIdentity,
	sameExactComponentAuthorization
} from '@exactjs/core';
import { createDomWorkBudget, walkDomSubtree } from '@exactjs/dom/root';
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
	'resumptions',
	'publicContexts',
	'wallClockSnapshot',
	'h',
	'executionRoot',
	'binding',
	'buildKey',
	'componentAuthorization'
] as const;

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
		if (script) return parseRootConfig(script, limits);
	}
	return scripts[0] ? parseRootConfig(scripts[0], limits) : {};
}

function parseRootConfig(
	script: HTMLScriptElement,
	limits: ExactHydrationConfigLimits
): HydrateOptions {
	try {
		const source = script.textContent ?? '{}';
		const maxBytes = positiveLimit(limits.maxBytes, 16 * 1024 * 1024);
		if (source.length > maxBytes || utf8ByteLength(source) > maxBytes) return {};
		const value = decodeBoundedReactiveProtocolValue(
			JSON.parse(source),
			{ maxDepth: limits.maxDepth, maxNodes: limits.maxNodes, maxBytes },
			() => new TypeError('Malformed eXact hydration config')
		);
		if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
		const record = value as Record<string, unknown>;
		// This decoder is narrow, not permissive: fields owned by the complete runtime fail closed.
		if (!hasOnlyKeys(record, rootConfigKeys)) return {};
		const componentAuthorization = isExactComponentAuthorizationIdentity(
			record.componentAuthorization
		)
			? record.componentAuthorization
			: undefined;
		const buildKey = typeof record.buildKey === 'string' ? record.buildKey : undefined;
		if (componentAuthorization && buildKey && componentAuthorization.buildKey !== buildKey)
			return {};
		let resumptions: HydrateOptions['resumptions'];
		try {
			resumptions = normalizeSerializedComponentResumptions(record.resumptions);
		} catch {
			resumptions = undefined;
		}
		const hydrationTable = normalizeRootHydrationTable(record.h);
		return {
			...(typeof record.pluginRegistryFingerprint === 'string'
				? { pluginRegistryFingerprint: record.pluginRegistryFingerprint }
				: {}),
			...('state' in record ? { state: record.state } : {}),
			...(resumptions ? { resumptions } : {}),
			...(isRecord(record.publicContexts) ? { publicContexts: record.publicContexts } : {}),
			...(typeof record.wallClockSnapshot === 'number' && Number.isFinite(record.wallClockSnapshot)
				? { wallClockSnapshot: record.wallClockSnapshot }
				: {}),
			...(hydrationTable ? { hydrationTable } : {}),
			...(typeof record.executionRoot === 'string' ? { executionRoot: record.executionRoot } : {}),
			...(typeof record.binding === 'string' ? { binding: record.binding } : {}),
			...(buildKey ? { buildKey } : {}),
			...(componentAuthorization ? { componentAuthorization } : {})
		};
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
