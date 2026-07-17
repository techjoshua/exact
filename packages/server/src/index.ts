import { logFrameworkEvent } from "@exact/core";
import type {
  ExactBatchRequest,
  ExactBatchResult,
  ExactInvocationRequest,
  ExactOperationError,
  ExactOperationResult,
  ExactRequestLike,
  ExactResponseLike,
  ExactServerContext
} from "./types.js";
import {
  jsonResponse,
  parseExactRequestBody,
  readBody,
  requestPayloadSafe
} from "./protocol.js";
import { dispatchExactBatch, streamExactResponse, wantsStreaming } from "./streaming.js";
import {
  boundaryHintsAllowed,
  contextMatchesContract,
  isInvocationResultSafe,
  isManifestAllowed,
  stateMatchesContract
} from "./validation.js";
import {
  processExactOutputSync
} from "@exact/plugin-host/runtime";

export { exactCompilerManifestVersion, exactServerManifestVersion } from "./versions.js";
export {
  createExactHydrationActionBoundaries,
  createExactHydrationManifestConfig,
  createExactHydrationStateContracts,
  createExactServerManifest
} from "./manifest.js";
export {
  createExpressHandler,
  createFetchHandler,
  createHapiHandler,
  type ExactExpressRequest,
  type ExactExpressResponse,
  type ExactHapiRequest,
  type ExactHapiResponse,
  type ExactHapiToolkit
} from "./adapters.js";
export type * from "./types.js";

/** Handles an eXact endpoint request using the runtime-neutral server protocol. */
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
    input = parseExactRequestBody(await readBody(request), {
      maxBatchOperations: context.limits?.maxBatchOperations,
      maxJsonDepth: context.limits?.maxJsonDepth,
      maxJsonNodes: context.limits?.maxJsonNodes,
      maxRequestBytes: context.limits?.maxRequestBytes
    });
  } catch {
    logReject(context, "rejected malformed exact invocation");
    return jsonResponse(400, { error: "bad_request" });
  }

  if (!requestPayloadSafe(input, {
    maxJsonDepth: context.limits?.maxJsonDepth,
    maxJsonNodes: context.limits?.maxJsonNodes,
    maxRequestBytes: context.limits?.maxRequestBytes
  })) {
    logReject(context, "rejected non-serializable exact invocation payload");
    return jsonResponse(400, { error: "bad_request" });
  }

  // Top-level security hooks reject the entire request before any manifest dispatch.
  // Single operations reuse that result; batches still validate each operation during dispatch.
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
    return streamExactResponse(request, input, context, input.type === "batch" ? dispatchExactOperation : dispatchSecurityCheckedExactOperation);
  }

  if (input.type === "batch") {
    const results = await dispatchExactBatch(request, input.operations, context, dispatchExactOperation);
    return limitedJsonResponse(context, 200, { ok: true, version: 1, results } satisfies ExactBatchResult);
  }

  const result = await dispatchSecurityCheckedExactOperation(request, input, context);
  if (isOperationError(result)) return jsonResponse(result.status, { error: result.error });
  return limitedJsonResponse(context, 200, result);
}

function isOperationError(result: ExactOperationResult): result is ExactOperationError {
  return result.ok === false;
}

async function dispatchExactOperation(
  request: ExactRequestLike,
  input: ExactInvocationRequest,
  context: ExactServerContext
): Promise<ExactOperationResult> {
  return dispatchExactOperationAfterSecurity(request, input, context, false);
}

async function dispatchSecurityCheckedExactOperation(
  request: ExactRequestLike,
  input: ExactInvocationRequest,
  context: ExactServerContext
): Promise<ExactOperationResult> {
  return dispatchExactOperationAfterSecurity(request, input, context, true);
}

async function dispatchExactOperationAfterSecurity(
  request: ExactRequestLike,
  input: ExactInvocationRequest,
  context: ExactServerContext,
  securityChecked: boolean
): Promise<ExactOperationResult> {
  const reject = (status: number, error: ExactOperationError["error"], message: string): ExactOperationResult => {
    logReject(context, message);
    return { ok: false, type: input.type, id: input.id, opId: input.opId, status, error };
  };

  // The manifest allowlist is the server execution boundary: clients can name only
  // opaque IDs that the compiler emitted, never module paths or function names.
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

  if (!securityChecked) {
    const security = await checkSecurityHooks(request, input, context);
    if (security === "unauthorized") {
      return reject(403, "forbidden", "rejected unauthorized exact invocation");
    }

    if (security === "csrf") {
      return reject(403, "forbidden", "rejected exact invocation with invalid csrf");
    }
  }

  const handler = input.type === "action"
    ? context.actions?.[input.id]
    : context.refreshBoundaries?.[input.id];

  if (!handler) {
    return reject(404, "not_found", "rejected exact invocation without registered handler");
  }

  try {
    const requestContext = request.signal && request.signal !== context.signal
      ? { ...context, signal: request.signal }
      : context;
    const result = await handler(input, requestContext);
    if (!isInvocationResultSafe(result, {
      maxJsonDepth: context.limits?.maxJsonDepth,
      maxJsonNodes: context.limits?.maxJsonNodes,
      maxResponseBytes: context.limits?.maxResponseBytes,
      maxPatches: context.limits?.maxPatches
    })) {
      return reject(500, "internal_error", "rejected non-serializable exact invocation result");
    }
    return { ok: true, type: input.type, id: input.id, opId: input.opId, ...result };
  } catch (error) {
    logFrameworkEvent("error", "server", "request", "exact invocation failed", error, context.logger);
    return { ok: false, type: input.type, id: input.id, opId: input.opId, status: 500, error: "internal_error" };
  }
}

function limitedJsonResponse(context: ExactServerContext, status: number, body: unknown): ExactResponseLike {
  const validated = processExactOutputSync(body, { kind: "action-response", signal: context.signal }, context.outputExtensions ?? []);
  const response = jsonResponse(status, validated);
  const limit = positiveLimit(context.limits?.maxResponseBytes, 16 * 1024 * 1024);
  if (new TextEncoder().encode(response.body).byteLength <= limit) return response;
  logReject(context, "rejected oversized exact invocation response");
  return jsonResponse(500, { error: "internal_error" });
}

function positiveLimit(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback;
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
