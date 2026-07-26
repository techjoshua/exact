import {
	createExpressHandler as createServerExpressHandler,
	type ExactExpressNext,
	type ExactExpressRequest,
	type ExactExpressResponse,
	type ExactServerContext
} from '@exactjs/server';

export type { ExactExpressNext, ExactExpressRequest, ExactExpressResponse };

/** Creates an Express middleware backed by the canonical eXact transport adapter. */
export function createExactExpressMiddleware(
	context: ExactServerContext
): (request: ExactExpressRequest, response: ExactExpressResponse, next?: ExactExpressNext) => void {
	return createServerExpressHandler(context);
}

export { createExactExpressMiddleware as createExpressHandler };
