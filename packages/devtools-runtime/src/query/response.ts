import type { ExactInspectionRequest, ExactInspectionResponse } from '@exactjs/devtools-protocol';

/** Builds a successful inspection response with optional pagination metadata. */
export function successfulInspectionResponse(
	request: ExactInspectionRequest,
	sessionId: string,
	result: unknown,
	nextCursor?: string
): ExactInspectionResponse {
	return Object.freeze({
		protocol: 1,
		id: request.id,
		ok: true,
		identity: Object.freeze({
			sessionId,
			...(request.params?.identity?.buildKey ? { buildKey: request.params.identity.buildKey } : {}),
			...(request.params?.identity?.executionRoot
				? { executionRoot: request.params.identity.executionRoot }
				: {}),
			...(request.params?.identity?.binding ? { binding: request.params.identity.binding } : {})
		}),
		result,
		...(nextCursor
			? { page: Object.freeze({ nextCursor, count: Array.isArray(result) ? result.length : 1 }) }
			: {})
	});
}

/** Builds a failed inspection response without leaking arbitrary error objects. */
export function failedInspectionResponse(
	id: string,
	error: 'bad-request' | 'not-found' | 'unavailable',
	reason: unknown
): ExactInspectionResponse {
	return Object.freeze({
		protocol: 1,
		id,
		ok: false,
		error,
		reason: reason instanceof Error ? reason.message : String(reason)
	});
}
