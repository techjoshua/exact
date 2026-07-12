import { render } from "@exact/dom";
import type { VNode } from "@exact/core";
import type {
  ExactClient,
  FetchLike,
  HydrateOptions,
  HydrationRoot,
  ExactInvocationKind,
  ExactInvocationRequest,
  ExactInvocationResult
} from "./types.js";
import { enqueueExactOperation } from "./batching.js";
import {
  cloneEndpointRoutes,
  mergeClientIslands,
  mergeHydrationRegistration,
  readExactHydrationConfig,
  resolveHydrateOptions
} from "./config.js";
import { hydrateClientIslands } from "./islands.js";
import { invokeExact } from "./invocations.js";
import { applyPatches, boundaryInnerHtml, hasExactMarkers, reportMismatch } from "./patches.js";
import { stateForContract } from "./state.js";

export { applyPatches } from "./patches.js";
export { hydrateClientIslands } from "./islands.js";
export { invokeExact, invokeExactBatch } from "./invocations.js";
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

function boundaryHtmlsFor(container: Element, ids: readonly string[] | undefined): Record<string, string> | undefined {
  if (!ids?.length) return undefined;
  const htmls: Record<string, string> = {};
  for (const id of ids) {
    const html = boundaryInnerHtml(container, id);
    if (html !== undefined) htmls[id] = html;
  }
  return Object.keys(htmls).length ? htmls : undefined;
}
