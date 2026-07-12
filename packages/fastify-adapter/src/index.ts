import { handleExactRequest, type ExactServerContext } from "@exact/server";

export type ExactFastifyRequest = {
  method: string;
  url: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

export type ExactFastifyReply = {
  code(status: number): ExactFastifyReply;
  header(name: string, value: string): ExactFastifyReply;
  send(body: unknown): unknown;
};

/** Creates a Fastify route handler for an eXact endpoint. */
export function createExactFastifyHandler(context: ExactServerContext): (request: ExactFastifyRequest, reply: ExactFastifyReply) => Promise<unknown> {
  return async (request, reply) => {
    const result = await handleExactRequest({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: request.body
    }, context);
    reply.code(result.status);
    for (const [name, value] of Object.entries(result.headers)) reply.header(name, value);
    return reply.send(result.stream ?? result.body ?? "");
  };
}

export { createExactFastifyHandler as createFastifyHandler };
