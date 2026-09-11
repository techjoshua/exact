import {
	exactResponseBodyOf,
	handleExactFetchRequest,
	type ExactResponseLike,
	type ExactServerContext
} from '@exactjs/server';

/** Converts buffered text and produced streams through Bun's native Fetch response body lanes. */
export function exactResponseToBunResponse(result: ExactResponseLike): Response {
	const body = exactResponseBodyOf(result);
	return new Response(
		body
			? body.kind === 'produced'
				? body.toReadableStream()
				: body.toText()
			: (result.stream ?? result.body ?? ''),
		{
			status: result.status,
			headers: result.headers
		}
	);
}

/** Creates a Bun.serve-compatible fetch handler for an eXact endpoint. */
export function createExactBunHandler(
	context: ExactServerContext
): (request: Request) => Promise<Response> {
	return async (request) => {
		const result = await handleExactFetchRequest(request, context);
		return exactResponseToBunResponse(result);
	};
}

export { createExactBunHandler as createBunHandler };
