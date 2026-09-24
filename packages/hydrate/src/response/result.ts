import type {
	ExactInvocationRequest,
	ExactOperationResult
} from '@exactjs/core/framework/operation-protocol';
import { hasOnlyKeys, isJsonSafe } from '../validation.js';
import { type ResponseLimits, parseExactInvocationResponse } from './json.js';
import { matchesOperation } from './operation-identity.js';

/** Reads an exact operation result from its source representation. */
export function parseExactOperationResult(
	value: unknown,
	expected?: ExactInvocationRequest,
	limits: ResponseLimits = {}
): ExactOperationResult {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('eXact batch invocation returned malformed results');
	if (
		!isJsonSafe(value, {
			maxDepth: limits.maxJsonDepth,
			maxNodes: limits.maxJsonNodes,
			maxBytes: limits.maxBytes
		})
	)
		throw new Error('eXact batch invocation returned malformed results');
	const record = value as Record<string, unknown>;
	if (record.ok === true) {
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
			throw new Error('eXact batch invocation returned malformed results');
		if (record.type !== 'invoke' && record.type !== 'refresh')
			throw new Error('eXact batch invocation returned malformed results');
		if (typeof record.id !== 'string' || !record.id)
			throw new Error('eXact batch invocation returned malformed results');
		if (record.opId !== undefined && typeof record.opId !== 'string')
			throw new Error('eXact batch invocation returned malformed results');
		if (expected && !matchesOperation(record, expected))
			throw new Error('eXact batch invocation returned malformed results');
		const result = parseExactInvocationResponse(
			{
				ok: true,
				...(record.patches === undefined ? {} : { patches: record.patches }),
				...('state' in record ? { state: record.state } : {}),
				...(record.mutations === undefined ? {} : { mutations: record.mutations }),
				...(record.contexts === undefined ? {} : { contexts: record.contexts }),
				...('value' in record ? { value: record.value } : {}),
				...(record.html === undefined ? {} : { html: record.html })
			},
			'eXact batch invocation returned malformed results',
			undefined,
			limits
		);
		return {
			ok: true,
			type: record.type,
			id: record.id,
			...(record.opId === undefined ? {} : { opId: record.opId }),
			...result
		};
	}
	if (record.ok === false) {
		if (!hasOnlyKeys(record, ['ok', 'type', 'id', 'opId', 'status', 'error']))
			throw new Error('eXact batch invocation returned malformed results');
		if (record.type !== 'invoke' && record.type !== 'refresh')
			throw new Error('eXact batch invocation returned malformed results');
		if (typeof record.id !== 'string' || !record.id)
			throw new Error('eXact batch invocation returned malformed results');
		if (record.opId !== undefined && typeof record.opId !== 'string')
			throw new Error('eXact batch invocation returned malformed results');
		if (expected && !matchesOperation(record, expected))
			throw new Error('eXact batch invocation returned malformed results');
		if (typeof record.status !== 'number' || !Number.isInteger(record.status))
			throw new Error('eXact batch invocation returned malformed results');
		if (
			record.error !== 'bad_request' &&
			record.error !== 'not_found' &&
			record.error !== 'forbidden' &&
			record.error !== 'internal_error' &&
			record.error !== 'dependency_failed'
		) {
			throw new Error('eXact batch invocation returned malformed results');
		}
		return {
			ok: false,
			type: record.type,
			id: record.id,
			...(record.opId === undefined ? {} : { opId: record.opId }),
			status: record.status,
			error: record.error
		};
	}
	throw new Error('eXact batch invocation returned malformed results');
}
