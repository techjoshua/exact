import type {
  ExactBatchRequest,
  ExactInvocationRequest,
  ExactRequestLike,
  ExactResponseLike
} from "./types.js";

/** Reads a runtime-neutral request body from body/json/text adapters. */
export async function readBody(request: ExactRequestLike): Promise<unknown> {
  if (request.body !== undefined) return request.body;
  if (request.json) return request.json();
  if (request.text) return request.text();
  return undefined;
}

/** Parses and validates the top-level eXact request envelope. */
export function parseExactRequestBody(body: unknown): ExactInvocationRequest | ExactBatchRequest {
  const value = typeof body === "string" ? JSON.parse(body) : body;
  if (!value || typeof value !== "object") throw new Error("invalid invocation");
  const record = value as Record<string, unknown>;
  if (record.type === "batch") return parseBatch(record);
  return parseInvocationRecord(record);
}

/** Returns whether a parsed request contains only JSON-safe payload, state, and context values. */
export function requestPayloadSafe(input: ExactInvocationRequest | ExactBatchRequest): boolean {
  if (input.type === "batch") {
    return input.operations.every(operation => requestPayloadSafe(operation));
  }
  return isJsonSafe(input.payload) && isJsonSafe(input.state) && isJsonSafe(input.context);
}

/** Creates a no-store JSON response for the runtime-neutral handler. */
export function jsonResponse(status: number, body: unknown): ExactResponseLike {
  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

/** Returns whether an object contains only the explicitly allowed own enumerable keys. */
export function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(record).every(key => allowedSet.has(key));
}

/** Returns whether a value can be safely encoded as JSON without prototypes or cycles. */
export function isJsonSafe(value: unknown, seen = new Set<object>()): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return Number.isFinite(value as number) || typeof value !== "number";
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.every(item => isJsonSafe(item, seen));
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.values(value as Record<string, unknown>).every(item => isJsonSafe(item, seen));
}

function parseBatch(record: Record<string, unknown>): ExactBatchRequest {
  if (!hasOnlyKeys(record, ["type", "version", "operations"])) throw new Error("unknown batch field");
  if (record.version !== undefined && record.version !== 1) throw new Error("invalid batch version");
  if (!Array.isArray(record.operations)) throw new Error("invalid batch operations");
  const operations = record.operations.map(operation => {
    if (!operation || typeof operation !== "object" || Array.isArray(operation)) throw new Error("invalid batch operation");
    return parseInvocationRecord(operation as Record<string, unknown>);
  });
  const operationIds = new Set<string>();
  for (const operation of operations) {
    if (!operation.opId) continue;
    if (operationIds.has(operation.opId)) throw new Error("duplicate batch operation id");
    operationIds.add(operation.opId);
  }
  return {
    type: "batch",
    version: record.version === 1 ? 1 : undefined,
    operations
  };
}

function parseInvocationRecord(record: Record<string, unknown>): ExactInvocationRequest {
  if (!hasOnlyKeys(record, ["type", "id", "opId", "dependsOn", "payload", "state", "context", "boundaryHtml", "boundaryHtmls"])) throw new Error("unknown invocation field");
  if (record.type !== "action" && record.type !== "refresh") throw new Error("invalid invocation type");
  if (typeof record.id !== "string" || !record.id) throw new Error("invalid invocation id");
  if (record.opId !== undefined && (typeof record.opId !== "string" || !record.opId)) throw new Error("invalid operation id");
  if (record.dependsOn !== undefined && !isStringList(record.dependsOn)) throw new Error("invalid operation dependencies");
  if (record.context !== undefined && !isContextValueMap(record.context)) throw new Error("invalid context");
  if (record.boundaryHtml !== undefined && typeof record.boundaryHtml !== "string") throw new Error("invalid boundary html");
  if (record.boundaryHtmls !== undefined && !isBoundaryHtmlMap(record.boundaryHtmls)) throw new Error("invalid boundary htmls");
  return {
    type: record.type,
    id: record.id,
    ...(typeof record.opId === "string" ? { opId: record.opId } : {}),
    ...(Array.isArray(record.dependsOn) ? { dependsOn: record.dependsOn } : {}),
    ...(record.payload === undefined ? {} : { payload: record.payload }),
    ...(record.state === undefined ? {} : { state: record.state }),
    ...(record.context === undefined ? {} : { context: record.context }),
    ...(typeof record.boundaryHtml === "string" ? { boundaryHtml: record.boundaryHtml } : {}),
    ...(record.boundaryHtmls === undefined ? {} : { boundaryHtmls: record.boundaryHtmls })
  };
}

function isBoundaryHtmlMap(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).every(([id, html]) => !!id && typeof html === "string");
}

function isContextValueMap(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string" && item.length > 0);
}
