import { handleExactRequest, type ExactServerContext } from "@exact/server";

/** Creates a Bun.serve-compatible fetch handler for an eXact endpoint. */
export function createExactBunHandler(context: ExactServerContext): (request: Request) => Promise<Response> {
  return async request => {
    const result = await handleExactRequest({
      method: request.method,
      url: request.url,
      headers: request.headers,
      text: () => request.text(),
      signal: request.signal,
      platformRequest: request
    }, context);
    return new Response(result.stream ?? result.body ?? "", {
      status: result.status,
      headers: result.headers
    });
  };
}

export { createExactBunHandler as createBunHandler };
