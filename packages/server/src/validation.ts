import { hasOnlyKeys, isJsonSafe } from './protocol.js';
import {
	isSafeProtocolKey as isSafeObjectKey,
	normalizeProtocolLimit as positiveLimit
} from '@exactjs/core/framework/protocol-records';
import type {
	ExactExecutorContract,
	ExactCollectionMutation,
	ExactInvocationRequest,
	ExactInvocationResult,
	ExactPatch,
	ExactStatePath
} from './types.js';

/** Returns whether an invocation references an entry in the composed executor allowlist. */
export function isExecutorAllowed(
	input: ExactInvocationRequest,
	contract: ExactExecutorContract
): boolean {
	if (input.type === 'invoke') return Boolean(contract.invocations[input.id]);
	if (input.type === 'refresh') return Boolean(contract.boundaries[input.id]);
	return false;
}

/** Returns whether a handler result is JSON-safe and matches the invocation result envelope. */
export function isInvocationResultSafe(
	result: unknown,
	limits: {
		maxJsonDepth?: number;
		maxJsonNodes?: number;
		maxResponseBytes?: number;
		maxPatches?: number;
	} = {}
): result is ExactInvocationResult {
	if (
		!isJsonSafe(result, {
			maxDepth: limits.maxJsonDepth,
			maxNodes: limits.maxJsonNodes,
			maxBytes: limits.maxResponseBytes
		})
	)
		return false;
	if (!result || typeof result !== 'object' || Array.isArray(result)) return false;
	const record = result as Record<string, unknown>;
	if (!hasOnlyKeys(record, ['patches', 'state', 'mutations', 'contexts', 'html', 'value']))
		return false;
	if ('state' in record && record.state === undefined) return false;
	if (
		record.contexts !== undefined &&
		(!record.contexts || typeof record.contexts !== 'object' || Array.isArray(record.contexts))
	)
		return false;
	if (record.patches !== undefined) {
		if (!Array.isArray(record.patches)) return false;
		if (record.patches.length > positiveLimit(limits.maxPatches, 10_000)) return false;
		if (!record.patches.every(isPatchSafe)) return false;
	}
	if (
		record.mutations !== undefined &&
		(!Array.isArray(record.mutations) || !record.mutations.every(isCollectionMutationSafe))
	)
		return false;
	if (record.html !== undefined && typeof record.html !== 'string') return false;
	return true;
}

/** Returns whether collection deltas target exact compiler-authorized collection writes. */
export function collectionMutationsMatchContract(
	mutations: readonly ExactCollectionMutation[] | undefined,
	writes: readonly ExactStatePath[]
): boolean {
	if (!mutations) return true;
	const allowed = new Map(
		writes
			.filter(
				(write) =>
					write.kind === 'write' &&
					write.confidence === 'exact' &&
					(write.operation === 'map' || write.operation === 'set')
			)
			.map((write) => [write.path, write.operation])
	);
	return mutations.every((mutation) => {
		const kind = mutation.operation.startsWith('map-') ? 'map' : 'set';
		return allowed.get(mutation.path) === kind;
	});
}

function isCollectionMutationSafe(value: unknown): value is ExactCollectionMutation {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	if (typeof record.path !== 'string' || !record.path.split('.').every(isSafeObjectKey))
		return false;
	switch (record.operation) {
		case 'map-set':
			return (
				hasOnlyKeys(record, ['path', 'operation', 'key', 'value']) &&
				isTransportableMapKey(record.key) &&
				'value' in record
			);
		case 'map-delete':
			return hasOnlyKeys(record, ['path', 'operation', 'key']) && isTransportableMapKey(record.key);
		case 'map-clear':
		case 'set-clear':
			return hasOnlyKeys(record, ['path', 'operation']);
		case 'set-add':
		case 'set-delete':
			return hasOnlyKeys(record, ['path', 'operation', 'value']) && 'value' in record;
		default:
			return false;
	}
}

function isTransportableMapKey(value: unknown): boolean {
	return (
		value === null ||
		typeof value === 'boolean' ||
		typeof value === 'string' ||
		(typeof value === 'number' && Number.isFinite(value))
	);
}

/** Returns whether submitted boundary snapshots are allowed for the invocation. */
export function boundaryHintsAllowed(
	input: ExactInvocationRequest,
	contract: ExactExecutorContract
): boolean {
	if (!input.boundaryHtmls) return true;
	if (input.type === 'invoke') {
		const allowed = contract.invocations[input.id]?.boundaries;
		if (allowed) {
			const allowedSet = new Set(allowed);
			return Object.keys(input.boundaryHtmls).every((id) => allowedSet.has(id));
		}
	}
	for (const id of Object.keys(input.boundaryHtmls)) {
		if (!contract.boundaries[id]) return false;
	}
	return true;
}

/** Returns whether submitted state satisfies every exact continuation read. */
export function stateMatchesContract(state: unknown, reads: readonly ExactStatePath[]): boolean {
	for (const read of reads) {
		if (read.kind !== 'read' || read.confidence !== 'exact') continue;
		if (!hasStatePath(state, read.path)) return false;
	}
	return true;
}

/**
 * Returns whether a continuation response contains only compiler-authorized
 * state writes. Exact parent paths authorize their complete JSON subtree;
 * absent paths are allowed because control flow may skip a declared write.
 */
export function stateResponseMatchesContract(
	state: unknown,
	writes: readonly ExactStatePath[]
): boolean {
	if (state === undefined) return true;
	const exactWrites = writes.filter(
		(write) => write.kind === 'write' && write.confidence === 'exact'
	);
	if (exactWrites.some((write) => write.path === '*')) return true;
	if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
	return stateNodeMatchesWrites(
		state,
		'',
		exactWrites.map((write) => write.path)
	);
}

/** Validates only explicitly public context projections transported by the client. */
export function publicContextMatchesContract(
	context: Record<string, unknown> | undefined,
	tokens: readonly string[]
): boolean {
	if (!context) return tokens.length === 0;
	if (!tokens.length) return false;
	const allowed = new Set(tokens);
	if (!Object.keys(context).every((token) => allowed.has(token))) return false;
	for (const token of tokens)
		if (!Object.prototype.hasOwnProperty.call(context, token)) return false;
	return true;
}

/** Validates that a response contains only compiler-authorized component-context writes. */
export function contextResponseMatchesContract(
	contexts: Record<string, unknown> | undefined,
	tokens: readonly string[]
): boolean {
	if (!contexts) return true;
	const allowed = new Set(tokens);
	return Object.keys(contexts).every((token) => allowed.has(token));
}

function isPatchSafe(patch: unknown): patch is ExactPatch {
	if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return false;
	const record = patch as Record<string, unknown>;
	if (typeof record.type !== 'string' || typeof record.id !== 'string' || !record.id) return false;

	switch (record.type) {
		case 'text':
			return hasOnlyKeys(record, ['type', 'id', 'value']) && typeof record.value === 'string';
		case 'prop':
			return (
				hasOnlyKeys(record, ['type', 'id', 'name', 'value']) &&
				typeof record.name === 'string' &&
				'value' in record &&
				record.value !== undefined
			);
		case 'style':
			return (
				hasOnlyKeys(record, ['type', 'id', 'name', 'value']) &&
				typeof record.name === 'string' &&
				(typeof record.value === 'string' || record.value === null)
			);
		case 'list':
			return (
				hasOnlyKeys(record, ['type', 'id', 'op', 'key', 'before', 'html']) &&
				typeof record.key === 'string' &&
				(record.op === 'insert' || record.op === 'move' || record.op === 'remove') &&
				(record.before === undefined || typeof record.before === 'string') &&
				(record.html === undefined || typeof record.html === 'string')
			);
		case 'state':
			return (
				hasOnlyKeys(record, ['type', 'id', 'value']) &&
				'value' in record &&
				record.value !== undefined
			);
		case 'replace':
			return hasOnlyKeys(record, ['type', 'id', 'html']) && typeof record.html === 'string';
		default:
			return false;
	}
}

function hasStatePath(value: unknown, path: string): boolean {
	if (path === '*') return value !== undefined;
	let cursor = value;
	for (const segment of path.split('.')) {
		if (Array.isArray(cursor)) {
			if (!isArrayIndex(segment) || !Object.prototype.hasOwnProperty.call(cursor, segment))
				return false;
			cursor = cursor[Number(segment)];
			continue;
		}
		if (!cursor || typeof cursor !== 'object') return false;
		if (!isSafeObjectKey(segment)) return false;
		if (!Object.prototype.hasOwnProperty.call(cursor, segment)) return false;
		cursor = (cursor as Record<string, unknown>)[segment];
	}
	return true;
}

/** Validates a partial response tree without traversing authorized subtrees. */
function stateNodeMatchesWrites(value: object, path: string, writes: readonly string[]): boolean {
	for (const key of Object.keys(value)) {
		if (!isSafeObjectKey(key)) return false;
		if (Array.isArray(value) && !isArrayIndex(key)) return false;
		const childPath = path ? `${path}.${key}` : key;
		if (writes.includes(childPath)) continue;
		if (!writes.some((write) => write.startsWith(`${childPath}.`))) return false;
		const child = (value as Record<string, unknown>)[key];
		if (!child || typeof child !== 'object') return false;
		if (!stateNodeMatchesWrites(child, childPath, writes)) return false;
	}
	return true;
}

function isArrayIndex(segment: string): boolean {
	return /^(0|[1-9]\d*)$/.test(segment);
}
