import { handleExactRequest, type ExactServerContext } from '@exact/server';

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
		const result = await handleExactRequest(
			{
				method: request.method,
				url: request.url,
				headers: request.headers,
				text: () => request.text(),
				signal: request.signal,
				platformRequest: { request, env, context: ctx }
			},
			context
		);
		return new Response(result.stream ?? result.body ?? '', {
			status: result.status,
			headers: result.headers
		});
	};
}

export { createExactCloudflareHandler as createCloudflareHandler };
