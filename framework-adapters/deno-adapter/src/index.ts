import { handleExactRequest, type ExactServerContext } from '@exactjs/server';

/** Creates a Deno.serve-compatible handler for an eXact endpoint. */
export function createExactDenoHandler(
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
		return new Response(result.stream ?? result.body ?? '', {
			status: result.status,
			headers: result.headers
		});
	};
}

export { createExactDenoHandler as createDenoHandler };
