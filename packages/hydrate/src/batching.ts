import { logFrameworkEvent, type Logger } from "@exact/core";
import { headersCacheKey } from "./config.js";
import { invokeExact, invokeExactBatch } from "./invocations.js";
import type {
  ExactBatchQueue,
  ExactInvocationRequest,
  ExactInvocationResult,
  FetchLike
} from "./types.js";

const batchQueues = new WeakMap<Element, ExactBatchQueue[]>();

/** Queues an eXact operation for microtask batching by endpoint, transport, and headers. */
export function enqueueExactOperation(
  container: Element,
  options: {
    endpoint: string;
    operation: ExactInvocationRequest;
    fetch?: FetchLike;
    headers?: Record<string, string>;
    logger?: Logger;
    stream?: boolean;
  }
): Promise<ExactInvocationResult> {
  let queues = batchQueues.get(container);
  if (!queues) {
    queues = [];
    batchQueues.set(container, queues);
  }
  const headersKey = headersCacheKey(options.headers);
  let queue = queues.find(item => item.endpoint === options.endpoint && item.fetch === options.fetch && item.headersKey === headersKey && item.logger === options.logger && item.stream === options.stream);
  if (!queue) {
    queue = {
      endpoint: options.endpoint,
      fetch: options.fetch,
      headers: options.headers,
      headersKey,
      logger: options.logger,
      stream: options.stream,
      pending: [],
      scheduled: false
    };
    queues.push(queue);
  }

  const promise = new Promise<ExactInvocationResult>((resolve, reject) => {
    queue!.pending.push({
      operation: options.operation,
      resolve,
      reject
    });
  });

  if (!queue.scheduled) {
    queue.scheduled = true;
    // Microtask batching groups operations triggered by the same user turn without
    // introducing a visible delay for isolated single operations.
    queueMicrotask(() => {
      void flushExactBatchQueue(queue!);
    });
  }

  return promise;
}

async function flushExactBatchQueue(queue: ExactBatchQueue): Promise<void> {
  const pending = queue.pending.splice(0);
  queue.scheduled = false;
  if (!pending.length) return;

  if (pending.length === 1) {
    try {
      const result = await invokeExact({
        endpoint: queue.endpoint,
        ...pending[0]!.operation,
        fetch: queue.fetch,
        headers: queue.headers,
        logger: queue.logger,
        stream: queue.stream
      });
      pending[0]!.resolve(result);
    } catch (error) {
      pending[0]!.reject(error);
    }
    return;
  }

  try {
    const results = await invokeExactBatch({
      endpoint: queue.endpoint,
      operations: pending.map(item => item.operation),
      fetch: queue.fetch,
      headers: queue.headers,
      logger: queue.logger,
      stream: queue.stream
    });
    pending.forEach((item, index) => {
      const result = results[index];
      if (!result) {
        item.reject(new Error(`eXact ${item.operation.type} invocation failed`));
        return;
      }
      if (!result.ok) {
        logFrameworkEvent("warn", "hydrate", "request", `exact ${item.operation.type} invocation failed with ${result.status}`, undefined, queue.logger);
        item.reject(new Error(`eXact ${item.operation.type} invocation failed`));
        return;
      }
      const { ok: _ok, type: _type, id: _id, ...body } = result;
      item.resolve(body);
    });
  } catch (error) {
    for (const item of pending) item.reject(error);
  }
}
