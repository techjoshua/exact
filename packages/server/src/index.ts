import { logFrameworkEvent } from "@exact/core";
import type {
  ExactBatchRequest,
  ExactBatchResult,
  ExactContextEffect,
  ExactInvocationRequest,
  ExactInvocationResult,
  ExactOperationError,
  ExactOperationResult,
  ExactPatch,
  ExactRequestLike,
  ExactResponseLike,
  ExactServerContext,
  ExactServerManifest,
  ExactStateContract,
  ExactStreamEvent
} from "./types.js";
import {
  hasOnlyKeys,
  isJsonSafe,
  jsonResponse,
  parseExactRequestBody,
  readBody,
  requestPayloadSafe
} from "./protocol.js";

export { exactCompilerManifestVersion, exactServerManifestVersion } from "./versions.js";
export {
  createExactHydrationActionBoundaries,
  createExactHydrationManifestConfig,
  createExactHydrationStateContracts,
  createExactServerManifest
} from "./manifest.js";
export { createExpressHandler, createFetchHandler, createHapiHandler } from "./adapters.js";
export type * from "./types.js";

export async function handleExactRequest(request: ExactRequestLike, context: ExactServerContext): Promise<ExactResponseLike> {
  if (request.method.toUpperCase() !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  if (!matchesConfiguredEndpoint(request, context.manifest.endpoint)) {
    logReject(context, "rejected exact invocation for mismatched endpoint");
    return jsonResponse(404, { error: "not_found" });
  }

  let input: ExactInvocationRequest | ExactBatchRequest;
  try {
    input = parseExactRequestBody(await readBody(request));
  } catch {
    logReject(context, "rejected malformed exact invocation");
    return jsonResponse(400, { error: "bad_request" });
  }

  if (!requestPayloadSafe(input)) {
    logReject(context, "rejected non-serializable exact invocation payload");
    return jsonResponse(400, { error: "bad_request" });
  }

  const security = await checkSecurityHooks(request, input, context);
  if (security === "unauthorized") {
    logReject(context, "rejected unauthorized exact invocation");
    return jsonResponse(403, { error: "forbidden" });
  }

  if (security === "csrf") {
    logReject(context, "rejected exact invocation with invalid csrf");
    return jsonResponse(403, { error: "forbidden" });
  }

  if (wantsStreaming(request)) {
    return streamExactResponse(request, input, context);
  }

  if (input.type === "batch") {
    const results = await dispatchExactBatch(request, input.operations, context);
    return jsonResponse(200, { ok: true, version: 1, results } satisfies ExactBatchResult);
  }

  const result = await dispatchExactOperation(request, input, context);
  if (isOperationError(result)) return jsonResponse(result.status, { error: result.error });
  const { ok: _ok, type: _type, id: _id, ...body } = result;
  return jsonResponse(200, { ok: true, ...body });
}

function streamExactResponse(
  request: ExactRequestLike,
  input: ExactInvocationRequest | ExactBatchRequest,
  context: ExactServerContext
): ExactResponseLike {
  const operations = input.type === "batch" ? input.operations : [input];
  const stream = createNdjsonStream(async emit => {
    emit({ event: "start", version: 1, operations: operations.length });
    if (input.type === "batch") {
      await dispatchExactBatchStreaming(request, input.operations, context, (index, result) => {
        emitOperationStreamEvents(emit, index, result);
      });
    } else {
      const result = await dispatchExactOperation(request, input, context);
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

async function dispatchExactBatch(
  request: ExactRequestLike,
  operations: readonly ExactInvocationRequest[],
  context: ExactServerContext
): Promise<ExactOperationResult[]> {
  const results: ExactOperationResult[] = new Array(operations.length);
  const pending = new Set(operations.map((_operation, index) => index));
  const successful = new Set<string>();

  while (pending.size) {
    const ready = [...pending].filter(index => {
      const dependsOn = operations[index]!.dependsOn ?? [];
      return dependsOn.every(id => successful.has(id));
    });

    if (!ready.length) {
      for (const index of pending) {
        results[index] = dependencyFailed(operations[index]!);
      }
      break;
    }

    const settled = await Promise.all(ready.map(async index => {
      const operation = operations[index]!;
      return { index, operation, result: await dispatchExactOperation(request, operation, context) };
    }));

    for (const { index, operation, result } of settled) {
      results[index] = result;
      pending.delete(index);
      if (result.ok && operation.opId) successful.add(operation.opId);
    }
  }

  return results;
}

async function dispatchExactBatchStreaming(
  request: ExactRequestLike,
  operations: readonly ExactInvocationRequest[],
  context: ExactServerContext,
  emitResult: (index: number, result: ExactOperationResult) => void
): Promise<void> {
  const pending = new Set(operations.map((_operation, index) => index));
  const successful = new Set<string>();

  while (pending.size) {
    const ready = [...pending].filter(index => {
      const dependsOn = operations[index]!.dependsOn ?? [];
      return dependsOn.every(id => successful.has(id));
    });

    if (!ready.length) {
      for (const index of pending) {
        emitResult(index, dependencyFailed(operations[index]!));
      }
      break;
    }

    await Promise.all(ready.map(async index => {
      const operation = operations[index]!;
      const result = await dispatchExactOperation(request, operation, context);
      pending.delete(index);
      if (result.ok && operation.opId) successful.add(operation.opId);
      emitResult(index, result);
    }));
  }
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

function wantsStreaming(request: ExactRequestLike): boolean {
  const accept = headerValue(request.headers, "accept");
  const stream = headerValue(request.headers, "x-exact-stream");
  return stream === "1" || Boolean(accept?.split(",").some(value => value.trim().toLowerCase().startsWith("application/x-ndjson")));
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

function isManifestAllowed(input: ExactInvocationRequest, manifest: ExactServerManifest): boolean {
  if (input.type === "action") return Boolean(manifest.actions?.[input.id]);
  if (input.type === "refresh") return Boolean(manifest.boundaries?.[input.id]);
  return false;
}

function isOperationError(result: ExactOperationResult): result is ExactOperationError {
  return result.ok === false;
}

async function dispatchExactOperation(
  request: ExactRequestLike,
  input: ExactInvocationRequest,
  context: ExactServerContext
): Promise<ExactOperationResult> {
  const reject = (status: number, error: ExactOperationError["error"], message: string): ExactOperationResult => {
    logReject(context, message);
    return { ok: false, type: input.type, id: input.id, opId: input.opId, status, error };
  };

  if (!isManifestAllowed(input, context.manifest)) {
    return reject(404, "not_found", "rejected unknown exact invocation id");
  }

  if (!boundaryHintsAllowed(input, context.manifest)) {
    return reject(400, "bad_request", "rejected exact invocation with unknown boundary hints");
  }

  const action = input.type === "action" ? context.manifest.actions?.[input.id] : undefined;
  if (action?.stateContract && !stateMatchesContract(input.state, action.stateContract)) {
    return reject(400, "bad_request", "rejected exact invocation with mismatched state contract");
  }
  if (!contextMatchesContract(input.context, action?.contextContract)) {
    return reject(400, "bad_request", "rejected exact invocation with mismatched context contract");
  }

  const security = await checkSecurityHooks(request, input, context);
  if (security === "unauthorized") {
    return reject(403, "forbidden", "rejected unauthorized exact invocation");
  }

  if (security === "csrf") {
    return reject(403, "forbidden", "rejected exact invocation with invalid csrf");
  }

  const handler = input.type === "action"
    ? context.actions?.[input.id]
    : context.refreshBoundaries?.[input.id];

  if (!handler) {
    return reject(404, "not_found", "rejected exact invocation without registered handler");
  }

  try {
    const result = await handler(input, context);
    if (!isInvocationResultSafe(result)) {
      return reject(500, "internal_error", "rejected non-serializable exact invocation result");
    }
    return { ok: true, type: input.type, id: input.id, opId: input.opId, ...result };
  } catch (error) {
    logFrameworkEvent("error", "server", "request", "exact invocation failed", error, context.logger);
    return { ok: false, type: input.type, id: input.id, opId: input.opId, status: 500, error: "internal_error" };
  }
}

function matchesConfiguredEndpoint(request: ExactRequestLike, endpoint: string | undefined): boolean {
  if (!endpoint || !request.url) return true;
  try {
    const expected = new URL(endpoint, "http://exact.local");
    const actual = new URL(request.url, "http://exact.local");
    return actual.pathname === expected.pathname;
  } catch {
    return false;
  }
}

async function checkSecurityHooks(
  request: ExactRequestLike,
  input: ExactInvocationRequest | ExactBatchRequest,
  context: ExactServerContext
): Promise<"allowed" | "unauthorized" | "csrf"> {
  if (context.authorize) {
    try {
      if (!await context.authorize(request, input)) return "unauthorized";
    } catch (error) {
      logFrameworkEvent("error", "server", "security", "exact authorization hook failed", error, context.logger);
      return "unauthorized";
    }
  }
  if (context.validateCsrf) {
    try {
      if (!await context.validateCsrf(request, input)) return "csrf";
    } catch (error) {
      logFrameworkEvent("error", "server", "security", "exact csrf hook failed", error, context.logger);
      return "csrf";
    }
  }
  return "allowed";
}

function logReject(context: ExactServerContext, message: string): void {
  logFrameworkEvent("warn", "server", "security", message, undefined, context.logger);
}

function isInvocationResultSafe(result: unknown): result is ExactInvocationResult {
  if (!isJsonSafe(result)) return false;
  if (!result || typeof result !== "object" || Array.isArray(result)) return false;
  const record = result as Record<string, unknown>;
  if (!hasOnlyKeys(record, ["patches", "state", "html"])) return false;
  if ("state" in record && record.state === undefined) return false;
  if (record.patches !== undefined) {
    if (!Array.isArray(record.patches)) return false;
    if (!record.patches.every(isPatchSafe)) return false;
  }
  if (record.html !== undefined && typeof record.html !== "string") return false;
  return true;
}

function isPatchSafe(patch: unknown): patch is ExactPatch {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return false;
  const record = patch as Record<string, unknown>;
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
        && typeof record.key === "string"
        && (record.op === "insert" || record.op === "move" || record.op === "remove")
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

function boundaryHintsAllowed(input: ExactInvocationRequest, manifest: ExactServerManifest): boolean {
  if (!input.boundaryHtmls) return true;
  if (input.type === "action") {
    const allowed = manifest.actionBoundaries?.[input.id];
    if (allowed) {
      const allowedSet = new Set(allowed);
      return Object.keys(input.boundaryHtmls).every(id => allowedSet.has(id));
    }
  }
  for (const id of Object.keys(input.boundaryHtmls)) {
    if (!manifest.boundaries?.[id]) return false;
  }
  return true;
}

function stateMatchesContract(state: unknown, contract: ExactStateContract): boolean {
  for (const read of contract.reads ?? []) {
    if (read.kind !== "read" || read.confidence !== "exact") continue;
    if (!hasStatePath(state, read.path)) return false;
  }
  return true;
}

function contextMatchesContract(context: Record<string, unknown> | undefined, contract: ExactContextEffect[] | undefined): boolean {
  if (!context) return !requiresExactContext(contract);
  if (!contract?.length) return false;

  const allowed = new Set(contract
    .filter(effect => effect.confidence === "exact")
    .map(effect => effect.token));
  if (!Object.keys(context).every(token => allowed.has(token))) return false;

  for (const effect of contract) {
    if (effect.kind !== "read" || effect.confidence !== "exact") continue;
    if (!Object.prototype.hasOwnProperty.call(context, effect.token)) return false;
  }
  return true;
}

function requiresExactContext(contract: ExactContextEffect[] | undefined): boolean {
  return Boolean(contract?.some(effect => effect.kind === "read" && effect.confidence === "exact"));
}

function hasStatePath(value: unknown, path: string): boolean {
  if (path === "*") return value !== undefined;
  let cursor = value;
  for (const segment of path.split(".")) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return false;
    if (!Object.prototype.hasOwnProperty.call(cursor, segment)) return false;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return true;
}
