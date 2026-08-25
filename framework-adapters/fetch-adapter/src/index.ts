import { createFetchHandler } from '@exactjs/server';
import type { ExactServerContext } from '@exactjs/server';

/** Creates a Fetch API compatible eXact endpoint handler. */
export function createExactFetchHandler(
	context: ExactServerContext
): (request: Request) => Promise<Response> {
	return createFetchHandler(context);
}

export { createExactFetchHandler as createFetchHandler };
