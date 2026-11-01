import { responseResourceBudget, responseGraphLimits } from '../response-resources.js';
import type {
	ExactInvocationRequest,
	ExactOperationResult
} from '@exactjs/core/framework/operation-protocol';
import { hasOnlyKeys, isDecodedProtocolSafe } from '../validation.js';
import { type ResponseLimits, parseDecodedInvocationResponse } from './json.js';
import { matchesOperation } from './operation-identity.js';

/** Validates one decoded batch or stream result while preserving its native values and identity. */
export function parseExactOperationResult(
	value: unknown,
	expected?: ExactInvocationRequest,
	limits: ResponseLimits = {}
): ExactOperationResult {
	limits = { ...limits, resources: limits.resources ?? responseResourceBudget(limits.logger) };
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('eXact batch invocation returned malformed results');
	if (
		!isDecodedProtocolSafe(
			value,
			responseGraphLimits(
				limits,
				limits.resources ?? responseResourceBudget(limits.logger),
				'operation response graph'
			)
		)
	)
		throw new Error('eXact batch invocation returned malformed results');
	const record = value as Record<string, unknown>;
	if (record.type !== 'invoke' && record.type !== 'refresh')
		throw new Error('eXact batch invocation returned malformed results');
	if (typeof record.id !== 'string' || !record.id)
		throw new Error('eXact batch invocation returned malformed results');
	if (record.opId !== undefined && typeof record.opId !== 'string')
		throw new Error('eXact batch invocation returned malformed results');
	if (expected && !matchesOperation(record, expected))
		throw new Error('eXact batch invocation returned malformed results');
	if (record.ok === true) {
		const result = parseDecodedInvocationResponse(
			record,
			'eXact batch invocation returned malformed results',
			expected,
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
