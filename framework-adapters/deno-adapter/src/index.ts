import { createFetchHandler, type ExactServerContext } from '@exactjs/server';

/** Creates a Deno.serve-compatible handler for an eXact endpoint. */
export function createExactDenoHandler(
	context: ExactServerContext
): (request: Request) => Promise<Response> {
	return createFetchHandler(context);
}

export { createExactDenoHandler as createDenoHandler };
