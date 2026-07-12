import { handleExactRequest } from "./index.js";
import type { ExactServerContext } from "./types.js";

export type ExactExpressRequest = {
  method: string;
  originalUrl?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  text?(): Promise<string>;
};

export type ExactExpressResponse = {
  status(code: number): ExactExpressResponse;
  setHeader(name: string, value: string): void;
  write?(chunk: Uint8Array): void;
  end?(): void;
  send(body: unknown): void;
  destroy?(error: unknown): void;
};

export type ExactHapiRequest = {
  method: string;
  url?: { href?: string; path?: string };
  headers?: Record<string, string | string[] | undefined>;
  payload?: unknown;
};

export type ExactHapiToolkit<Response extends ExactHapiResponse = ExactHapiResponse> = {
  response(body: unknown): {
    code(status: number): Response;
  };
};

export type ExactHapiResponse = {
  header(name: string, value: string): ExactHapiResponse;
};

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
export function createExpressHandler(context: ExactServerContext): (request: ExactExpressRequest, response: ExactExpressResponse) => void {
  return (request, response) => {
    const readText = request.text;
    void handleExactRequest({
      method: request.method,
      url: request.originalUrl ?? request.url,
      headers: request.headers,
      body: request.body,
      text: readText ? () => readText.call(request) : undefined
    }, context).then(result => {
      response.status(result.status);
      for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
      if (result.stream && response.write && response.end) {
        const write = response.write.bind(response);
        const end = response.end.bind(response);
        void pipeReadableStream(result.stream, write, end, error => response.destroy?.(error));
      } else {
        response.send(result.stream ?? result.body ?? "");
      }
    });
  };
}

/** Creates a Hapi-style eXact endpoint handler. */
export function createHapiHandler<Response extends ExactHapiResponse = ExactHapiResponse>(
  context: ExactServerContext
): (request: ExactHapiRequest, h: ExactHapiToolkit<Response>) => Promise<Response> {
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
