import { render } from "@exact/dom";
import { createServerSlot, createVNode, logFrameworkEvent, type Logger, type VNode } from "@exact/core";
import type {
  ClientIslandRegistry,
  ExactBatchQueue,
  ExactClient,
  FetchLike,
  HydrateOptions,
  HydrationRoot,
  InvokeExactBatchOptions,
  InvokeExactOptions,
  PendingExactOperation,
  ExactInvocationKind,
  ExactInvocationRequest,
  ExactInvocationResult,
  ExactOperationResult,
  ExactStateContract
} from "./types.js";
import {
  cloneEndpointRoutes,
  headersCacheKey,
  mergeClientIslands,
  mergeHydrationRegistration,
  readExactHydrationConfig,
  resolveHydrateOptions
} from "./config.js";
import { applyPatches, boundaryInnerHtml, hasExactMarkers, reportMismatch } from "./patches.js";
import { parseExactBatchResponse, parseExactInvocationResponse, readExactStreamResponse } from "./responses.js";

export { applyPatches } from "./patches.js";
export { readExactHydrationConfig } from "./config.js";
export type * from "./types.js";

const roots = new WeakMap<Element, HydrationRoot>();

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

function boundaryHtmlsFor(container: Element, ids: readonly string[] | undefined): Record<string, string> | undefined {
  if (!ids?.length) return undefined;
  const htmls: Record<string, string> = {};
  for (const id of ids) {
    const html = boundaryInnerHtml(container, id);
    if (html !== undefined) htmls[id] = html;
  }
  return Object.keys(htmls).length ? htmls : undefined;
}
