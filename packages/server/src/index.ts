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
  ExactStateContract
} from "./types.js";
import {
  hasOnlyKeys,
  isJsonSafe,
  jsonResponse,
  parseExactRequestBody,
  readBody,
  requestPayloadSafe
} from "./protocol.js";
import { dispatchExactBatch, streamExactResponse, wantsStreaming } from "./streaming.js";

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
    return streamExactResponse(request, input, context, dispatchExactOperation);
  }

  if (input.type === "batch") {
    const results = await dispatchExactBatch(request, input.operations, context, dispatchExactOperation);
    return jsonResponse(200, { ok: true, version: 1, results } satisfies ExactBatchResult);
  }

  const result = await dispatchExactOperation(request, input, context);
  if (isOperationError(result)) return jsonResponse(result.status, { error: result.error });
  const { ok: _ok, type: _type, id: _id, ...body } = result;
  return jsonResponse(200, { ok: true, ...body });
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
