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
  write?(chunk: Uint8Array): boolean | void;
  end?(): void;
  send(body: unknown): void;
  destroy?(error: unknown): void;
  once?(event: "close" | "drain", listener: () => void): unknown;
  off?(event: "close" | "drain", listener: () => void): unknown;
  removeListener?(event: "close" | "drain", listener: () => void): unknown;
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
        void pipeReadableStream(result.stream, response, disconnect.signal).finally(disconnect.cleanup);
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
  response: ExactExpressResponse,
  signal?: AbortSignal
): Promise<void> {
  const reader = stream.getReader();
  try {
    while (true) {
      throwIfAborted(signal);
      const next = await reader.read();
      if (next.done) break;
      throwIfAborted(signal);
      if (response.write!(next.value) === false) await waitForDrain(response, signal);
    }
    throwIfAborted(signal);
    response.end!();
  } catch (error) {
    try { await reader.cancel(error); } catch { /* preserve the transport error */ }
    response.destroy?.(error);
  } finally {
    reader.releaseLock();
  }
}

function waitForDrain(response: ExactExpressResponse, signal?: AbortSignal): Promise<void> {
  if (!response.once) return Promise.reject(new Error("Express response returned backpressure without drain event support"));
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      if (response.off) response.off("drain", drain);
      else response.removeListener?.("drain", drain);
      signal?.removeEventListener("abort", abort);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const drain = () => finish(resolve);
    const abort = () => finish(() => reject(signal?.reason ?? new DOMException("Client disconnected", "AbortError")));
    if (signal?.aborted) { abort(); return; }
    response.once!("drain", drain);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Client disconnected", "AbortError");
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
