import { logFrameworkEvent, type Logger } from "@exact/core";

export type ExactInvocationKind = "action" | "refresh";

export type ExactServerManifest = {
  version: 1;
  endpoint?: string;
  actions?: Record<string, ExactManifestAction>;
  boundaries?: Record<string, ExactManifestBoundary>;
};

export type ExactManifestAction = {
  id: string;
  componentId?: string;
  taskId?: string;
  placement?: "server" | "isomorphic";
};

export type ExactManifestBoundary = {
  id: string;
  componentId?: string;
};

export type ExactCompilerManifestLike = {
  version: 1;
  serverActions?: Record<string, {
    id: string;
    componentId?: string;
    taskId?: string;
    placement?: "server" | "isomorphic" | "client" | "unknown";
  }>;
  components?: readonly {
    id: string;
    placement?: "server" | "isomorphic" | "client" | "unknown";
  }[];
};

export type CreateExactServerManifestOptions = {
  endpoint?: string;
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
  payload?: unknown;
  state?: unknown;
};

export type ExactInvocationResult = {
  patches?: ExactPatch[];
  state?: unknown;
  html?: string;
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
  authorize?(request: ExactRequestLike, input: ExactInvocationRequest): Promise<boolean> | boolean;
  validateCsrf?(request: ExactRequestLike, input: ExactInvocationRequest): Promise<boolean> | boolean;
  logger?: Logger;
};

export function createExactServerManifest(
  compilerManifest: ExactCompilerManifestLike,
  options: CreateExactServerManifestOptions = {}
): ExactServerManifest {
  const actions: Record<string, ExactManifestAction> = {};
  for (const action of Object.values(compilerManifest.serverActions ?? {})) {
    if (action.placement !== "server" && action.placement !== "isomorphic") continue;
    actions[action.id] = {
      id: action.id,
      componentId: action.componentId,
      taskId: action.taskId,
      placement: action.placement
    };
  }

  const boundaries: Record<string, ExactManifestBoundary> = { ...options.boundaries };
  for (const component of compilerManifest.components ?? []) {
    if (component.placement === "client") continue;
    boundaries[component.id] ??= {
      id: component.id,
      componentId: component.id
    };
  }

  return {
    version: 1,
    endpoint: options.endpoint,
    actions,
    boundaries
  };
}

export async function handleExactRequest(request: ExactRequestLike, context: ExactServerContext): Promise<ExactResponseLike> {
  if (request.method.toUpperCase() !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  let input: ExactInvocationRequest;
  try {
    input = parseInvocation(await readBody(request));
  } catch {
    logReject(context, "rejected malformed exact invocation");
    return jsonResponse(400, { error: "bad_request" });
  }

  if (!isJsonSafe(input.payload) || !isJsonSafe(input.state)) {
    logReject(context, "rejected non-serializable exact invocation payload");
    return jsonResponse(400, { error: "bad_request" });
  }

  const allowed = isManifestAllowed(input, context.manifest);
  if (!allowed) {
    logReject(context, "rejected unknown exact invocation id");
    return jsonResponse(404, { error: "not_found" });
  }

  if (context.authorize && !await context.authorize(request, input)) {
    logReject(context, "rejected unauthorized exact invocation");
    return jsonResponse(403, { error: "forbidden" });
  }

  if (context.validateCsrf && !await context.validateCsrf(request, input)) {
    logReject(context, "rejected exact invocation with invalid csrf");
    return jsonResponse(403, { error: "forbidden" });
  }

  const handler = input.type === "action"
    ? context.actions?.[input.id]
    : context.refreshBoundaries?.[input.id];

  if (!handler) {
    logReject(context, "rejected exact invocation without registered handler");
    return jsonResponse(404, { error: "not_found" });
  }

  try {
    const result = await handler(input, context);
    if (!isJsonSafe(result)) {
      logReject(context, "rejected non-serializable exact invocation result");
      return jsonResponse(500, { error: "internal_error" });
    }
    return jsonResponse(200, { ok: true, ...result });
  } catch (error) {
    logFrameworkEvent("error", "server", "request", "exact invocation failed", error, context.logger);
    return jsonResponse(500, { error: "internal_error" });
  }
}

export function createFetchHandler(context: ExactServerContext): (request: Request) => Promise<Response> {
  return async request => {
    const response = await handleExactRequest(request, context);
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

async function readBody(request: ExactRequestLike): Promise<unknown> {
  if (request.body !== undefined) return request.body;
  if (request.json) return request.json();
  if (request.text) return request.text();
  return undefined;
}

function parseInvocation(body: unknown): ExactInvocationRequest {
  const value = typeof body === "string" ? JSON.parse(body) : body;
  if (!value || typeof value !== "object") throw new Error("invalid invocation");
  const record = value as Record<string, unknown>;
  if (record.type !== "action" && record.type !== "refresh") throw new Error("invalid invocation type");
  if (typeof record.id !== "string" || !record.id) throw new Error("invalid invocation id");
  return {
    type: record.type,
    id: record.id,
    payload: record.payload,
    state: record.state
  };
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
