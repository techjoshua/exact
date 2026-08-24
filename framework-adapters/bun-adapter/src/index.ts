import {
	exactResponseBodyOf,
	handleExactRequest,
	type ExactResponseLike,
	type ExactServerContext
} from '@exactjs/server';

/** Converts an eXact response through Bun's native Blob-backed response body lane. */
export function exactResponseToBunResponse(result: ExactResponseLike): Response {
	const body = exactResponseBodyOf(result);
	return new Response(body ? body.toBlob() : (result.stream ?? result.body ?? ''), {
		status: result.status,
		headers: result.headers
	});
}

/** Creates a Bun.serve-compatible fetch handler for an eXact endpoint. */
export function createExactBunHandler(
	context: ExactServerContext
): (request: Request) => Promise<Response> {
	return async (request) => {
		const result = await handleExactRequest(
			{
				method: request.method,
				url: request.url,
				headers: request.headers,
				bodyStream: request.body,
				signal: request.signal,
				platformRequest: request
			},
			context
		);
		return exactResponseToBunResponse(result);
	};
}

export { createExactBunHandler as createBunHandler };
