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

export function streamExactResponse(
  request: ExactRequestLike,
  input: ExactInvocationRequest | ExactBatchRequest,
  context: ExactServerContext,
  dispatch: ExactOperationDispatcher
): ExactResponseLike {
  const operations = input.type === "batch" ? input.operations : [input];
  const stream = createNdjsonStream(async emit => {
    emit({ event: "start", version: 1, operations: operations.length });
    if (input.type === "batch") {
      await dispatchExactBatchStreaming(request, input.operations, context, dispatch, (index, result) => {
        emitOperationStreamEvents(emit, index, result);
      });
    } else {
      const result = await dispatch(request, input, context);
      emitOperationStreamEvents(emit, 0, result);
    }
    emit({ event: "complete", version: 1 });
  });
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

function createNdjsonStream(run: (emit: (event: ExactStreamEvent) => void) => Promise<void> | void): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: ExactStreamEvent): void => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      Promise.resolve(run(emit)).then(
        () => controller.close(),
        error => {
          controller.error(error);
        }
      );
    }
  });
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
