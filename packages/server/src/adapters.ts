import { handleExactRequest } from "./index.js";
import type { ExactServerContext } from "./types.js";

/** Creates a Fetch API compatible eXact endpoint handler. */
export function createFetchHandler(context: ExactServerContext): (request: Request) => Promise<Response> {
  return async request => {
    const response = await handleExactRequest({
      method: request.method,
      url: request.url,
      headers: request.headers,
      json: () => request.json(),
      text: () => request.text()
    }, context);
    return new Response(response.stream ?? response.body ?? "", {
      status: response.status,
      headers: response.headers
    });
  };
}

/** Creates an Express-style eXact endpoint handler. */
export function createExpressHandler(context: ExactServerContext): (request: any, response: any) => void {
  return (request, response) => {
    void handleExactRequest({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: request.body,
      text: typeof request.text === "function" ? () => request.text() : undefined
    }, context).then(result => {
      response.status(result.status);
      for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
      if (result.stream) {
        void pipeReadableStream(result.stream, chunk => response.write(chunk), () => response.end(), error => response.destroy?.(error));
      } else {
        response.send(result.body ?? "");
      }
    });
  };
}

/** Creates a Hapi-style eXact endpoint handler. */
export function createHapiHandler(context: ExactServerContext): (request: any, h: any) => Promise<any> {
  return async (request, h) => {
    const result = await handleExactRequest({
      method: request.method,
      url: request.url?.href ?? request.url?.path,
      headers: request.headers,
      body: request.payload
    }, context);
    const response = h.response(result.stream ?? result.body ?? "").code(result.status);
    for (const [name, value] of Object.entries(result.headers)) response.header(name, value);
    return response;
  };
}

async function pipeReadableStream(
  stream: ReadableStream<Uint8Array>,
  write: (chunk: Uint8Array) => void,
  end: () => void,
  fail: (error: unknown) => void
): Promise<void> {
  const reader = stream.getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      write(next.value);
    }
    end();
  } catch (error) {
    fail(error);
  }
}
