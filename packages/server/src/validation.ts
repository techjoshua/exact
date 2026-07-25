import { hasOnlyKeys, isJsonSafe } from './protocol.js';
import type {
	ExactExecutorContract,
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
	if (input.type === 'action') return Boolean(contract.actions[input.id]);
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
	if (!hasOnlyKeys(record, ['patches', 'state', 'html'])) return false;
	if ('state' in record && record.state === undefined) return false;
	if (record.patches !== undefined) {
		if (!Array.isArray(record.patches)) return false;
		if (record.patches.length > positiveLimit(limits.maxPatches, 10_000)) return false;
		if (!record.patches.every(isPatchSafe)) return false;
	}
	if (record.html !== undefined && typeof record.html !== 'string') return false;
	return true;
}

function positiveLimit(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

/** Returns whether submitted boundary snapshots are allowed for the invocation. */
export function boundaryHintsAllowed(
	input: ExactInvocationRequest,
	contract: ExactExecutorContract
): boolean {
	if (!input.boundaryHtmls) return true;
	if (input.type === 'action') {
		const allowed = contract.actions[input.id]?.boundaries;
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

function isSafeObjectKey(key: string): boolean {
	return key !== '__proto__' && key !== 'prototype' && key !== 'constructor';
}
