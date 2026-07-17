import type { ExactInvocationRequest, ExactInvocationResult, ExactOperationResult, ExactPatch, ExactStreamEvent } from "@exact/server";
import { decodeReactiveProtocolValue } from "@exact/core";
import { hasOnlyKeys, isJsonSafe } from "./validation.js";

type ResponseLimits = { maxBytes?: number; maxJsonDepth?: number; maxJsonNodes?: number; maxPatches?: number };

/** Parses and validates a non-batched eXact endpoint response body. */
export function parseExactInvocationResponse(body: unknown, message: string, expected?: ExactInvocationRequest, limits: ResponseLimits = {}): ExactInvocationResult {
  try { body = decodeReactiveProtocolValue(body); } catch { throw new Error(message); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(message);
  if (!isJsonSafe(body, { maxDepth: limits.maxJsonDepth, maxNodes: limits.maxJsonNodes, maxBytes: limits.maxBytes })) throw new Error(message);
  const record = body as Record<string, unknown>;
  if (record.ok !== true) throw new Error(message);
  if (!hasOnlyKeys(record, ["ok", "type", "id", "opId", "patches", "state", "html"])) throw new Error(message);
  if (expected && !matchesOperation(record, expected)) throw new Error(message);
  if ("state" in record && record.state === undefined) throw new Error(message);
  if (record.patches !== undefined && (!Array.isArray(record.patches) || !record.patches.every(isPatchLike))) throw new Error(message);
  if (Array.isArray(record.patches) && record.patches.length > positiveLimit(limits.maxPatches, 10_000)) throw new Error(message);
  if (record.html !== undefined && typeof record.html !== "string") throw new Error(message);
  return {
    ...(record.patches === undefined ? {} : { patches: record.patches as ExactPatch[] }),
    ...("state" in record ? { state: record.state } : {}),
    ...(record.html === undefined ? {} : { html: record.html })
  };
}

/** Parses and validates a batched eXact endpoint response body. */
export function parseExactBatchResponse(body: unknown, expected?: readonly ExactInvocationRequest[], limits: ResponseLimits = {}): ExactOperationResult[] {
  const message = "eXact batch invocation returned malformed results";
  try { body = decodeReactiveProtocolValue(body); } catch { throw new Error(message); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(message);
  if (!isJsonSafe(body, { maxDepth: limits.maxJsonDepth, maxNodes: limits.maxJsonNodes, maxBytes: limits.maxBytes })) throw new Error(message);
  const record = body as Record<string, unknown>;
  if (record.ok !== true) throw new Error(message);
  if (!hasOnlyKeys(record, ["ok", "version", "results"])) throw new Error(message);
  if (record.version !== 1) throw new Error(message);
  if (!Array.isArray(record.results)) throw new Error(message);
  if (expected && record.results.length !== expected.length) throw new Error(message);
  return record.results.map((result, index) => parseExactOperationResult(result, expected?.[index], limits));
}

/** Reads and validates streamed NDJSON eXact operation events. */
export async function readExactStreamResponse(
  response: { body?: ReadableStream<Uint8Array> | null },
  expected: number | readonly ExactInvocationRequest[],
  options: ({ signal?: AbortSignal; maxEvents?: number } & ResponseLimits) | AbortSignal = {}
): Promise<ExactOperationResult[]> {
  const message = "eXact stream invocation returned malformed events";
  if (!response.body) throw new Error(message);
  const expectedOperations = typeof expected === "number" ? expected : expected.length;
  const expectedList = typeof expected === "number" ? undefined : expected;
  const normalized = isAbortSignal(options) ? { signal: options } : options;
  const results: ExactOperationResult[] = new Array(expectedOperations);
  const chunks: ExactInvocationResult[] = new Array(expectedOperations).fill(undefined).map(() => ({}));
  const stateReceived = new Array<boolean>(expectedOperations).fill(false);
  const htmlReceived = new Array<boolean>(expectedOperations).fill(false);
  const maxPatches = positiveLimit(normalized.maxPatches, 10_000);
  let started = false;
  let completed = false;
  await readNdjsonEvents(response.body, message, event => {
    if (!isJsonSafe(event, { maxDepth: normalized.maxJsonDepth, maxNodes: normalized.maxJsonNodes, maxBytes: normalized.maxBytes })) throw new Error(message);
    if (completed) throw new Error(message);
    if (!started) {
      if (!isExactStreamStartEvent(event) || event.operations !== expectedOperations) throw new Error(message);
      started = true;
      return;
    }
    if (isExactStreamCompleteEvent(event)) {
      completed = true;
      return;
    }
    if (isExactStreamPatchEvent(event)) {
      assertStreamIndex(event.index, expectedOperations, message);
      assertStreamOperation(event.index, event, expectedList, message);
      if (results[event.index]) throw new Error(message);
      const target = chunks[event.index]!;
      if ((target.patches?.length ?? 0) >= maxPatches) throw new Error(message);
      target.patches = [...(target.patches ?? []), event.patch];
      return;
    }
    if (isExactStreamStateEvent(event)) {
      assertStreamIndex(event.index, expectedOperations, message);
      assertStreamOperation(event.index, event, expectedList, message);
      if (results[event.index] || stateReceived[event.index]) throw new Error(message);
      stateReceived[event.index] = true;
      chunks[event.index]!.state = event.value;
      return;
    }
    if (isExactStreamHtmlEvent(event)) {
      assertStreamIndex(event.index, expectedOperations, message);
      assertStreamOperation(event.index, event, expectedList, message);
      if (results[event.index] || htmlReceived[event.index]) throw new Error(message);
      htmlReceived[event.index] = true;
      chunks[event.index]!.html = event.html;
      return;
    }
    if (isExactStreamResultEvent(event)) {
      assertStreamIndex(event.index, expectedOperations, message);
      if (results[event.index]) throw new Error(message);
      const result = parseExactOperationResult(event.result, expectedList?.[event.index], normalized);
      if (result.ok && (result.patches?.length ?? 0) + (chunks[event.index]!.patches?.length ?? 0) > maxPatches) throw new Error(message);
      if (result.ok && (("state" in result && stateReceived[event.index]) || (result.html !== undefined && htmlReceived[event.index]))) throw new Error(message);
      results[event.index] = result.ok ? { ...result, ...chunks[event.index] } : result;
      return;
    }
    throw new Error(message);
  }, normalized);
  if (!started || !completed) throw new Error(message);
  for (let index = 0; index < expectedOperations; index++) {
    if (!results[index]) throw new Error(message);
  }
  return results;
}

function assertStreamOperation(
  index: number,
  actual: { type: unknown; id: unknown; opId?: string },
  expected: readonly ExactInvocationRequest[] | undefined,
  message: string
): void {
  if (expected && !matchesOperation(actual as Record<string, unknown>, expected[index]!)) throw new Error(message);
}

function matchesOperation(record: Record<string, unknown>, expected: ExactInvocationRequest): boolean {
  return record.type === expected.type && record.id === expected.id && record.opId === expected.opId;
}

function assertStreamIndex(index: number, expectedOperations: number, message: string): void {
  if (!Number.isInteger(index) || index < 0 || index >= expectedOperations) throw new Error(message);
}

async function readNdjsonEvents(
  stream: ReadableStream<Uint8Array>,
  message: string,
  receive: (event: unknown) => void,
  options: { signal?: AbortSignal; maxEvents?: number } & ResponseLimits
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const signal = options.signal;
  const maxBytes = positiveLimit(options.maxBytes, 16 * 1024 * 1024);
  const maxEvents = positiveLimit(options.maxEvents, 100_000);
  let buffer = "";
  let bytes = 0;
  let events = 0;
  const abort = () => { void reader.cancel(signal?.reason); };
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      if (signal?.aborted) throw signal.reason ?? new DOMException("eXact request aborted", "AbortError");
      const next = await reader.read();
      if (signal?.aborted) throw signal.reason ?? new DOMException("eXact request aborted", "AbortError");
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maxBytes) throw new Error("eXact stream response exceeded maxBytes");
      buffer += decoder.decode(next.value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        if (++events > maxEvents) throw new Error("eXact stream response exceeded maxEvents");
        receive(parseNdjsonLine(line, message));
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      if (++events > maxEvents) throw new Error("eXact stream response exceeded maxEvents");
      receive(parseNdjsonLine(buffer.replace(/\r$/, ""), message));
    }
  } catch (error) {
    const failure = error instanceof TypeError ? new Error(message) : error;
    try { await reader.cancel(failure); } catch { /* preserve the primary failure */ }
    throw failure;
  } finally {
    signal?.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

function parseNdjsonLine(line: string, message: string): unknown {
  try { return decodeReactiveProtocolValue(JSON.parse(line)); }
  catch { throw new Error(message); }
}

function positiveLimit(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return !!value && typeof value === "object" && "aborted" in value && typeof (value as AbortSignal).addEventListener === "function";
}

function isExactStreamStartEvent(value: unknown): value is Extract<ExactStreamEvent, { event: "start" }> {
  if (!value || typeof value !== "object" || Array.isArray(value) || !isJsonSafe(value)) return false;
  const record = value as Record<string, unknown>;
  return hasOnlyKeys(record, ["event", "version", "operations"])
    && record.event === "start"
    && record.version === 1
    && typeof record.operations === "number"
    && Number.isInteger(record.operations)
    && record.operations >= 0;
}

function isExactStreamResultEvent(value: unknown): value is Extract<ExactStreamEvent, { event: "result" }> {
  if (!value || typeof value !== "object" || Array.isArray(value) || !isJsonSafe(value)) return false;
  const record = value as Record<string, unknown>;
  return hasOnlyKeys(record, ["event", "version", "index", "result"])
    && record.event === "result"
    && record.version === 1
    && typeof record.index === "number"
    && Number.isInteger(record.index);
}

function isExactStreamPatchEvent(value: unknown): value is Extract<ExactStreamEvent, { event: "patch" }> {
  if (!value || typeof value !== "object" || Array.isArray(value) || !isJsonSafe(value)) return false;
  const record = value as Record<string, unknown>;
  return hasOnlyKeys(record, ["event", "version", "index", "type", "id", "opId", "patch"])
    && record.event === "patch"
    && record.version === 1
    && typeof record.index === "number"
    && (record.type === "action" || record.type === "refresh")
    && typeof record.id === "string" && !!record.id
    && (record.opId === undefined || typeof record.opId === "string")
    && isPatchLike(record.patch);
}

function isExactStreamStateEvent(value: unknown): value is Extract<ExactStreamEvent, { event: "state" }> {
  if (!value || typeof value !== "object" || Array.isArray(value) || !isJsonSafe(value)) return false;
  const record = value as Record<string, unknown>;
  return hasOnlyKeys(record, ["event", "version", "index", "type", "id", "opId", "value"])
    && record.event === "state"
    && record.version === 1
    && typeof record.index === "number"
    && (record.type === "action" || record.type === "refresh")
    && typeof record.id === "string" && !!record.id
    && (record.opId === undefined || typeof record.opId === "string")
    && "value" in record
    && record.value !== undefined;
}

function isExactStreamHtmlEvent(value: unknown): value is Extract<ExactStreamEvent, { event: "html" }> {
  if (!value || typeof value !== "object" || Array.isArray(value) || !isJsonSafe(value)) return false;
  const record = value as Record<string, unknown>;
  return hasOnlyKeys(record, ["event", "version", "index", "type", "id", "opId", "html"])
    && record.event === "html"
    && record.version === 1
    && typeof record.index === "number"
    && (record.type === "action" || record.type === "refresh")
    && typeof record.id === "string" && !!record.id
    && (record.opId === undefined || typeof record.opId === "string")
    && typeof record.html === "string";
}

function isExactStreamCompleteEvent(value: unknown): value is Extract<ExactStreamEvent, { event: "complete" }> {
  if (!value || typeof value !== "object" || Array.isArray(value) || !isJsonSafe(value)) return false;
  const record = value as Record<string, unknown>;
  return hasOnlyKeys(record, ["event", "version"])
    && record.event === "complete"
    && record.version === 1;
}

function parseExactOperationResult(value: unknown, expected?: ExactInvocationRequest, limits: ResponseLimits = {}): ExactOperationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("eXact batch invocation returned malformed results");
  if (!isJsonSafe(value, { maxDepth: limits.maxJsonDepth, maxNodes: limits.maxJsonNodes, maxBytes: limits.maxBytes })) throw new Error("eXact batch invocation returned malformed results");
  const record = value as Record<string, unknown>;
  if (record.ok === true) {
    if (!hasOnlyKeys(record, ["ok", "type", "id", "opId", "patches", "state", "html"])) throw new Error("eXact batch invocation returned malformed results");
    if (record.type !== "action" && record.type !== "refresh") throw new Error("eXact batch invocation returned malformed results");
    if (typeof record.id !== "string" || !record.id) throw new Error("eXact batch invocation returned malformed results");
    if (record.opId !== undefined && typeof record.opId !== "string") throw new Error("eXact batch invocation returned malformed results");
    if (expected && !matchesOperation(record, expected)) throw new Error("eXact batch invocation returned malformed results");
    const result = parseExactInvocationResponse({
      ok: true,
      ...(record.patches === undefined ? {} : { patches: record.patches }),
      ...("state" in record ? { state: record.state } : {}),
      ...(record.html === undefined ? {} : { html: record.html })
    }, "eXact batch invocation returned malformed results", undefined, limits);
    return {
      ok: true,
      type: record.type,
      id: record.id,
      ...(record.opId === undefined ? {} : { opId: record.opId }),
      ...result
    };
  }
  if (record.ok === false) {
    if (!hasOnlyKeys(record, ["ok", "type", "id", "opId", "status", "error"])) throw new Error("eXact batch invocation returned malformed results");
    if (record.type !== "action" && record.type !== "refresh") throw new Error("eXact batch invocation returned malformed results");
    if (typeof record.id !== "string" || !record.id) throw new Error("eXact batch invocation returned malformed results");
    if (record.opId !== undefined && typeof record.opId !== "string") throw new Error("eXact batch invocation returned malformed results");
    if (expected && !matchesOperation(record, expected)) throw new Error("eXact batch invocation returned malformed results");
    if (typeof record.status !== "number" || !Number.isInteger(record.status)) throw new Error("eXact batch invocation returned malformed results");
    if (record.error !== "bad_request" && record.error !== "not_found" && record.error !== "forbidden" && record.error !== "internal_error" && record.error !== "dependency_failed") {
      throw new Error("eXact batch invocation returned malformed results");
    }
    return {
      ok: false,
      type: record.type,
      id: record.id,
      ...(record.opId === undefined ? {} : { opId: record.opId }),
      status: record.status,
      error: record.error
    };
  }
  throw new Error("eXact batch invocation returned malformed results");
}

function isPatchLike(value: unknown): value is ExactPatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (!isJsonSafe(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.type !== "string" || typeof record.id !== "string" || !record.id) return false;
  switch (record.type) {
    case "text":
      return hasOnlyKeys(record, ["type", "id", "value"]) && typeof record.value === "string";
    case "prop":
      return hasOnlyKeys(record, ["type", "id", "name", "value"])
        && typeof record.name === "string"
        && "value" in record
        && record.value !== undefined;
    case "style":
      return hasOnlyKeys(record, ["type", "id", "name", "value"]) && typeof record.name === "string" && (typeof record.value === "string" || record.value === null);
    case "list":
      return hasOnlyKeys(record, ["type", "id", "op", "key", "before", "html"])
        && (record.op === "insert" || record.op === "move" || record.op === "remove")
        && typeof record.key === "string"
        && (record.before === undefined || typeof record.before === "string")
        && (record.html === undefined || typeof record.html === "string");
    case "state":
      return hasOnlyKeys(record, ["type", "id", "value"]) && "value" in record && record.value !== undefined;
    case "replace":
      return hasOnlyKeys(record, ["type", "id", "html"]) && typeof record.html === "string";
    default:
      return false;
  }
}
