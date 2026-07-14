import type {
  ExactBatchRequest,
  ExactInvocationRequest,
  ExactOperationError,
  ExactOperationResult,
  ExactRequestLike,
  ExactResponseLike,
  ExactServerContext,
  ExactStreamEvent
} from "./types.js";

export type ExactOperationDispatcher = (
  request: ExactRequestLike,
  operation: ExactInvocationRequest,
  context: ExactServerContext
) => Promise<ExactOperationResult>;

/** Creates an NDJSON response for a single or batched eXact operation request. */
export function streamExactResponse(
  request: ExactRequestLike,
  input: ExactInvocationRequest | ExactBatchRequest,
  context: ExactServerContext,
  dispatch: ExactOperationDispatcher
): ExactResponseLike {
  const operations = input.type === "batch" ? input.operations : [input];
  const operationAbort = new AbortController();
  const linked = linkAbortSignals(request.signal, operationAbort.signal);
  const streamRequest = { ...request, signal: linked.signal };
  const stream = createNdjsonStream(async emit => {
    emit({ event: "start", version: 1, operations: operations.length });
    if (input.type === "batch") {
      await dispatchExactBatchStreaming(streamRequest, input.operations, context, dispatch, (index, result) => {
        emitOperationStreamEvents(emit, index, result);
      });
    } else {
      const result = await dispatch(streamRequest, input, context);
      emitOperationStreamEvents(emit, 0, result);
    }
    emit({ event: "complete", version: 1 });
  }, linked.signal, reason => operationAbort.abort(reason), linked.dispose);
  return {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store"
    },
    body: "",
    stream
  };
}

/** Dispatches a batch and returns operation results in request order. */
export async function dispatchExactBatch(
  request: ExactRequestLike,
  operations: readonly ExactInvocationRequest[],
  context: ExactServerContext,
  dispatch: ExactOperationDispatcher
): Promise<ExactOperationResult[]> {
  const results: ExactOperationResult[] = new Array(operations.length);
  await dispatchReadyOperations(request, operations, context, dispatch, (index, result) => {
    results[index] = result;
  });
  return results;
}

/** Returns whether a request asks for eXact NDJSON streaming. */
export function wantsStreaming(request: ExactRequestLike): boolean {
  const accept = headerValue(request.headers, "accept");
  const stream = headerValue(request.headers, "x-exact-stream");
  return stream === "1" || Boolean(accept?.split(",").some(value => value.trim().toLowerCase().startsWith("application/x-ndjson")));
}

async function dispatchExactBatchStreaming(
  request: ExactRequestLike,
  operations: readonly ExactInvocationRequest[],
  context: ExactServerContext,
  dispatch: ExactOperationDispatcher,
  emitResult: (index: number, result: ExactOperationResult) => void
): Promise<void> {
  await dispatchReadyOperations(request, operations, context, dispatch, emitResult);
}

async function dispatchReadyOperations(
  request: ExactRequestLike,
  operations: readonly ExactInvocationRequest[],
  context: ExactServerContext,
  dispatch: ExactOperationDispatcher,
  emitResult: (index: number, result: ExactOperationResult) => void
): Promise<void> {
  const pending = new Set(operations.map((_operation, index) => index));
  const running = new Map<number, Promise<{ index: number; operation: ExactInvocationRequest; result: ExactOperationResult }>>();
  const successful = new Set<string>();

  while (pending.size) {
    for (const index of pending) {
      if (running.has(index)) continue;
      const dependsOn = operations[index]!.dependsOn ?? [];
      if (!dependsOn.every(id => successful.has(id))) continue;
      const operation = operations[index]!;
      running.set(index, dispatch(request, operation, context).then(result => ({ index, operation, result })));
    }

    if (!running.size) {
      // Remaining operations are dependency-blocked. Fail them explicitly instead
      // of leaving the client waiting for results that can no longer run.
      for (const index of pending) {
        emitResult(index, dependencyFailed(operations[index]!));
      }
      break;
    }

    const { index, operation, result } = await Promise.race(running.values());
    running.delete(index);
    pending.delete(index);
    if (result.ok && operation.opId) successful.add(operation.opId);
    emitResult(index, result);
  }
}

function emitOperationStreamEvents(
  emit: (event: ExactStreamEvent) => void,
  index: number,
  result: ExactOperationResult
): void {
  if (!result.ok) {
    emit({ event: "result", version: 1, index, result });
    return;
  }
  for (const patch of result.patches ?? []) {
    emit({ event: "patch", version: 1, index, ...(result.opId === undefined ? {} : { opId: result.opId }), patch });
  }
  if ("state" in result) {
    emit({ event: "state", version: 1, index, ...(result.opId === undefined ? {} : { opId: result.opId }), value: result.state });
  }
  if (result.html !== undefined) {
    emit({ event: "html", version: 1, index, ...(result.opId === undefined ? {} : { opId: result.opId }), html: result.html });
  }
  emit({
    event: "result",
    version: 1,
    index,
    result: {
      ok: true,
      type: result.type,
      id: result.id,
      ...(result.opId === undefined ? {} : { opId: result.opId })
    }
  });
}

function dependencyFailed(operation: ExactInvocationRequest): ExactOperationError {
  return {
    ok: false,
    type: operation.type,
    id: operation.id,
    opId: operation.opId,
    status: 424,
    error: "dependency_failed"
  };
}

function createNdjsonStream(
  run: (emit: (event: ExactStreamEvent) => void) => Promise<void> | void,
  signal?: AbortSignal,
  cancelRun?: (reason: unknown) => void,
  dispose?: () => void
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let active = true;
  let cleanup = () => { dispose?.(); };
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: ExactStreamEvent): void => {
        if (!active) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      const abort = () => {
        if (!active) return;
        active = false;
        cleanup();
        controller.error(signal?.reason ?? new DOMException("eXact stream aborted", "AbortError"));
      };
      cleanup = () => {
        signal?.removeEventListener("abort", abort);
        dispose?.();
      };
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener("abort", abort, { once: true });
      Promise.resolve(run(emit)).then(
        () => {
          if (!active) return;
          active = false;
          cleanup();
          controller.close();
        },
        error => {
          if (!active) return;
          active = false;
          cleanup();
          controller.error(error);
        }
      );
    },
    cancel(reason) {
      if (!active) return;
      active = false;
      cancelRun?.(reason);
      cleanup();
    }
  });
}

function linkAbortSignals(...signals: Array<AbortSignal | undefined>): { signal: AbortSignal; dispose(): void } {
  const controller = new AbortController();
  const active = signals.filter((signal): signal is AbortSignal => !!signal);
  const listeners = new Map<AbortSignal, () => void>();
  for (const signal of active) {
    const abort = () => controller.abort(signal.reason);
    if (signal.aborted) { abort(); break; }
    listeners.set(signal, abort);
    signal.addEventListener("abort", abort, { once: true });
  }
  return {
    signal: controller.signal,
    dispose() {
      for (const [signal, listener] of listeners) signal.removeEventListener("abort", listener);
      listeners.clear();
    }
  };
}

function headerValue(headers: ExactRequestLike["headers"], name: string): string | undefined {
  if (!headers) return undefined;
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== lower) continue;
    return Array.isArray(value) ? value.join(",") : value;
  }
  return undefined;
}
