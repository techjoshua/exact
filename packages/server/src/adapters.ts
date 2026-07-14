import { handleExactRequest } from "./index.js";
import type { ExactServerContext } from "./types.js";

export type ExactExpressRequest = {
  method: string;
  originalUrl?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  text?(): Promise<string>;
  signal?: AbortSignal;
  once?(event: "aborted", listener: () => void): unknown;
  off?(event: "aborted", listener: () => void): unknown;
  removeListener?(event: "aborted", listener: () => void): unknown;
};

export type ExactExpressResponse = {
  status(code: number): ExactExpressResponse;
  setHeader(name: string, value: string): void;
  write?(chunk: Uint8Array): void;
  end?(): void;
  send(body: unknown): void;
  destroy?(error: unknown): void;
  once?(event: "close", listener: () => void): unknown;
  off?(event: "close", listener: () => void): unknown;
  removeListener?(event: "close", listener: () => void): unknown;
};

export type ExactHapiRequest = {
  method: string;
  url?: { href?: string; path?: string };
  headers?: Record<string, string | string[] | undefined>;
  payload?: unknown;
  signal?: AbortSignal;
  events?: {
    once(event: "disconnect", listener: () => void): unknown;
    off?(event: "disconnect", listener: () => void): unknown;
    removeListener?(event: "disconnect", listener: () => void): unknown;
  };
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
      text: () => request.text(),
      signal: request.signal
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
    const disconnect = abortOnEvents([
        [request, "aborted"],
        [response, "close"]
      ], request.signal);
    void handleExactRequest({
      method: request.method,
      url: request.originalUrl ?? request.url,
      headers: request.headers,
      body: request.body,
      text: readText ? () => readText.call(request) : undefined,
      signal: disconnect.signal
    }, context).then(result => {
      response.status(result.status);
      for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
      if (result.stream && response.write && response.end) {
        const write = response.write.bind(response);
        const end = response.end.bind(response);
        void pipeReadableStream(result.stream, write, end, error => response.destroy?.(error)).finally(disconnect.cleanup);
      } else {
        response.send(result.stream ?? result.body ?? "");
        disconnect.cleanup();
      }
    }, error => {
      disconnect.cleanup();
      response.destroy?.(error);
    });
  };
}

/** Creates a Hapi-style eXact endpoint handler. */
export function createHapiHandler<Response extends ExactHapiResponse = ExactHapiResponse>(
  context: ExactServerContext
): (request: ExactHapiRequest, h: ExactHapiToolkit<Response>) => Promise<Response> {
  return async (request, h) => {
    const disconnect = abortOnEvents(request.events ? [[request.events, "disconnect"]] : [], request.signal);
    let result: Awaited<ReturnType<typeof handleExactRequest>>;
    try {
      result = await handleExactRequest({
        method: request.method,
        url: request.url?.href ?? request.url?.path,
        headers: request.headers,
        body: request.payload,
        signal: disconnect.signal
      }, context);
    } catch (error) {
      disconnect.cleanup();
      throw error;
    }
    const body = result.stream ? withStreamCleanup(result.stream, disconnect.cleanup) : result.body ?? "";
    const response = h.response(body).code(result.status);
    for (const [name, value] of Object.entries(result.headers)) response.header(name, value);
    if (!result.stream) disconnect.cleanup();
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

type DisconnectSource = {
  once?(event: string, listener: () => void): unknown;
  off?(event: string, listener: () => void): unknown;
  removeListener?(event: string, listener: () => void): unknown;
};

function abortOnEvents(
  sources: readonly (readonly [DisconnectSource, string])[],
  upstream?: AbortSignal
): { signal: AbortSignal; cleanup(): void } {
  const controller = new AbortController();
  const abort = () => controller.abort(new DOMException("Client disconnected", "AbortError"));
  const abortUpstream = () => controller.abort(upstream?.reason);
  for (const [source, event] of sources) source.once?.(event, abort);
  if (upstream?.aborted) abortUpstream();
  else upstream?.addEventListener("abort", abortUpstream, { once: true });
  return {
    signal: controller.signal,
    cleanup() {
      for (const [source, event] of sources) {
        if (source.off) source.off(event, abort);
        else source.removeListener?.(event, abort);
      }
      upstream?.removeEventListener("abort", abortUpstream);
    }
  };
}

function withStreamCleanup(stream: ReadableStream<Uint8Array>, cleanup: () => void): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) { cleanup(); controller.close(); }
        else controller.enqueue(next.value);
      } catch (error) {
        cleanup();
        controller.error(error);
      }
    },
    async cancel(reason) {
      try { await reader.cancel(reason); }
      finally { cleanup(); }
    }
  });
}
