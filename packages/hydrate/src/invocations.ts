import { logFrameworkEvent } from "@exact/core";
import { parseExactBatchResponse, parseExactInvocationResponse, readExactStreamResponse } from "./responses.js";
import type {
  ExactInvocationResult,
  ExactOperationResult,
  InvokeExactBatchOptions,
  InvokeExactOptions
} from "./types.js";

/** Invokes a single eXact server action or boundary refresh endpoint operation. */
export async function invokeExact(options: InvokeExactOptions): Promise<ExactInvocationResult> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new Error("eXact endpoint invocation requires fetch");

  const response = await withAbort(fetchImpl(options.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.stream ? { accept: "application/x-ndjson", "x-exact-stream": "1" } : {}),
      ...options.headers
    },
    signal: options.signal,
    body: JSON.stringify({
      type: options.type,
      id: options.id,
      payload: options.payload,
      state: options.state,
      context: options.context,
      boundaryHtml: options.boundaryHtml,
      boundaryHtmls: options.boundaryHtmls
    })
  }), options.signal);

  if (!response.ok) {
    logFrameworkEvent("warn", "hydrate", "request", `exact ${options.type} invocation failed with ${response.status}`, undefined, options.logger);
    throw new Error(`eXact ${options.type} invocation failed`);
  }
  if (options.stream) {
    const results = await readExactStreamResponse(response, 1, options.signal);
    const result = results[0];
    if (!result?.ok) throw new Error(`eXact ${options.type} invocation failed`);
    const { ok: _ok, type: _type, id: _id, ...body } = result;
    return body;
  }
  const body = await withAbort(response.json(), options.signal);
  return parseExactInvocationResponse(body, `eXact ${options.type} invocation returned malformed result`);
}

/** Invokes multiple eXact operations as one batch request and returns per-operation results. */
export async function invokeExactBatch(options: InvokeExactBatchOptions): Promise<ExactOperationResult[]> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new Error("eXact endpoint invocation requires fetch");

  const response = await withAbort(fetchImpl(options.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.stream ? { accept: "application/x-ndjson", "x-exact-stream": "1" } : {}),
      ...options.headers
    },
    signal: options.signal,
    body: JSON.stringify({
      type: "batch",
      version: 1,
      operations: options.operations
    })
  }), options.signal);

  if (!response.ok) {
    logFrameworkEvent("warn", "hydrate", "request", `exact batch invocation failed with ${response.status}`, undefined, options.logger);
    throw new Error("eXact batch invocation failed");
  }
  if (options.stream) return readExactStreamResponse(response, options.operations.length, options.signal);
  const body = await withAbort(response.json(), options.signal);
  return parseExactBatchResponse(body);
}

function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException("eXact request aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException("eXact request aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
