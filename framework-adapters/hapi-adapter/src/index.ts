import { handleExactRequest, type ExactServerContext } from "@exact/server";

export type ExactHapiRequest = {
  method: string;
  url?: { href?: string; path?: string };
  headers?: Record<string, string | string[] | undefined>;
  payload?: unknown;
};

export type ExactHapiToolkit = {
  response(body: unknown): {
    code(status: number): ExactHapiResponse;
  };
};

export type ExactHapiResponse = {
  header(name: string, value: string): ExactHapiResponse;
};

/** Creates a Hapi route handler for an eXact endpoint. */
export function createExactHapiHandler(context: ExactServerContext): (request: ExactHapiRequest, h: ExactHapiToolkit) => Promise<ExactHapiResponse> {
  return async (request, h) => {
    const result = await handleExactRequest({
      method: request.method,
      url: request.url?.href ?? request.url?.path,
      headers: request.headers,
      body: request.payload,
      platformRequest: request
    }, context);
    const response = h.response(result.stream ?? result.body ?? "").code(result.status);
    for (const [name, value] of Object.entries(result.headers)) response.header(name, value);
    return response;
  };
}

export { createExactHapiHandler as createHapiHandler };
