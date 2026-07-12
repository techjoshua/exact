import { render } from "@exact/dom";
import { createServerSlot, createVNode, logFrameworkEvent, type ComponentFunction, type Logger, type VNode } from "@exact/core";
import type { ExactInvocationKind, ExactInvocationRequest, ExactInvocationResult, ExactOperationResult, ExactPatch, ExactStateContract, ExactStreamEvent } from "@exact/server";
import { cssEscape } from "./dom.js";
import { applyPatches, boundaryInnerHtml, hasExactMarkers, reportMismatch } from "./patches.js";
import { parseExactBatchResponse, parseExactInvocationResponse, readExactStreamResponse } from "./responses.js";
import { hasOnlyKeys } from "./validation.js";

export { applyPatches } from "./patches.js";

export type HydrateOptions = {
  endpoint?: string;
  endpoints?: ExactEndpointRoutes;
  state?: unknown;
  logger?: Logger;
  onMismatch?: "replace" | "throw";
  fetch?: FetchLike;
  headers?: Record<string, string>;
  transports?: Record<string, ExactEndpointTransport>;
  stateContracts?: Record<string, ExactStateContract>;
  actionBoundaries?: Record<string, readonly string[]>;
  islands?: ClientIslandRegistry;
  batch?: boolean;
  stream?: boolean;
};

export type ExactHydrationConfig = {
  endpoint?: string;
  endpoints?: ExactEndpointRoutes;
  state?: unknown;
  stateContracts?: Record<string, ExactStateContract>;
  actionBoundaries?: Record<string, readonly string[]>;
};

export type ExactHydrationRegistration = ExactHydrationConfig & {
  islands?: ClientIslandRegistry;
  transports?: Record<string, ExactEndpointTransport>;
};

export type ExactEndpointRoutes = {
  actions?: Record<string, string>;
  boundaries?: Record<string, string>;
};

export type ClientIslandRegistry = Record<string, ComponentFunction<any, any>>;

export type FetchLike = (input: string, init: {
  method: string;
  headers: Record<string, string>;
  body: string;
}) => Promise<{
  ok: boolean;
  status: number;
  body?: ReadableStream<Uint8Array> | null;
  json(): Promise<unknown>;
}>;

export type ExactEndpointTransport = {
  fetch?: FetchLike;
  headers?: Record<string, string>;
};

export type ExactClient = {
  readonly endpoint?: string;
  readonly endpoints?: ExactEndpointRoutes;
  state?: unknown;
  readonly stateContracts?: Record<string, ExactStateContract>;
  applyPatches(patches: readonly ExactPatch[]): boolean;
  invokeAction(id: string, payload?: unknown): Promise<ExactInvocationResult>;
  refreshBoundary(id: string, payload?: unknown): Promise<ExactInvocationResult>;
  refreshIsland(id: string, registry: ClientIslandRegistry, payload?: unknown): Promise<ExactInvocationResult>;
  registerManifest(config: ExactHydrationRegistration): void;
};

export type HydrationRoot = ExactClient;

const roots = new WeakMap<Element, HydrationRoot>();

export function readExactHydrationConfig(root: ParentNode = document, scriptId = "__exact_hydration"): ExactHydrationConfig {
  const script = root.querySelector(`#${cssEscape(scriptId)}`);
  if (!script) return {};
  try {
    const value = JSON.parse(script.textContent ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const record = value as Record<string, unknown>;
    return {
      endpoint: typeof record.endpoint === "string" ? record.endpoint : undefined,
      endpoints: isEndpointRoutes(record.endpoints) ? record.endpoints : undefined,
      state: record.state,
      stateContracts: isStateContractMap(record.stateContracts) ? record.stateContracts : undefined,
      actionBoundaries: isActionBoundaryMap(record.actionBoundaries) ? record.actionBoundaries : undefined
    };
  } catch {
    return {};
  }
}

export function hydrate(vnode: VNode, container: Element, options: HydrateOptions = {}): HydrationRoot {
  const resolvedOptions = resolveHydrateOptions(container, options);
  if (!hasExactMarkers(container)) {
    reportMismatch(resolvedOptions, "missing exact hydration markers");
    render(vnode, container, { logger: resolvedOptions.logger });
  } else {
    render(vnode, container, { logger: resolvedOptions.logger });
  }

  const root = createExactClient(container, resolvedOptions);
  roots.set(container, root);
  return root;
}

export function createExactClient(container: Element, options: HydrateOptions = {}): ExactClient {
  const resolvedOptions = resolveHydrateOptions(container, options);
  const runtimeOptions: HydrateOptions = {
    ...resolvedOptions,
    endpoints: cloneEndpointRoutes(resolvedOptions.endpoints),
    stateContracts: { ...(resolvedOptions.stateContracts ?? {}) },
    actionBoundaries: { ...(resolvedOptions.actionBoundaries ?? {}) },
    islands: { ...(resolvedOptions.islands ?? {}) },
    transports: { ...(resolvedOptions.transports ?? {}) }
  };
  const client: ExactClient = {
    get endpoint() {
      return runtimeOptions.endpoint;
    },
    get endpoints() {
      return runtimeOptions.endpoints;
    },
    get state() {
      return runtimeOptions.state;
    },
    set state(value: unknown) {
      runtimeOptions.state = value;
    },
    get stateContracts() {
      return runtimeOptions.stateContracts;
    },
    applyPatches(patches) {
      return applyPatches(container, patches, runtimeOptions);
    },
    invokeAction(id, payload) {
      return invokeAndApply(container, client, "action", id, payload, runtimeOptions);
    },
    refreshBoundary(id, payload) {
      return invokeAndApply(container, client, "refresh", id, payload, runtimeOptions);
    },
    async refreshIsland(id, registry, payload) {
      mergeClientIslands(runtimeOptions, registry);
      return invokeAndApply(container, client, "refresh", id, payload, runtimeOptions);
    },
    registerManifest(config) {
      mergeHydrationRegistration(runtimeOptions, config);
      if (config.islands) hydrateClientIslands(container, runtimeOptions.islands ?? {}, runtimeOptions);
    }
  };
  return client;
}

export function getHydrationRoot(container: Element): HydrationRoot | undefined {
  return roots.get(container);
}

export function hydrateClientIslands(container: Element | Document, registry: ClientIslandRegistry, options: HydrateOptions = {}): number {
  const boundaries = Array.from(container.querySelectorAll("[data-exact-client-boundary]"));
  let hydrated = 0;
  for (const boundary of boundaries) {
    if (boundary.getAttribute("data-exact-client-hydrated") === "true") continue;
    const name = boundary.getAttribute("data-exact-client-name");
    if (!name) continue;
    const component = registry[name];
    if (!component) {
      logFrameworkEvent("warn", "hydrate", "island", `missing client island ${name}`, undefined, options.logger);
      continue;
    }
    const props = parseIslandProps(boundary.getAttribute("data-exact-client-props"));
    render(createVNode(component, props), boundary, { logger: options.logger });
    boundary.setAttribute("data-exact-client-hydrated", "true");
    hydrated++;
  }
  return hydrated;
}

async function invokeAndApply(
  container: Element,
  client: ExactClient,
  type: ExactInvocationKind,
  id: string,
  payload: unknown,
  options: HydrateOptions
): Promise<ExactInvocationResult> {
  const operation: ExactInvocationRequest = {
    type,
    id,
    payload,
    state: type === "action" ? stateForContract(client.state, client.stateContracts?.[id]) : client.state,
    boundaryHtml: type === "refresh" ? boundaryInnerHtml(container, id) : undefined,
    boundaryHtmls: type === "action" ? boundaryHtmlsFor(container, options.actionBoundaries?.[id]) : undefined
  };
  const endpoint = requireEndpoint(endpointForOperation(client, type, id));
  const transport = transportForEndpoint(options, endpoint);
  const result = options.batch === false
    ? await invokeExact({
      endpoint,
      ...operation,
      fetch: transport.fetch,
      headers: transport.headers,
      logger: options.logger,
      stream: options.stream
    })
    : await enqueueExactOperation(container, {
      endpoint,
      operation,
      fetch: transport.fetch,
      headers: transport.headers,
      logger: options.logger,
      stream: options.stream
    });
  const patchesApplied = result.patches ? applyPatches(container, result.patches, options) : true;
  if (!patchesApplied && type === "refresh" && result.html) {
    applyPatches(container, [{ type: "replace", id, html: result.html }], options);
  }
  if (result.patches && options.islands) hydrateClientIslands(container, options.islands, options);
  if ("state" in result) client.state = result.state;
  return result;
}

export type InvokeExactOptions = {
  endpoint: string;
  type: ExactInvocationKind;
  id: string;
  payload?: unknown;
  state?: unknown;
  context?: Record<string, unknown>;
  boundaryHtml?: string;
  boundaryHtmls?: Record<string, string>;
  fetch?: FetchLike;
  headers?: Record<string, string>;
  logger?: Logger;
  stream?: boolean;
};

type PendingExactOperation = {
  operation: ExactInvocationRequest;
  resolve(result: ExactInvocationResult): void;
  reject(error: unknown): void;
};

type ExactBatchQueue = {
  endpoint: string;
  fetch?: FetchLike;
  headers?: Record<string, string>;
  headersKey: string;
  logger?: Logger;
  stream?: boolean;
  pending: PendingExactOperation[];
  scheduled: boolean;
};

const batchQueues = new WeakMap<Element, ExactBatchQueue[]>();

export async function invokeExact(options: InvokeExactOptions): Promise<ExactInvocationResult> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new Error("eXact endpoint invocation requires fetch");

  const response = await fetchImpl(options.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.stream ? { accept: "application/x-ndjson", "x-exact-stream": "1" } : {}),
      ...options.headers
    },
    body: JSON.stringify({
      type: options.type,
      id: options.id,
      payload: options.payload,
      state: options.state,
      context: options.context,
      boundaryHtml: options.boundaryHtml,
      boundaryHtmls: options.boundaryHtmls
    })
  });

  if (!response.ok) {
    logFrameworkEvent("warn", "hydrate", "request", `exact ${options.type} invocation failed with ${response.status}`, undefined, options.logger);
    throw new Error(`eXact ${options.type} invocation failed`);
  }
  if (options.stream) {
    const results = await readExactStreamResponse(response, 1);
    const result = results[0];
    if (!result?.ok) throw new Error(`eXact ${options.type} invocation failed`);
    const { ok: _ok, type: _type, id: _id, ...body } = result;
    return body;
  }
  const body = await response.json();
  return parseExactInvocationResponse(body, `eXact ${options.type} invocation returned malformed result`);
}

export type InvokeExactBatchOptions = {
  endpoint: string;
  operations: readonly ExactInvocationRequest[];
  fetch?: FetchLike;
  headers?: Record<string, string>;
  logger?: Logger;
  stream?: boolean;
};

export async function invokeExactBatch(options: InvokeExactBatchOptions): Promise<ExactOperationResult[]> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new Error("eXact endpoint invocation requires fetch");

  const response = await fetchImpl(options.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.stream ? { accept: "application/x-ndjson", "x-exact-stream": "1" } : {}),
      ...options.headers
    },
    body: JSON.stringify({
      type: "batch",
      version: 1,
      operations: options.operations
    })
  });

  if (!response.ok) {
    logFrameworkEvent("warn", "hydrate", "request", `exact batch invocation failed with ${response.status}`, undefined, options.logger);
    throw new Error("eXact batch invocation failed");
  }
  if (options.stream) return readExactStreamResponse(response, options.operations.length);
  const body = await response.json();
  return parseExactBatchResponse(body);
}

function enqueueExactOperation(
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

function requireEndpoint(endpoint: string | undefined): string {
  if (!endpoint) throw new Error("eXact endpoint is not configured");
  return endpoint;
}

function endpointForOperation(client: ExactClient, type: ExactInvocationKind, id: string): string | undefined {
  if (type === "action") return client.endpoints?.actions?.[id] ?? client.endpoint;
  return client.endpoints?.boundaries?.[id] ?? client.endpoint;
}

function transportForEndpoint(options: HydrateOptions, endpoint: string): { fetch?: FetchLike; headers?: Record<string, string> } {
  const transport = options.transports?.[endpoint];
  return {
    fetch: transport?.fetch ?? options.fetch,
    headers: {
      ...(options.headers ?? {}),
      ...(transport?.headers ?? {})
    }
  };
}

function resolveHydrateOptions(container: Element, options: HydrateOptions): HydrateOptions {
  const config = readExactHydrationConfig(hydrationConfigRoot(container));
  return {
    ...options,
    endpoint: options.endpoint ?? config.endpoint,
    endpoints: mergeEndpointRoutes(config.endpoints, options.endpoints),
    state: options.state === undefined ? config.state : options.state,
    stateContracts: options.stateContracts ?? config.stateContracts,
    actionBoundaries: options.actionBoundaries ?? config.actionBoundaries
  };
}

function mergeEndpointRoutes(
  base: ExactEndpointRoutes | undefined,
  override: ExactEndpointRoutes | undefined
): ExactEndpointRoutes | undefined {
  const actions = {
    ...(base?.actions ?? {}),
    ...(override?.actions ?? {})
  };
  const boundaries = {
    ...(base?.boundaries ?? {}),
    ...(override?.boundaries ?? {})
  };
  return Object.keys(actions).length || Object.keys(boundaries).length
    ? {
      ...(Object.keys(actions).length ? { actions } : {}),
      ...(Object.keys(boundaries).length ? { boundaries } : {})
    }
    : undefined;
}

function cloneEndpointRoutes(routes: ExactEndpointRoutes | undefined): ExactEndpointRoutes | undefined {
  return mergeEndpointRoutes(undefined, routes);
}

function mergeHydrationRegistration(options: HydrateOptions, registration: ExactHydrationRegistration): void {
  if (registration.endpoint !== undefined) {
    if (options.endpoint !== undefined && options.endpoint !== registration.endpoint) {
      throw new Error("Conflicting eXact hydration endpoint registration");
    }
    options.endpoint = registration.endpoint;
  }
  options.endpoints = mergeHydrationEndpointRoutes(options.endpoints, registration.endpoints);
  if (registration.state !== undefined) options.state = registration.state;
  if (registration.stateContracts) {
    options.stateContracts = mergeUniqueRecord(
      options.stateContracts,
      registration.stateContracts,
      "state contract",
      sameJsonValue
    );
  }
  if (registration.actionBoundaries) {
    options.actionBoundaries = mergeUniqueRecord(
      options.actionBoundaries,
      registration.actionBoundaries,
      "action boundary",
      (left, right) => sameStringList(left, right)
    );
  }
  if (registration.islands) mergeClientIslands(options, registration.islands);
  if (registration.transports) {
    options.transports = mergeUniqueRecord(
      options.transports,
      registration.transports,
      "endpoint transport",
      sameEndpointTransport
    );
  }
}

function mergeClientIslands(options: HydrateOptions, islands: ClientIslandRegistry): void {
  options.islands = mergeUniqueRecord(
    options.islands,
    islands,
    "client island",
    (left, right) => left === right
  );
}

function mergeHydrationEndpointRoutes(
  base: ExactEndpointRoutes | undefined,
  registration: ExactEndpointRoutes | undefined
): ExactEndpointRoutes | undefined {
  if (!registration) return cloneEndpointRoutes(base);
  return mergeEndpointRoutes(base, {
    actions: mergeUniqueRecord(base?.actions, registration.actions, "action endpoint route", (left, right) => left === right),
    boundaries: mergeUniqueRecord(base?.boundaries, registration.boundaries, "boundary endpoint route", (left, right) => left === right)
  });
}

function mergeUniqueRecord<T>(
  base: Record<string, T> | undefined,
  next: Record<string, T> | undefined,
  label: string,
  same: (left: T, right: T) => boolean
): Record<string, T> | undefined {
  if (!base && !next) return undefined;
  const output: Record<string, T> = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(next ?? {})) {
    if (Object.prototype.hasOwnProperty.call(output, key) && !same(output[key]!, value)) {
      throw new Error(`Conflicting eXact hydration ${label} registration: ${key}`);
    }
    output[key] = value;
  }
  return output;
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => right[index] === value);
}

function sameEndpointTransport(left: ExactEndpointTransport, right: ExactEndpointTransport): boolean {
  return left.fetch === right.fetch && sameHeaderMap(left.headers, right.headers);
}

function sameHeaderMap(left: Record<string, string> | undefined, right: Record<string, string> | undefined): boolean {
  return headersCacheKey(left) === headersCacheKey(right);
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function headersCacheKey(headers: Record<string, string> | undefined): string {
  if (!headers) return "";
  return Object.entries(headers)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}:${value}`)
    .join("\n");
}

function hydrationConfigRoot(container: Element): ParentNode {
  return container.ownerDocument ?? (typeof document !== "undefined" ? document : container);
}

function parseIslandProps(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const props = (parsed as Record<string, unknown>).props;
    return props && typeof props === "object" && !Array.isArray(props)
      ? reviveServerSlots(props) as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function reviveServerSlots(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reviveServerSlots);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (typeof record.__exactServerSlot === "string") {
    return createServerSlot(record.__exactServerSlot);
  }
  const revived: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (!isSafeObjectKey(key)) continue;
    revived[key] = reviveServerSlots(child);
  }
  return revived;
}

function stateForContract(state: unknown, contract: ExactStateContract | undefined): unknown {
  if (!contract) return state;
  const reads = contract.reads?.filter(read => read.kind === "read" && read.confidence === "exact") ?? [];
  if (!reads.length) return {};
  const output: Record<string, unknown> = {};
  for (const read of reads) {
    const value = getPath(state, read.path);
    if (value !== undefined) setPath(output, read.path, value);
  }
  return output;
}

function getPath(value: unknown, path: string): unknown {
  if (path === "*") return value;
  let cursor = value;
  for (const segment of path.split(".")) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(cursor, segment)) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  if (path === "*") return;
  const segments = path.split(".");
  if (!segments.every(isSafeObjectKey)) return;
  let cursor: Record<string, unknown> = target;
  for (const segment of segments.slice(0, -1)) {
    const next = cursor[segment];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]!] = value;
}

function isSafeObjectKey(key: string): boolean {
  return key !== "__proto__" && key !== "prototype" && key !== "constructor";
}

function isStateContractMap(value: unknown): value is Record<string, ExactStateContract> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(isStateContract);
}

function isStateContract(value: unknown): value is ExactStateContract {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (record.reads === undefined || isStatePathList(record.reads))
    && (record.writes === undefined || isStatePathList(record.writes));
}

function isStatePathList(value: unknown): boolean {
  return Array.isArray(value) && value.every(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const record = item as Record<string, unknown>;
    return typeof record.path === "string"
      && (record.kind === "read" || record.kind === "write")
      && (record.confidence === "exact" || record.confidence === "broad" || record.confidence === "unknown");
  });
}

function isActionBoundaryMap(value: unknown): value is Record<string, readonly string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(boundaries => {
    return Array.isArray(boundaries) && boundaries.every(boundary => typeof boundary === "string" && boundary.length > 0);
  });
}

function isEndpointRoutes(value: unknown): value is ExactEndpointRoutes {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (!hasOnlyKeys(record, ["actions", "boundaries"])) return false;
  return (record.actions === undefined || isEndpointMap(record.actions))
    && (record.boundaries === undefined || isEndpointMap(record.boundaries));
}

function isEndpointMap(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).every(([id, endpoint]) => {
    return id.length > 0 && typeof endpoint === "string" && endpoint.length > 0;
  });
}

function boundaryHtmlsFor(container: Element, ids: readonly string[] | undefined): Record<string, string> | undefined {
  if (!ids?.length) return undefined;
  const htmls: Record<string, string> = {};
  for (const id of ids) {
    const html = boundaryInnerHtml(container, id);
    if (html !== undefined) htmls[id] = html;
  }
  return Object.keys(htmls).length ? htmls : undefined;
}
