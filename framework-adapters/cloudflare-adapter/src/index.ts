import {
	exactResponseToFetchResponse,
	handleExactFetchRequest,
	type ExactServerContext
} from '@exactjs/server';

/** Defines the exact cloudflare handler type contract. */
export type ExactCloudflareHandler<Env = unknown, CfContext = unknown> = (
	request: Request,
	env: Env,
	ctx: CfContext
) => Promise<Response>;

/** Creates a Cloudflare Workers fetch handler for an eXact endpoint. */
export function createExactCloudflareHandler<Env = unknown, CfContext = unknown>(
	context: ExactServerContext
): ExactCloudflareHandler<Env, CfContext> {
	return async (request, env, ctx) => {
		return exactResponseToFetchResponse(
			await handleExactFetchRequest(request, context, { request, env, context: ctx })
		);
	};
}

export { createExactCloudflareHandler as createCloudflareHandler };
