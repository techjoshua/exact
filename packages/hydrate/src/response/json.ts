import type {
	ExactInvocationRequest,
	ExactInvocationResult,
	ExactOperationResult,
	ExactPatch
} from '@exactjs/server';
import { hasOnlyKeys } from '../validation.js';
import { decodeBoundedReactiveProtocolValue } from '../protocol-decoding.js';
import { positiveLimit } from './ndjson.js';
import { isCollectionMutationLike, isPatchLike, parseExactOperationResult } from './result.js';
import { matchesOperation } from './stream.js';

/** Defines the response limits type contract. */
export type ResponseLimits = {
	maxBytes?: number;
	maxJsonDepth?: number;
	maxJsonNodes?: number;
	maxPatches?: number;
};

/** Reads an exact invocation response from its source representation. */
export function parseExactInvocationResponse(
	body: unknown,
	message: string,
	expected?: ExactInvocationRequest,
	limits: ResponseLimits = {}
): ExactInvocationResult {
	body = decodeBoundedReactiveProtocolValue(
		body,
		{
			maxDepth: limits.maxJsonDepth,
			maxNodes: limits.maxJsonNodes,
			maxBytes: limits.maxBytes
		},
		() => new Error(message)
	);
	if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(message);
	const record = body as Record<string, unknown>;
	if (record.ok !== true) throw new Error(message);
	if (
		!hasOnlyKeys(record, [
			'ok',
			'type',
			'id',
			'opId',
			'patches',
			'state',
			'mutations',
			'contexts',
			'value',
			'html'
		])
	)
		throw new Error(message);
	if (expected && !matchesOperation(record, expected)) throw new Error(message);
	if ('state' in record && record.state === undefined) throw new Error(message);
	if (
		record.contexts !== undefined &&
		(!record.contexts || typeof record.contexts !== 'object' || Array.isArray(record.contexts))
	)
		throw new Error(message);
	if (
		record.patches !== undefined &&
		(!Array.isArray(record.patches) || !record.patches.every(isPatchLike))
	)
		throw new Error(message);
	if (
		record.mutations !== undefined &&
		(!Array.isArray(record.mutations) ||
			!record.mutations.every((value) => isCollectionMutationLike(value)))
	)
		throw new Error(message);
	if (
		Array.isArray(record.patches) &&
		record.patches.length > positiveLimit(limits.maxPatches, 10_000)
	)
		throw new Error(message);
	if (record.html !== undefined && typeof record.html !== 'string') throw new Error(message);
	return {
		...(record.patches === undefined ? {} : { patches: record.patches as ExactPatch[] }),
		...('state' in record ? { state: record.state } : {}),
		...(record.mutations === undefined ? {} : { mutations: record.mutations }),
		...(record.contexts === undefined
			? {}
			: { contexts: record.contexts as Record<string, unknown> }),
		...('value' in record ? { value: record.value } : {}),
		...(record.html === undefined ? {} : { html: record.html })
	};
}

/** Reads an exact batch response from its source representation. */
export function parseExactBatchResponse(
	body: unknown,
	expected?: readonly ExactInvocationRequest[],
	limits: ResponseLimits = {}
): ExactOperationResult[] {
	const message = 'eXact batch invocation returned malformed results';
	body = decodeBoundedReactiveProtocolValue(
		body,
		{
			maxDepth: limits.maxJsonDepth,
			maxNodes: limits.maxJsonNodes,
			maxBytes: limits.maxBytes
		},
		() => new Error(message)
	);
	if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(message);
	const record = body as Record<string, unknown>;
	if (record.ok !== true) throw new Error(message);
	if (!hasOnlyKeys(record, ['ok', 'version', 'results'])) throw new Error(message);
	if (record.version !== 1) throw new Error(message);
	if (!Array.isArray(record.results)) throw new Error(message);
	if (expected && record.results.length !== expected.length) throw new Error(message);
	return record.results.map((result, index) =>
		parseExactOperationResult(result, expected?.[index], limits)
	);
}
