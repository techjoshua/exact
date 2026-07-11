import { logFrameworkEvent, type Logger } from "@exact/core";

export const exactServerManifestVersion = 1 as const;
export const exactCompilerManifestVersion = 1 as const;

export type ExactInvocationKind = "action" | "refresh";

export type ExactServerManifest = {
  version: 1;
  endpoint?: string;
  endpoints?: ExactEndpointRoutes;
  actions?: Record<string, ExactManifestAction>;
  boundaries?: Record<string, ExactManifestBoundary>;
  actionBoundaries?: Record<string, string[]>;
};

export type ExactEndpointRoutes = {
  actions?: Record<string, string>;
  boundaries?: Record<string, string>;
};

export type ExactManifestAction = {
  id: string;
  componentId?: string;
  taskId?: string;
  placement?: "server" | "isomorphic";
  stateContract?: ExactStateContract;
  contextContract?: ExactContextEffect[];
};

export type ExactManifestBoundary = {
  id: string;
  name?: string;
  componentId?: string;
  ownerComponentId?: string;
  renderEdgeId?: string;
  renderEdgeIndex?: number;
  renderPath?: string;
  kind?: string;
};

export type ExactStateContract = {
  reads?: ExactStatePath[];
  writes?: ExactStatePath[];
};

export type ExactContextEffect = {
  token: string;
  kind: "read" | "write";
  confidence: "exact" | "unknown";
};

export type ExactStatePath = {
  path: string;
  kind: "read" | "write";
  confidence: "exact" | "broad" | "unknown";
};

export type ExactCompilerManifestLike = {
  version: 1;
  serverActions?: Record<string, {
    id: string;
    componentId?: string;
    taskId?: string;
    placement?: "server" | "isomorphic" | "client" | "unknown";
    stateContract?: ExactStateContract;
    contextContract?: ExactContextEffect[];
  }>;
  components?: readonly {
    id: string;
    placement?: "server" | "isomorphic" | "client" | "unknown";
  }[];
  boundaries?: readonly {
    id: string;
    name?: string;
    componentId?: string;
    ownerComponentId?: string;
    renderEdgeId?: string;
    renderEdgeIndex?: number;
    renderPath?: string;
    kind?: string;
  }[];
};

export type CreateExactServerManifestOptions = {
  endpoint?: string;
  endpoints?: ExactEndpointRoutes;
  actions?: Record<string, ExactManifestAction>;
  boundaries?: Record<string, ExactManifestBoundary>;
};

export type ExactRequestLike = {
  method: string;
  url?: string;
  headers?: Headers | Record<string, string | string[] | undefined>;
  body?: unknown;
  text?(): Promise<string>;
  json?(): Promise<unknown>;
};

export type ExactResponseLike = {
  status: number;
  headers: Record<string, string>;
  body: string;
  stream?: ReadableStream<Uint8Array>;
};

export type ExactInvocationRequest = {
  type: ExactInvocationKind;
  id: string;
  opId?: string;
  dependsOn?: string[];
  payload?: unknown;
  state?: unknown;
  boundaryHtml?: string;
  boundaryHtmls?: Record<string, string>;
};

export type ExactBatchRequest = {
  type: "batch";
  version?: 1;
  operations: ExactInvocationRequest[];
};

export type ExactInvocationResult = {
  patches?: ExactPatch[];
  state?: unknown;
  html?: string;
};

export type ExactOperationSuccess = {
  ok: true;
  type: ExactInvocationKind;
  id: string;
  opId?: string;
} & ExactInvocationResult;

export type ExactOperationError = {
  ok: false;
  type: ExactInvocationKind;
  id: string;
  opId?: string;
  status: number;
  error: "bad_request" | "not_found" | "forbidden" | "internal_error" | "dependency_failed";
};

export type ExactOperationResult = ExactOperationSuccess | ExactOperationError;

export type ExactBatchResult = {
  ok: true;
  version: 1;
  results: ExactOperationResult[];
};

export type ExactStreamEvent =
  | { event: "start"; version: 1; operations: number }
  | { event: "patch"; version: 1; index: number; opId?: string; patch: ExactPatch }
  | { event: "state"; version: 1; index: number; opId?: string; value: unknown }
  | { event: "html"; version: 1; index: number; opId?: string; html: string }
  | { event: "result"; version: 1; index: number; result: ExactOperationResult }
  | { event: "complete"; version: 1 };

export type ExactPatch =
  | { type: "text"; id: string; value: string }
  | { type: "prop"; id: string; name: string; value: unknown }
  | { type: "style"; id: string; name: string; value: string | null }
  | { type: "list"; id: string; op: "insert" | "move" | "remove"; key: string; before?: string; html?: string }
  | { type: "state"; id: string; value: unknown }
  | { type: "replace"; id: string; html: string };

export type ExactServerContext = {
  manifest: ExactServerManifest;
  actions?: Record<string, (input: ExactInvocationRequest, context: ExactServerContext) => Promise<ExactInvocationResult> | ExactInvocationResult>;
  refreshBoundaries?: Record<string, (input: ExactInvocationRequest, context: ExactServerContext) => Promise<ExactInvocationResult> | ExactInvocationResult>;
  authorize?(request: ExactRequestLike, input: ExactInvocationRequest | ExactBatchRequest): Promise<boolean> | boolean;
  validateCsrf?(request: ExactRequestLike, input: ExactInvocationRequest | ExactBatchRequest): Promise<boolean> | boolean;
  logger?: Logger;
};

export type ExactHydrationManifestConfig = {
  endpoint?: string;
  endpoints?: ExactEndpointRoutes;
  state?: unknown;
  stateContracts?: Record<string, ExactStateContract>;
  actionBoundaries?: Record<string, readonly string[]>;
};

export function createExactServerManifest(
  compilerManifest: ExactCompilerManifestLike | readonly ExactCompilerManifestLike[],
  options: CreateExactServerManifestOptions = {}
): ExactServerManifest {
  const actions: Record<string, ExactManifestAction> = { ...options.actions };
  const boundaries: Record<string, ExactManifestBoundary> = { ...options.boundaries };

  for (const manifest of normalizeCompilerManifests(compilerManifest)) {
    assertCompilerManifestLike(manifest);
    if (manifest.version !== exactCompilerManifestVersion) {
      throw new Error(`Unsupported eXact compiler manifest version: ${String((manifest as { version?: unknown }).version)}`);
    }
    for (const action of Object.values(manifest.serverActions ?? {})) {
      if (action.placement !== "server" && action.placement !== "isomorphic") continue;
      actions[action.id] = {
        id: action.id,
        componentId: action.componentId,
        taskId: action.taskId,
        placement: action.placement,
        stateContract: action.stateContract,
        contextContract: action.contextContract
      };
    }

    for (const boundary of manifest.boundaries ?? []) {
      boundaries[boundary.id] ??= {
        id: boundary.id,
        name: boundary.name,
        componentId: boundary.componentId,
        ownerComponentId: boundary.ownerComponentId,
        renderEdgeId: boundary.renderEdgeId,
        renderEdgeIndex: boundary.renderEdgeIndex,
        renderPath: boundary.renderPath,
        kind: boundary.kind
      };
    }
    for (const component of manifest.components ?? []) {
      if (component.placement === "client") continue;
      boundaries[component.id] ??= {
        id: component.id,
        componentId: component.id
      };
    }
  }

  const endpoints = normalizeEndpointRoutes(options.endpoints);
  return {
    version: exactServerManifestVersion,
    endpoint: options.endpoint,
    endpoints,
    actions,
    boundaries,
    actionBoundaries: inferActionBoundaries(actions, boundaries)
  };
}

function normalizeCompilerManifests(manifest: ExactCompilerManifestLike | readonly ExactCompilerManifestLike[]): readonly ExactCompilerManifestLike[] {
  return isCompilerManifestList(manifest) ? manifest : [manifest];
}

function isCompilerManifestList(value: ExactCompilerManifestLike | readonly ExactCompilerManifestLike[]): value is readonly ExactCompilerManifestLike[] {
  return Array.isArray(value);
}

function assertCompilerManifestLike(manifest: unknown): asserts manifest is ExactCompilerManifestLike {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Malformed eXact compiler manifest");
  }
  const record = manifest as Partial<ExactCompilerManifestLike> & { version?: unknown };
  if (record.version !== exactCompilerManifestVersion) return;
  if (record.serverActions !== undefined && (!record.serverActions || typeof record.serverActions !== "object" || Array.isArray(record.serverActions))) {
    throw new Error("Malformed eXact compiler manifest");
  }
  for (const action of Object.values(record.serverActions ?? {})) {
    if (!action || typeof action !== "object" || Array.isArray(action)) throw new Error("Malformed eXact compiler manifest");
    if (typeof action.id !== "string" || !action.id) throw new Error("Malformed eXact compiler manifest");
    if (action.componentId !== undefined && typeof action.componentId !== "string") throw new Error("Malformed eXact compiler manifest");
    if (action.taskId !== undefined && typeof action.taskId !== "string") throw new Error("Malformed eXact compiler manifest");
    if (action.placement !== undefined && !isCompilerPlacement(action.placement)) throw new Error("Malformed eXact compiler manifest");
    if (action.stateContract !== undefined && !isStateContract(action.stateContract)) throw new Error("Malformed eXact compiler manifest");
    if (action.contextContract !== undefined && !isContextContract(action.contextContract)) throw new Error("Malformed eXact compiler manifest");
  }
  if (record.components !== undefined && !Array.isArray(record.components)) throw new Error("Malformed eXact compiler manifest");
  for (const component of record.components ?? []) {
    if (!component || typeof component !== "object" || Array.isArray(component)) throw new Error("Malformed eXact compiler manifest");
    if (typeof component.id !== "string" || !component.id) throw new Error("Malformed eXact compiler manifest");
    if (component.placement !== undefined && !isCompilerPlacement(component.placement)) throw new Error("Malformed eXact compiler manifest");
  }
  if (record.boundaries !== undefined && !Array.isArray(record.boundaries)) throw new Error("Malformed eXact compiler manifest");
  for (const boundary of record.boundaries ?? []) {
    if (!boundary || typeof boundary !== "object" || Array.isArray(boundary)) throw new Error("Malformed eXact compiler manifest");
    if (typeof boundary.id !== "string" || !boundary.id) throw new Error("Malformed eXact compiler manifest");
    if (boundary.name !== undefined && typeof boundary.name !== "string") throw new Error("Malformed eXact compiler manifest");
    if (boundary.componentId !== undefined && typeof boundary.componentId !== "string") throw new Error("Malformed eXact compiler manifest");
    if (boundary.ownerComponentId !== undefined && typeof boundary.ownerComponentId !== "string") throw new Error("Malformed eXact compiler manifest");
    if (boundary.renderEdgeId !== undefined && typeof boundary.renderEdgeId !== "string") throw new Error("Malformed eXact compiler manifest");
    if (boundary.renderEdgeIndex !== undefined && (!Number.isInteger(boundary.renderEdgeIndex) || boundary.renderEdgeIndex < 1)) throw new Error("Malformed eXact compiler manifest");
    if (boundary.renderPath !== undefined && typeof boundary.renderPath !== "string") throw new Error("Malformed eXact compiler manifest");
    if (boundary.kind !== undefined && typeof boundary.kind !== "string") throw new Error("Malformed eXact compiler manifest");
  }
}

function isCompilerPlacement(value: unknown): value is "server" | "isomorphic" | "client" | "unknown" {
  return value === "server" || value === "isomorphic" || value === "client" || value === "unknown";
}

function isStateContract(value: unknown): value is ExactStateContract {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<ExactStateContract>;
  return (record.reads === undefined || isStatePathList(record.reads))
    && (record.writes === undefined || isStatePathList(record.writes));
}

function isStatePathList(value: unknown): value is ExactStatePath[] {
  return Array.isArray(value) && value.every(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const path = item as Partial<ExactStatePath>;
    return typeof path.path === "string"
      && (path.kind === "read" || path.kind === "write")
      && (path.confidence === "exact" || path.confidence === "broad" || path.confidence === "unknown");
  });
}

function isContextContract(value: unknown): value is ExactContextEffect[] {
  return Array.isArray(value) && value.every(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const effect = item as Partial<ExactContextEffect>;
    return typeof effect.token === "string"
      && (effect.kind === "read" || effect.kind === "write")
      && (effect.confidence === "exact" || effect.confidence === "unknown");
  });
}

function inferActionBoundaries(
  actions: Record<string, ExactManifestAction>,
  boundaries: Record<string, ExactManifestBoundary>
): Record<string, string[]> {
  const output: Record<string, string[]> = {};
  for (const action of Object.values(actions)) {
    if (!action.componentId) continue;
    const ids = Object.values(boundaries)
      .filter(boundary => (boundary.ownerComponentId ?? boundary.componentId) === action.componentId)
      .map(boundary => boundary.id)
      .sort();
    if (ids.length) output[action.id] = ids;
  }
  return output;
}

export function createExactHydrationStateContracts(manifest: ExactServerManifest): Record<string, ExactStateContract> {
  const contracts: Record<string, ExactStateContract> = {};
  for (const [id, action] of Object.entries(manifest.actions ?? {})) {
    if (action.stateContract) contracts[id] = action.stateContract;
  }
  return contracts;
}

export function createExactHydrationActionBoundaries(manifest: ExactServerManifest): Record<string, readonly string[]> {
  return manifest.actionBoundaries ?? inferActionBoundaries(manifest.actions ?? {}, manifest.boundaries ?? {});
}

export function createExactHydrationManifestConfig(
  manifest: ExactServerManifest,
  state?: unknown
): ExactHydrationManifestConfig {
  return omitEmptyHydrationConfig({
    endpoint: manifest.endpoint,
    endpoints: manifest.endpoints,
    state,
    stateContracts: createExactHydrationStateContracts(manifest),
    actionBoundaries: createExactHydrationActionBoundaries(manifest)
  });
}

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

export function createFetchHandler(context: ExactServerContext): (request: Request) => Promise<Response> {
  return async request => {
    const response = await handleExactRequest({
      method: request.method,
      url: request.url,
      headers: request.headers,
      json: () => request.json(),
      text: () => request.text()
    }, context);
    return new Response(response.stream ?? response.body ?? "", {
      status: response.status,
      headers: response.headers
    });
  };
}

export function createExpressHandler(context: ExactServerContext): (request: any, response: any) => void {
  return (request, response) => {
    void handleExactRequest({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: request.body,
      text: typeof request.text === "function" ? () => request.text() : undefined
    }, context).then(result => {
      response.status(result.status);
      for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
      if (result.stream) {
        void pipeReadableStream(result.stream, chunk => response.write(chunk), () => response.end(), error => response.destroy?.(error));
      } else {
        response.send(result.body ?? "");
      }
    });
  };
}

export function createHapiHandler(context: ExactServerContext): (request: any, h: any) => Promise<any> {
  return async (request, h) => {
    const result = await handleExactRequest({
      method: request.method,
      url: request.url?.href ?? request.url?.path,
      headers: request.headers,
      body: request.payload
    }, context);
    const response = h.response(result.stream ?? result.body ?? "").code(result.status);
    for (const [name, value] of Object.entries(result.headers)) response.header(name, value);
    return response;
  };
}

async function pipeReadableStream(
  stream: ReadableStream<Uint8Array>,
  write: (chunk: Uint8Array) => void,
  end: () => void,
  fail: (error: unknown) => void
): Promise<void> {
  const reader = stream.getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      write(next.value);
    }
    end();
  } catch (error) {
    fail(error);
  }
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

async function readBody(request: ExactRequestLike): Promise<unknown> {
  if (request.body !== undefined) return request.body;
  if (request.json) return request.json();
  if (request.text) return request.text();
  return undefined;
}

function parseExactRequestBody(body: unknown): ExactInvocationRequest | ExactBatchRequest {
  const value = typeof body === "string" ? JSON.parse(body) : body;
  if (!value || typeof value !== "object") throw new Error("invalid invocation");
  const record = value as Record<string, unknown>;
  if (record.type === "batch") return parseBatch(record);
  return parseInvocationRecord(record);
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
  if (!hasOnlyKeys(record, ["type", "id", "opId", "dependsOn", "payload", "state", "boundaryHtml", "boundaryHtmls"])) throw new Error("unknown invocation field");
  if (record.type !== "action" && record.type !== "refresh") throw new Error("invalid invocation type");
  if (typeof record.id !== "string" || !record.id) throw new Error("invalid invocation id");
  if (record.opId !== undefined && (typeof record.opId !== "string" || !record.opId)) throw new Error("invalid operation id");
  if (record.dependsOn !== undefined && !isStringList(record.dependsOn)) throw new Error("invalid operation dependencies");
  if (record.boundaryHtmls !== undefined && !isBoundaryHtmlMap(record.boundaryHtmls)) throw new Error("invalid boundary htmls");
  return {
    type: record.type,
    id: record.id,
    ...(typeof record.opId === "string" ? { opId: record.opId } : {}),
    ...(Array.isArray(record.dependsOn) ? { dependsOn: record.dependsOn } : {}),
    ...(record.payload === undefined ? {} : { payload: record.payload }),
    ...(record.state === undefined ? {} : { state: record.state }),
    ...(typeof record.boundaryHtml === "string" ? { boundaryHtml: record.boundaryHtml } : {}),
    ...(record.boundaryHtmls === undefined ? {} : { boundaryHtmls: record.boundaryHtmls })
  };
}

function requestPayloadSafe(input: ExactInvocationRequest | ExactBatchRequest): boolean {
  if (input.type === "batch") {
    return input.operations.every(operation => requestPayloadSafe(operation));
  }
  return isJsonSafe(input.payload) && isJsonSafe(input.state);
}

function jsonResponse(status: number, body: unknown): ExactResponseLike {
  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    },
    body: JSON.stringify(body)
  };
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

function isBoundaryHtmlMap(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).every(([id, html]) => !!id && typeof html === "string");
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string" && item.length > 0);
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

function omitEmptyHydrationConfig(config: ExactHydrationManifestConfig): ExactHydrationManifestConfig {
  return {
    ...(config.endpoint === undefined ? {} : { endpoint: config.endpoint }),
    ...(config.endpoints && (Object.keys(config.endpoints.actions ?? {}).length || Object.keys(config.endpoints.boundaries ?? {}).length) ? { endpoints: config.endpoints } : {}),
    ...(config.state === undefined ? {} : { state: config.state }),
    ...(config.stateContracts && Object.keys(config.stateContracts).length ? { stateContracts: config.stateContracts } : {}),
    ...(config.actionBoundaries && Object.keys(config.actionBoundaries).length ? { actionBoundaries: config.actionBoundaries } : {})
  };
}

function normalizeEndpointRoutes(routes: ExactEndpointRoutes | undefined): ExactEndpointRoutes | undefined {
  if (!routes) return undefined;
  if (typeof routes !== "object" || Array.isArray(routes)) throw new Error("Malformed eXact endpoint routes");
  if (routes.actions !== undefined && !isEndpointMap(routes.actions)) throw new Error("Malformed eXact endpoint routes");
  if (routes.boundaries !== undefined && !isEndpointMap(routes.boundaries)) throw new Error("Malformed eXact endpoint routes");
  const actions = filterEndpointMap(routes.actions);
  const boundaries = filterEndpointMap(routes.boundaries);
  return Object.keys(actions).length || Object.keys(boundaries).length
    ? {
      ...(Object.keys(actions).length ? { actions } : {}),
      ...(Object.keys(boundaries).length ? { boundaries } : {})
    }
    : undefined;
}

function isEndpointMap(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).every(([id, endpoint]) => id.length > 0 && typeof endpoint === "string" && endpoint.length > 0);
}

function filterEndpointMap(map: Record<string, string> | undefined): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [id, endpoint] of Object.entries(map ?? {})) {
    if (id && endpoint) output[id] = endpoint;
  }
  return output;
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

function isJsonSafe(value: unknown, seen = new Set<object>()): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return Number.isFinite(value as number) || typeof value !== "number";
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.every(item => isJsonSafe(item, seen));
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.values(value as Record<string, unknown>).every(item => isJsonSafe(item, seen));
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(record).every(key => allowedSet.has(key));
}
