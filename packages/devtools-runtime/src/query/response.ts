import type { ExactInspectionRequest, ExactInspectionResponse } from '@exactjs/devtools-protocol';
import { describeFailureReason } from '@exactjs/core/framework/error-format';

/** Builds a successful inspection response with optional pagination metadata. */
export function successfulInspectionResponse(
	request: ExactInspectionRequest,
	sessionId: string,
	result: unknown,
	nextCursor?: string
): ExactInspectionResponse {
	return {
		protocol: 1,
		id: request.id,
		ok: true,
		identity: {
			sessionId,
			...(request.params?.identity?.buildKey ? { buildKey: request.params.identity.buildKey } : {}),
			...(request.params?.identity?.executionRoot
				? { executionRoot: request.params.identity.executionRoot }
				: {}),
			...(request.params?.identity?.binding ? { binding: request.params.identity.binding } : {})
		},
		result,
		...(nextCursor
			? { page: { nextCursor, count: Array.isArray(result) ? result.length : 1 } }
			: {})
	};
}

/** Builds a bounded failed response even when formatting the original rejection fails. */
export function failedInspectionResponse(
	id: string,
	error: 'bad-request' | 'not-found' | 'unavailable',
	reason: unknown
): ExactInspectionResponse {
	const fallback = 'Inspection query failed';
	let description = fallback;
	try {
		description =
			describeFailureReason(reason instanceof Error ? reason.message : reason, fallback) ||
			fallback;
	} catch {
		// A prototype trap or message getter is part of the original failed input.
	}
	return {
		protocol: 1,
		id,
		ok: false,
		error,
		reason: description.slice(0, 2048)
	};
}
