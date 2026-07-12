import { handleExactRequest, type ExactServerContext } from "@exact/server";

export type ExactCloudflareHandler<Env = unknown, CfContext = unknown> = (request: Request, env: Env, ctx: CfContext) => Promise<Response>;

/** Creates a Cloudflare Workers fetch handler for an eXact endpoint. */
export function createExactCloudflareHandler<Env = unknown, CfContext = unknown>(context: ExactServerContext): ExactCloudflareHandler<Env, CfContext> {
  return async request => {
    const result = await handleExactRequest({
      method: request.method,
      url: request.url,
      headers: request.headers,
      text: () => request.text()
    }, context);
    return new Response(result.stream ?? result.body ?? "", {
      status: result.status,
      headers: result.headers
    });
  };
}

export { createExactCloudflareHandler as createCloudflareHandler };
