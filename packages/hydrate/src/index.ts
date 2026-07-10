import { render } from "@exact/dom";
import { createVNode, logFrameworkEvent, type ComponentFunction, type Logger, type VNode } from "@exact/core";
import type { ExactInvocationKind, ExactInvocationResult, ExactPatch } from "@exact/server";

export type HydrateOptions = {
  endpoint?: string;
  state?: unknown;
  logger?: Logger;
  onMismatch?: "replace" | "throw";
  fetch?: FetchLike;
  headers?: Record<string, string>;
};

export type ExactHydrationConfig = {
  endpoint?: string;
  state?: unknown;
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
  applyPatches(patches: readonly ExactPatch[]): void;
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
      state: record.state
    };
  } catch {
    return {};
  }
}

export function hydrate(vnode: VNode, container: Element, options: HydrateOptions = {}): HydrationRoot {
  if (!hasExactMarkers(container)) {
    reportMismatch(options, "missing exact hydration markers");
    render(vnode, container, { logger: options.logger });
  } else {
    render(vnode, container, { logger: options.logger });
  }

  const root = createExactClient(container, options);
  roots.set(container, root);
  return root;
}

export function createExactClient(container: Element, options: HydrateOptions = {}): ExactClient {
  const client: ExactClient = {
    endpoint: options.endpoint,
    state: options.state,
    applyPatches(patches) {
      applyPatches(container, patches, options);
    },
    invokeAction(id, payload) {
      return invokeAndApply(container, client, "action", id, payload, options);
    },
    refreshBoundary(id, payload) {
      return invokeAndApply(container, client, "refresh", id, payload, options);
    },
    async refreshIsland(id, registry, payload) {
      const result = await invokeAndApply(container, client, "refresh", id, payload, options);
      hydrateClientIslands(container, registry, options);
      return result;
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
  const result = await invokeExact({
    endpoint: requireEndpoint(client.endpoint),
    type,
    id,
    payload,
    state: client.state,
    fetch: options.fetch,
    headers: options.headers,
    logger: options.logger
  });
  if (result.patches) applyPatches(container, result.patches, options);
  if ("state" in result) client.state = result.state;
  return result;
}

export type InvokeExactOptions = {
  endpoint: string;
  type: ExactInvocationKind;
  id: string;
  payload?: unknown;
  state?: unknown;
  fetch?: FetchLike;
  headers?: Record<string, string>;
  logger?: Logger;
};

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
      state: options.state
    })
  });

  const body = await response.json();
  if (!response.ok) {
    logFrameworkEvent("warn", "hydrate", "request", `exact ${options.type} invocation failed with ${response.status}`, undefined, options.logger);
    throw new Error(`eXact ${options.type} invocation failed`);
  }
  return body as ExactInvocationResult;
}

export function applyPatches(container: Element, patches: readonly ExactPatch[], options: HydrateOptions = {}): void {
  for (const patch of patches) {
    const ok = applyPatch(container, patch);
    if (!ok) {
      reportMismatch(options, `could not apply exact patch ${patch.type}:${patch.id}`);
      if (options.onMismatch === "throw") {
        throw new Error(`Could not apply exact patch ${patch.type}:${patch.id}`);
      }
      return;
    }
  }
}

function requireEndpoint(endpoint: string | undefined): string {
  if (!endpoint) throw new Error("eXact endpoint is not configured");
  return endpoint;
}

function parseIslandProps(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const props = (parsed as Record<string, unknown>).props;
    return props && typeof props === "object" && !Array.isArray(props)
      ? props as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function applyPatch(container: Element, patch: ExactPatch): boolean {
  if (patch.type === "text") {
    const target = findExactTarget(container, patch.id);
    if (!target) return false;
    target.textContent = patch.value;
    return true;
  }

  if (patch.type === "prop") {
    const target = findExactElement(container, patch.id);
    if (!target) return false;
    if (patch.value === false || patch.value === null || patch.value === undefined) {
      target.removeAttribute(patch.name);
    } else {
      target.setAttribute(patch.name, String(patch.value));
    }
    return true;
  }

  if (patch.type === "style") {
    const target = findExactElement(container, patch.id) as HTMLElement | undefined;
    if (!target) return false;
    if (patch.value === null) target.style.removeProperty(patch.name);
    else target.style.setProperty(patch.name, patch.value);
    return true;
  }

  if (patch.type === "replace") {
    const range = findExactRange(container, patch.id);
    if (!range) return false;
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
      const item = findExactRange(container, `item:${patch.key}`);
      if (!item) return false;
      replaceRange(item, "");
      return true;
    }
    if (!patch.html) return false;
    const template = document.createElement("template");
    template.innerHTML = patch.html;
    range.end.parentNode?.insertBefore(template.content, range.end);
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

function reportMismatch(options: HydrateOptions, message: string): void {
  logFrameworkEvent("warn", "hydrate", "mismatch", message, undefined, options.logger);
}

function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/["\\]/g, "\\$&");
}
