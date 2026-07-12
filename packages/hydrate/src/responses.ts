import type { ExactInvocationResult, ExactOperationResult, ExactPatch, ExactStreamEvent } from "@exact/server";
import { hasOnlyKeys, isJsonSafe } from "./validation.js";

export function parseExactInvocationResponse(body: unknown, message: string): ExactInvocationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(message);
  if (!isJsonSafe(body)) throw new Error(message);
  const record = body as Record<string, unknown>;
  if (record.ok !== true) throw new Error(message);
  if (!hasOnlyKeys(record, ["ok", "patches", "state", "html"])) throw new Error(message);
  if ("state" in record && record.state === undefined) throw new Error(message);
  if (record.patches !== undefined && (!Array.isArray(record.patches) || !record.patches.every(isPatchLike))) throw new Error(message);
  if (record.html !== undefined && typeof record.html !== "string") throw new Error(message);
  return {
    ...(record.patches === undefined ? {} : { patches: record.patches as ExactPatch[] }),
    ...("state" in record ? { state: record.state } : {}),
    ...(record.html === undefined ? {} : { html: record.html })
  };
}

export function parseExactBatchResponse(body: unknown): ExactOperationResult[] {
  const message = "eXact batch invocation returned malformed results";
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(message);
  if (!isJsonSafe(body)) throw new Error(message);
  const record = body as Record<string, unknown>;
  if (record.ok !== true) throw new Error(message);
  if (!hasOnlyKeys(record, ["ok", "version", "results"])) throw new Error(message);
  if (record.version !== 1) throw new Error(message);
  if (!Array.isArray(record.results)) throw new Error(message);
  return record.results.map(parseExactOperationResult);
}

export async function readExactStreamResponse(
  response: { body?: ReadableStream<Uint8Array> | null },
  expectedOperations: number
): Promise<ExactOperationResult[]> {
  const message = "eXact stream invocation returned malformed events";
  if (!response.body) throw new Error(message);
  const events = await readNdjsonEvents(response.body, message);
  if (!events.length) throw new Error(message);
  const start = events[0];
  const complete = events[events.length - 1];
  if (!isExactStreamStartEvent(start) || start.operations !== expectedOperations) throw new Error(message);
  if (!isExactStreamCompleteEvent(complete)) throw new Error(message);

  const results: ExactOperationResult[] = new Array(expectedOperations);
  const chunks: ExactInvocationResult[] = new Array(expectedOperations).fill(undefined).map(() => ({}));
  for (const event of events.slice(1, -1)) {
    if (isExactStreamPatchEvent(event)) {
      assertStreamIndex(event.index, expectedOperations, message);
      const target = chunks[event.index]!;
      target.patches = [...(target.patches ?? []), event.patch];
      continue;
    }
    if (isExactStreamStateEvent(event)) {
      assertStreamIndex(event.index, expectedOperations, message);
      chunks[event.index]!.state = event.value;
      continue;
    }
    if (isExactStreamHtmlEvent(event)) {
      assertStreamIndex(event.index, expectedOperations, message);
      chunks[event.index]!.html = event.html;
      continue;
    }
    if (isExactStreamResultEvent(event)) {
      assertStreamIndex(event.index, expectedOperations, message);
      if (results[event.index]) throw new Error(message);
      const result = parseExactOperationResult(event.result);
      results[event.index] = result.ok ? { ...result, ...chunks[event.index] } : result;
      continue;
    }
    throw new Error(message);
  }
  for (let index = 0; index < expectedOperations; index++) {
    if (!results[index]) throw new Error(message);
  }
  return results;
}

function assertStreamIndex(index: number, expectedOperations: number, message: string): void {
  if (!Number.isInteger(index) || index < 0 || index >= expectedOperations) throw new Error(message);
}

async function readNdjsonEvents(stream: ReadableStream<Uint8Array>, message: string): Promise<unknown[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    text += decoder.decode(next.value, { stream: true });
  }
  text += decoder.decode();
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  return lines.map(line => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error(message);
    }
  });
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
  return hasOnlyKeys(record, ["event", "version", "index", "opId", "patch"])
    && record.event === "patch"
    && record.version === 1
    && typeof record.index === "number"
    && (record.opId === undefined || typeof record.opId === "string")
    && isPatchLike(record.patch);
}

function isExactStreamStateEvent(value: unknown): value is Extract<ExactStreamEvent, { event: "state" }> {
  if (!value || typeof value !== "object" || Array.isArray(value) || !isJsonSafe(value)) return false;
  const record = value as Record<string, unknown>;
  return hasOnlyKeys(record, ["event", "version", "index", "opId", "value"])
    && record.event === "state"
    && record.version === 1
    && typeof record.index === "number"
    && (record.opId === undefined || typeof record.opId === "string")
    && "value" in record
    && record.value !== undefined;
}

function isExactStreamHtmlEvent(value: unknown): value is Extract<ExactStreamEvent, { event: "html" }> {
  if (!value || typeof value !== "object" || Array.isArray(value) || !isJsonSafe(value)) return false;
  const record = value as Record<string, unknown>;
  return hasOnlyKeys(record, ["event", "version", "index", "opId", "html"])
    && record.event === "html"
    && record.version === 1
    && typeof record.index === "number"
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

function parseExactOperationResult(value: unknown): ExactOperationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("eXact batch invocation returned malformed results");
  if (!isJsonSafe(value)) throw new Error("eXact batch invocation returned malformed results");
  const record = value as Record<string, unknown>;
  if (record.ok === true) {
    if (!hasOnlyKeys(record, ["ok", "type", "id", "opId", "patches", "state", "html"])) throw new Error("eXact batch invocation returned malformed results");
    if (record.type !== "action" && record.type !== "refresh") throw new Error("eXact batch invocation returned malformed results");
    if (typeof record.id !== "string" || !record.id) throw new Error("eXact batch invocation returned malformed results");
    if (record.opId !== undefined && typeof record.opId !== "string") throw new Error("eXact batch invocation returned malformed results");
    const result = parseExactInvocationResponse({
      ok: true,
      ...(record.patches === undefined ? {} : { patches: record.patches }),
      ...("state" in record ? { state: record.state } : {}),
      ...(record.html === undefined ? {} : { html: record.html })
    }, "eXact batch invocation returned malformed results");
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
