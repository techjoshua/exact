import { render } from "@exact/dom";
import { createServerSlot, createVNode, logFrameworkEvent, type ComponentFunction, type Logger, type VNode } from "@exact/core";
import type { ExactInvocationKind, ExactInvocationRequest, ExactInvocationResult, ExactOperationResult, ExactPatch, ExactStateContract } from "@exact/server";

export type HydrateOptions = {
  endpoint?: string;
  state?: unknown;
  logger?: Logger;
  onMismatch?: "replace" | "throw";
  fetch?: FetchLike;
  headers?: Record<string, string>;
  stateContracts?: Record<string, ExactStateContract>;
  actionBoundaries?: Record<string, readonly string[]>;
  islands?: ClientIslandRegistry;
  batch?: boolean;
};

export type ExactHydrationConfig = {
  endpoint?: string;
  state?: unknown;
  stateContracts?: Record<string, ExactStateContract>;
  actionBoundaries?: Record<string, readonly string[]>;
};

export type ClientIslandRegistry = Record<string, ComponentFunction<any, any>>;

export type FetchLike = (input: string, init: {
  method: string;
  headers: Record<string, string>;
  body: string;
}) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export type ExactClient = {
  readonly endpoint?: string;
  state?: unknown;
  readonly stateContracts?: Record<string, ExactStateContract>;
  applyPatches(patches: readonly ExactPatch[]): boolean;
  invokeAction(id: string, payload?: unknown): Promise<ExactInvocationResult>;
  refreshBoundary(id: string, payload?: unknown): Promise<ExactInvocationResult>;
  refreshIsland(id: string, registry: ClientIslandRegistry, payload?: unknown): Promise<ExactInvocationResult>;
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
  const client: ExactClient = {
    endpoint: resolvedOptions.endpoint,
    state: resolvedOptions.state,
    stateContracts: resolvedOptions.stateContracts,
    applyPatches(patches) {
      return applyPatches(container, patches, resolvedOptions);
    },
    invokeAction(id, payload) {
      return invokeAndApply(container, client, "action", id, payload, resolvedOptions);
    },
    refreshBoundary(id, payload) {
      return invokeAndApply(container, client, "refresh", id, payload, resolvedOptions);
    },
    async refreshIsland(id, registry, payload) {
      return invokeAndApply(container, client, "refresh", id, payload, {
        ...resolvedOptions,
        islands: {
          ...resolvedOptions.islands,
          ...registry
        }
      });
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
  const result = options.batch === false
    ? await invokeExact({
      endpoint: requireEndpoint(client.endpoint),
      ...operation,
      fetch: options.fetch,
      headers: options.headers,
      logger: options.logger
    })
    : await enqueueExactOperation(container, {
      endpoint: requireEndpoint(client.endpoint),
      operation,
      fetch: options.fetch,
      headers: options.headers,
      logger: options.logger
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
  boundaryHtml?: string;
  boundaryHtmls?: Record<string, string>;
  fetch?: FetchLike;
  headers?: Record<string, string>;
  logger?: Logger;
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
  logger?: Logger;
  pending: PendingExactOperation[];
  scheduled: boolean;
};

const batchQueues = new WeakMap<Element, ExactBatchQueue>();

export async function invokeExact(options: InvokeExactOptions): Promise<ExactInvocationResult> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new Error("eXact endpoint invocation requires fetch");

  const response = await fetchImpl(options.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...options.headers
    },
    body: JSON.stringify({
      type: options.type,
      id: options.id,
      payload: options.payload,
      state: options.state,
      boundaryHtml: options.boundaryHtml,
      boundaryHtmls: options.boundaryHtmls
    })
  });

  const body = await response.json();
  if (!response.ok) {
    logFrameworkEvent("warn", "hydrate", "request", `exact ${options.type} invocation failed with ${response.status}`, undefined, options.logger);
    throw new Error(`eXact ${options.type} invocation failed`);
  }
  return parseExactInvocationResponse(body, `eXact ${options.type} invocation returned malformed result`);
}

export type InvokeExactBatchOptions = {
  endpoint: string;
  operations: readonly ExactInvocationRequest[];
  fetch?: FetchLike;
  headers?: Record<string, string>;
  logger?: Logger;
};

export async function invokeExactBatch(options: InvokeExactBatchOptions): Promise<ExactOperationResult[]> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new Error("eXact endpoint invocation requires fetch");

  const response = await fetchImpl(options.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...options.headers
    },
    body: JSON.stringify({
      type: "batch",
      version: 1,
      operations: options.operations
    })
  });

  const body = await response.json();
  if (!response.ok) {
    logFrameworkEvent("warn", "hydrate", "request", `exact batch invocation failed with ${response.status}`, undefined, options.logger);
    throw new Error("eXact batch invocation failed");
  }
  const results = (body as { results?: unknown }).results;
  if (!Array.isArray(results)) throw new Error("eXact batch invocation returned malformed results");
  return results.map(parseExactOperationResult);
}

function enqueueExactOperation(
  container: Element,
  options: {
    endpoint: string;
    operation: ExactInvocationRequest;
    fetch?: FetchLike;
    headers?: Record<string, string>;
    logger?: Logger;
  }
): Promise<ExactInvocationResult> {
  let queue = batchQueues.get(container);
  if (!queue || queue.endpoint !== options.endpoint || queue.fetch !== options.fetch || queue.headers !== options.headers || queue.logger !== options.logger) {
    queue = {
      endpoint: options.endpoint,
      fetch: options.fetch,
      headers: options.headers,
      logger: options.logger,
      pending: [],
      scheduled: false
    };
    batchQueues.set(container, queue);
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
        logger: queue.logger
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
      logger: queue.logger
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

export function applyPatches(container: Element, patches: readonly ExactPatch[], options: HydrateOptions = {}): boolean {
  for (const patch of patches) {
    const ok = applyPatch(container, patch);
    if (!ok) {
      reportMismatch(options, `could not apply exact patch ${patch.type}:${patch.id}`);
      if (options.onMismatch === "throw") {
        throw new Error(`Could not apply exact patch ${patch.type}:${patch.id}`);
      }
      return false;
    }
  }
  return true;
}

function requireEndpoint(endpoint: string | undefined): string {
  if (!endpoint) throw new Error("eXact endpoint is not configured");
  return endpoint;
}

function resolveHydrateOptions(container: Element, options: HydrateOptions): HydrateOptions {
  const config = readExactHydrationConfig(hydrationConfigRoot(container));
  return {
    ...options,
    endpoint: options.endpoint ?? config.endpoint,
    state: options.state === undefined ? config.state : options.state,
    stateContracts: options.stateContracts ?? config.stateContracts,
    actionBoundaries: options.actionBoundaries ?? config.actionBoundaries
  };
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

function boundaryInnerHtml(container: Element, id: string): string | undefined {
  const range = findExactRange(container, id);
  if (!range) return findServerSlotElement(container, id)?.innerHTML ?? findClientBoundaryElement(container, id)?.outerHTML;
  const wrapper = document.createElement("div");
  let cursor = range.start.nextSibling;
  while (cursor && cursor !== range.end) {
    wrapper.appendChild(cursor.cloneNode(true));
    cursor = cursor.nextSibling;
  }
  return wrapper.innerHTML;
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
  return (record.reads === undefined || Array.isArray(record.reads)) && (record.writes === undefined || Array.isArray(record.writes));
}

function isActionBoundaryMap(value: unknown): value is Record<string, readonly string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(boundaries => {
    return Array.isArray(boundaries) && boundaries.every(boundary => typeof boundary === "string" && boundary.length > 0);
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

function applyPatch(container: Element, patch: ExactPatch): boolean {
  if (patch.type === "text") {
    const target = findExactTarget(container, patch.id) ?? findServerSlotElement(container, patch.id);
    if (!target) return false;
    target.textContent = patch.value;
    return true;
  }

  if (patch.type === "prop") {
    const target = findExactElementTarget(container, patch.id);
    if (!target) return false;
    if (patch.value === false || patch.value === null || patch.value === undefined) {
      target.removeAttribute(patch.name);
    } else {
      target.setAttribute(patch.name, String(patch.value));
    }
    return true;
  }

  if (patch.type === "style") {
    const target = findExactElementTarget(container, patch.id) as HTMLElement | undefined;
    if (!target) return false;
    if (patch.value === null) target.style.removeProperty(patch.name);
    else target.style.setProperty(patch.name, patch.value);
    return true;
  }

  if (patch.type === "replace") {
    const range = findExactRange(container, patch.id);
    if (!range) {
      const clientBoundary = findClientBoundaryElement(container, patch.id);
      if (clientBoundary) {
        replaceElement(clientBoundary, patch.html);
        return true;
      }
      const slot = findServerSlotElement(container, patch.id);
      if (!slot) return false;
      replaceElementChildren(slot, patch.html);
      return true;
    }
    replaceRange(range, patch.html);
    return true;
  }

  if (patch.type === "state") {
    const target = findExactElement(container, patch.id);
    if (!target) return false;
    target.setAttribute("data-exact-state", JSON.stringify(patch.value));
    return true;
  }

  if (patch.type === "list") {
    const range = findExactRange(container, patch.id);
    if (!range) return false;
    if (patch.op === "remove") {
      const item = findExactItemRange(container, patch.key, range);
      if (!item) return false;
      replaceRange(item, "");
      return true;
    }
    const before = patch.before ? findExactItemRange(container, patch.before, range) : undefined;
    const anchor = before?.start ?? range.end;
    if (patch.op === "move") {
      const item = findExactItemRange(container, patch.key, range);
      if (!item) {
        if (!patch.html) return false;
        insertHtmlBefore(anchor, patch.html);
        return true;
      }
      moveRangeBefore(item, anchor);
      return true;
    }
    if (!patch.html) return false;
    insertHtmlBefore(anchor, patch.html);
    return true;
  }

  return false;
}

function hasExactMarkers(container: Element): boolean {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_COMMENT);
  while (walker.nextNode()) {
    if ((walker.currentNode as Comment).data.startsWith("exact:")) return true;
  }
  return false;
}

function findExactTarget(container: Element, id: string): Node | undefined {
  const range = findExactRange(container, id);
  if (!range) return findExactElement(container, id);
  let node = range.start.nextSibling;
  while (node && node !== range.end) {
    if (node.nodeType !== Node.COMMENT_NODE) return node;
    node = node.nextSibling;
  }
  return undefined;
}

function findExactElement(container: Element, id: string): Element | undefined {
  return container.querySelector(`[data-exact-id="${cssEscape(id)}"]`) ?? undefined;
}

function findServerSlotElement(container: Element, id: string): Element | undefined {
  return container.querySelector(`[data-exact-server-slot="${cssEscape(id)}"]`) ?? undefined;
}

function findClientBoundaryElement(container: Element, id: string): Element | undefined {
  return container.querySelector(`[data-exact-client-boundary="${cssEscape(id)}"]`) ?? undefined;
}

function findExactElementTarget(container: Element, id: string): Element | undefined {
  const exact = findExactElement(container, id);
  if (exact) return exact;
  const range = findExactRange(container, id);
  if (!range) return undefined;
  let node = range.start.nextSibling;
  while (node && node !== range.end) {
    if (node.nodeType === Node.ELEMENT_NODE) return node as Element;
    node = node.nextSibling;
  }
  return undefined;
}

function findExactRange(container: Element, id: string): { start: Comment; end: Comment } | undefined {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_COMMENT);
  let start: Comment | undefined;
  while (walker.nextNode()) {
    const comment = walker.currentNode as Comment;
    if (comment.data === `exact:${id}`) start = comment;
    if (start && comment.data === `/exact:${id}`) return { start, end: comment };
  }
  return undefined;
}

function findExactItemRange(
  container: Element,
  key: string,
  within?: { start: Comment; end: Comment }
): { start: Comment; end: Comment } | undefined {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_COMMENT);
  let inRange = !within;
  let start: Comment | undefined;
  while (walker.nextNode()) {
    const comment = walker.currentNode as Comment;
    if (within && comment === within.start) {
      inRange = true;
      continue;
    }
    if (within && comment === within.end) return undefined;
    if (!inRange) continue;
    if (isExactItemStart(comment, key)) start = comment;
    if (start && comment.data === `/${start.data}`) return { start, end: comment };
  }
  return undefined;
}

function isExactItemStart(comment: Comment, key: string): boolean {
  return comment.data.startsWith("exact:item:") && comment.data.endsWith(`:${key}`);
}

function replaceRange(range: { start: Comment; end: Comment }, html: string): void {
  let cursor = range.start.nextSibling;
  while (cursor && cursor !== range.end) {
    const next = cursor.nextSibling;
    cursor.parentNode?.removeChild(cursor);
    cursor = next;
  }
  if (!html) return;
  const template = document.createElement("template");
  template.innerHTML = html;
  range.end.parentNode?.insertBefore(template.content, range.end);
}

function replaceElementChildren(element: Element, html: string): void {
  element.replaceChildren();
  if (!html) return;
  const template = document.createElement("template");
  template.innerHTML = html;
  element.appendChild(template.content);
}

function replaceElement(element: Element, html: string): void {
  if (!html) {
    element.remove();
    return;
  }
  const template = document.createElement("template");
  template.innerHTML = html;
  element.replaceWith(template.content);
}

function insertHtmlBefore(anchor: Node, html: string): void {
  const template = document.createElement("template");
  template.innerHTML = html;
  anchor.parentNode?.insertBefore(template.content, anchor);
}

function moveRangeBefore(range: { start: Comment; end: Comment }, anchor: Node): void {
  if (isNodeInsideRange(anchor, range)) return;
  const fragment = document.createDocumentFragment();
  let cursor: Node | null = range.start;
  while (cursor) {
    const next: Node | null = cursor.nextSibling;
    fragment.appendChild(cursor);
    if (cursor === range.end) break;
    cursor = next;
  }
  anchor.parentNode?.insertBefore(fragment, anchor);
}

function isNodeInsideRange(node: Node, range: { start: Comment; end: Comment }): boolean {
  let cursor: Node | null = range.start;
  while (cursor) {
    if (cursor === node) return true;
    if (cursor === range.end) return false;
    cursor = cursor.nextSibling;
  }
  return false;
}

function reportMismatch(options: HydrateOptions, message: string): void {
  logFrameworkEvent("warn", "hydrate", "mismatch", message, undefined, options.logger);
}

function parseExactInvocationResponse(body: unknown, message: string): ExactInvocationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(message);
  const record = body as Record<string, unknown>;
  if ("ok" in record && record.ok !== true) throw new Error(message);
  if (!hasOnlyKeys(record, ["ok", "patches", "state", "html"])) throw new Error(message);
  if (record.patches !== undefined && (!Array.isArray(record.patches) || !record.patches.every(isPatchLike))) throw new Error(message);
  if (record.html !== undefined && typeof record.html !== "string") throw new Error(message);
  return {
    ...(record.patches === undefined ? {} : { patches: record.patches as ExactPatch[] }),
    ...("state" in record ? { state: record.state } : {}),
    ...(record.html === undefined ? {} : { html: record.html })
  };
}

function parseExactOperationResult(value: unknown): ExactOperationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("eXact batch invocation returned malformed results");
  const record = value as Record<string, unknown>;
  if (record.ok === true) {
    if (!hasOnlyKeys(record, ["ok", "type", "id", "opId", "patches", "state", "html"])) throw new Error("eXact batch invocation returned malformed results");
    if (record.type !== "action" && record.type !== "refresh") throw new Error("eXact batch invocation returned malformed results");
    if (typeof record.id !== "string" || !record.id) throw new Error("eXact batch invocation returned malformed results");
    if (record.opId !== undefined && typeof record.opId !== "string") throw new Error("eXact batch invocation returned malformed results");
    const result = parseExactInvocationResponse({
      ok: true,
      ...(record.patches === undefined ? {} : { patches: record.patches }),
      ...("state" in record ? { state: record.state } : {}),
      ...(record.html === undefined ? {} : { html: record.html })
    }, "eXact batch invocation returned malformed results");
    return {
      ok: true,
      type: record.type,
      id: record.id,
      ...(record.opId === undefined ? {} : { opId: record.opId }),
      ...result
    };
  }
  if (record.ok === false) {
    if (!hasOnlyKeys(record, ["ok", "type", "id", "opId", "status", "error"])) throw new Error("eXact batch invocation returned malformed results");
    if (record.type !== "action" && record.type !== "refresh") throw new Error("eXact batch invocation returned malformed results");
    if (typeof record.id !== "string" || !record.id) throw new Error("eXact batch invocation returned malformed results");
    if (record.opId !== undefined && typeof record.opId !== "string") throw new Error("eXact batch invocation returned malformed results");
    if (typeof record.status !== "number" || !Number.isInteger(record.status)) throw new Error("eXact batch invocation returned malformed results");
    if (record.error !== "bad_request" && record.error !== "not_found" && record.error !== "forbidden" && record.error !== "internal_error" && record.error !== "dependency_failed") {
      throw new Error("eXact batch invocation returned malformed results");
    }
    return {
      ok: false,
      type: record.type,
      id: record.id,
      ...(record.opId === undefined ? {} : { opId: record.opId }),
      status: record.status,
      error: record.error
    };
  }
  throw new Error("eXact batch invocation returned malformed results");
}

function isPatchLike(value: unknown): value is ExactPatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.type !== "string" || typeof record.id !== "string" || !record.id) return false;
  switch (record.type) {
    case "text":
      return hasOnlyKeys(record, ["type", "id", "value"]) && typeof record.value === "string";
    case "prop":
      return hasOnlyKeys(record, ["type", "id", "name", "value"]) && typeof record.name === "string" && "value" in record;
    case "style":
      return hasOnlyKeys(record, ["type", "id", "name", "value"]) && typeof record.name === "string" && (typeof record.value === "string" || record.value === null);
    case "list":
      return hasOnlyKeys(record, ["type", "id", "op", "key", "before", "html"])
        && (record.op === "insert" || record.op === "move" || record.op === "remove")
        && typeof record.key === "string"
        && (record.before === undefined || typeof record.before === "string")
        && (record.html === undefined || typeof record.html === "string");
    case "state":
      return hasOnlyKeys(record, ["type", "id", "value"]) && "value" in record;
    case "replace":
      return hasOnlyKeys(record, ["type", "id", "html"]) && typeof record.html === "string";
    default:
      return false;
  }
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(record).every(key => allowedSet.has(key));
}

function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/["\\]/g, "\\$&");
}
