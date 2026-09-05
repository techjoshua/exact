import { isExactComponentAuthorizationIdentity } from '@exactjs/core';
import type { ExactHydrationConfig, ExactHydrationConfigLimits } from './types.js';
import {
	isEndpointRoutes,
	isRecord,
	normalizeContinuationMap,
	normalizeSerializedComponentResumptions,
	positiveLimit
} from './config-validation.js';
import { utf8ByteLength } from './limits.js';
import { decodeBoundedReactiveProtocolValue } from './protocol-decoding.js';
import { hasOnlyKeys } from './validation.js';
import { cloneEndpointRoutes } from './endpoint-routes.js';

/** Parses the bounded full-runtime hydration document protocol and fails closed on malformed data. */
export function parseDocumentHydrationConfig(
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
		if (!value || typeof value !== 'object') return {};
		let pluginRegistryFingerprint: unknown;
		let endpoint: unknown;
		let endpointRoutes: unknown;
		let state: unknown;
		let hasState = false;
		let serializedContinuations: unknown;
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
				(mask & ~16_383) !== 0
			)
				return {};
			let index = 2;
			if (mask & 1) pluginRegistryFingerprint = value[index++];
			if (mask & 2) endpoint = value[index++];
			if (mask & 4) endpointRoutes = value[index++];
			if (mask & 8) {
				hasState = true;
				state = value[index++];
			}
			if (mask & 32) serializedContinuations = value[index++];
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
			pluginRegistryFingerprint = record.pluginRegistryFingerprint;
			endpoint = record.endpoint;
			endpointRoutes = record.endpoints;
			hasState = 'state' in record;
			state = record.state;
			serializedContinuations = record.continuations;
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
		const continuations = safelyNormalizeContinuationMap(serializedContinuations);
		const resumptions = safelyNormalizeComponentResumptions(serializedResumptions);
		const endpoints = isEndpointRoutes(endpointRoutes)
			? cloneEndpointRoutes(endpointRoutes)
			: undefined;
		const hydrationTable = normalizeHydrationTable(hydrationTableValue);
		return {
			...(typeof pluginRegistryFingerprint === 'string' ? { pluginRegistryFingerprint } : {}),
			...(typeof endpoint === 'string' ? { endpoint } : {}),
			...(endpoints === undefined ? {} : { endpoints }),
			...(hasState ? { state } : {}),
			...(continuations === undefined ? {} : { continuations }),
			...(resumptions === undefined ? {} : { resumptions }),
			...(isRecord(publicContexts) ? { publicContexts } : {}),
			...(typeof wallClockSnapshot === 'number' && Number.isFinite(wallClockSnapshot)
				? { wallClockSnapshot }
				: {}),
			...(hydrationTable ? { hydrationTable } : {}),
			...(typeof executionRoot === 'string' ? { executionRoot } : {}),
			...(typeof binding === 'string' ? { binding } : {}),
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
		return normalizeSerializedComponentResumptions(value);
	} catch {
		return undefined;
	}
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
