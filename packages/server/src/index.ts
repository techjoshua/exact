import { logFrameworkEvent, type Logger } from "@exact/core";

export const exactServerManifestVersion = 1 as const;
export const exactCompilerManifestVersion = 1 as const;

export type ExactInvocationKind = "action" | "refresh";

export type ExactServerManifest = {
  version: 1;
  endpoint?: string;
  actions?: Record<string, ExactManifestAction>;
  boundaries?: Record<string, ExactManifestBoundary>;
  actionBoundaries?: Record<string, string[]>;
};

export type ExactManifestAction = {
  id: string;
  componentId?: string;
  taskId?: string;
  placement?: "server" | "isomorphic";
  stateContract?: ExactStateContract;
};

export type ExactManifestBoundary = {
  id: string;
  name?: string;
  componentId?: string;
  ownerComponentId?: string;
  kind?: string;
};

export type ExactStateContract = {
  reads?: ExactStatePath[];
  writes?: ExactStatePath[];
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
    kind?: string;
  }[];
};

export type CreateExactServerManifestOptions = {
  endpoint?: string;
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
        stateContract: action.stateContract
      };
    }

    for (const boundary of manifest.boundaries ?? []) {
      boundaries[boundary.id] ??= {
        id: boundary.id,
        name: boundary.name,
        componentId: boundary.componentId,
        ownerComponentId: boundary.ownerComponentId,
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

  return {
    version: exactServerManifestVersion,
    endpoint: options.endpoint,
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

  if (context.authorize && !await context.authorize(request, input)) {
    logReject(context, "rejected unauthorized exact invocation");
    return jsonResponse(403, { error: "forbidden" });
  }

  if (context.validateCsrf && !await context.validateCsrf(request, input)) {
    logReject(context, "rejected exact invocation with invalid csrf");
    return jsonResponse(403, { error: "forbidden" });
  }

  if (input.type === "batch") {
    const results: ExactOperationResult[] = [];
    const successful = new Set<string>();
    for (const operation of input.operations) {
      if (operation.dependsOn?.some(id => !successful.has(id))) {
        results.push({
          ok: false,
          type: operation.type,
          id: operation.id,
          opId: operation.opId,
          status: 424,
          error: "dependency_failed"
        });
        continue;
      }
      const result = await dispatchExactOperation(request, operation, context);
      results.push(result);
      if (result.ok && operation.opId) successful.add(operation.opId);
    }
    return jsonResponse(200, { ok: true, version: 1, results } satisfies ExactBatchResult);
  }

  const result = await dispatchExactOperation(request, input, context);
  if (isOperationError(result)) return jsonResponse(result.status, { error: result.error });
  const { ok: _ok, type: _type, id: _id, ...body } = result;
  return jsonResponse(200, { ok: true, ...body });
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
    return new Response(response.body, {
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
      response.send(result.body);
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
    const response = h.response(result.body).code(result.status);
    for (const [name, value] of Object.entries(result.headers)) response.header(name, value);
    return response;
  };
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

  if (context.authorize && !await context.authorize(request, input)) {
    return reject(403, "forbidden", "rejected unauthorized exact invocation");
  }

  if (context.validateCsrf && !await context.validateCsrf(request, input)) {
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
    opId: typeof record.opId === "string" ? record.opId : undefined,
    dependsOn: Array.isArray(record.dependsOn) ? record.dependsOn : undefined,
    payload: record.payload,
    state: record.state,
    boundaryHtml: typeof record.boundaryHtml === "string" ? record.boundaryHtml : undefined,
    boundaryHtmls: record.boundaryHtmls
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
    ...(config.state === undefined ? {} : { state: config.state }),
    ...(config.stateContracts && Object.keys(config.stateContracts).length ? { stateContracts: config.stateContracts } : {}),
    ...(config.actionBoundaries && Object.keys(config.actionBoundaries).length ? { actionBoundaries: config.actionBoundaries } : {})
  };
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
