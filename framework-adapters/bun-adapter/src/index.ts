import {
	exactResponseBodyOf,
	exactResponseHeaders,
	handleExactFetchRequest,
	type ExactResponseLike,
	type ExactServerContext
} from '@exactjs/server';
import {
	createBunRequestHandler,
	type BunRequestServer,
	type BunSchedulingOptions
} from './request-handler.js';

export {
	createBunRequestHandler,
	type BunRequestServer,
	type BunSchedulingOptions
} from './request-handler.js';

/** Converts buffered text and produced streams through Bun's native Fetch response body lanes. */
export function exactResponseToBunResponse(result: ExactResponseLike): Response {
	const body = exactResponseBodyOf(result);
	return new Response(
		[204, 205, 304].includes(result.status)
			? null
			: body
				? body.kind === 'produced'
					? body.toReadableStream()
					: body.toText()
				: (result.stream ?? result.body ?? ''),
		{
			status: result.status,
			headers: exactResponseHeaders(result)
		}
	);
}

/** Creates a Bun.serve-compatible fetch handler for an eXact endpoint. */
export function createExactBunHandler(
	context: ExactServerContext,
	options: BunSchedulingOptions = {}
): (request: Request, server?: BunRequestServer) => Promise<Response> {
	const handler = createBunRequestHandler(async (request) => {
		const result = await handleExactFetchRequest(request, context);
		return exactResponseToBunResponse(result);
	}, options);
	return (request, server) => Promise.resolve(handler(request, server));
}

export { createExactBunHandler as createBunHandler };
