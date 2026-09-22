import type {
	ExactInvocationRequest,
	ExactOperationResult
} from '@exactjs/core/framework/operation-protocol';
import { hasOnlyKeys } from '../validation.js';
import { decodeBoundedReactiveProtocolValue } from '../protocol-decoding.js';
import { parseExactOperationResult } from './result.js';
import type { ResponseLimits } from './json.js';

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
