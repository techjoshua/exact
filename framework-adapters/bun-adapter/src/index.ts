import { exactResponseToBunResponse } from './response.js';
export { exactResponseToBunResponse } from './response.js';
import { handleExactFetchRequest, type ExactServerContext } from '@exactjs/server';
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
