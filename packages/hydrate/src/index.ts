import { adoptComponentRoot, adoptStatic, render } from "@exact/dom";
import { Fragment, Text, isVNode, type Child, type VNode } from "@exact/core";
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

/** Hydrates an SSR container and returns the eXact client attached to that container. */
export function hydrate(vnode: VNode, container: Element, options: HydrateOptions = {}): HydrationRoot {
  const resolvedOptions = resolveHydrateOptions(container, options);
  if (!hasExactMarkers(container)) {
    reportMismatch(resolvedOptions, "missing exact hydration markers");
    render(vnode, container, { logger: resolvedOptions.logger });
  } else {
    if ((typeof vnode.type === "function"
      ? adoptComponentRoot(vnode, container, { logger: resolvedOptions.logger })
      : adoptStaticTree(vnode, container) && adoptStatic(vnode, container, { logger: resolvedOptions.logger }))) {
      const root = createExactClient(container, resolvedOptions);
      roots.set(container, root);
      return root;
    }
    // The DOM renderer currently mounts a new mounted graph.  Clear the SSR
    // range first so a hydration attempt cannot leave duplicate interactive
    // markup behind while marker adoption is unavailable for a boundary.
    container.replaceChildren();
    render(vnode, container, { logger: resolvedOptions.logger });
  }

  const root = createExactClient(container, resolvedOptions);
  roots.set(container, root);
  return root;
}

/** Adopts marker-wrapped static SSR output without replacing the server nodes. */
function adoptStaticTree(vnode: VNode, container: Element): boolean {
  const nodes = contentNodes(container);
  if (vnode.type === Fragment) return repairStaticChildren(vnode.children, nodes);
  if (nodes.length !== 1) return false;
  if (matchesStaticVNode(vnode, nodes[0]!)) return true;
  const replacement = createStaticNode(vnode);
  if (!replacement) return false;
  replaceNode(nodes[0]!, replacement);
  return true;
}

function matchesStaticVNode(vnode: VNode, node: Node): boolean {
  if (vnode.type === Text) return node.nodeType === Node.TEXT_NODE && node.textContent === String(vnode.props.value ?? "");
  if (typeof vnode.type !== "string" || !(node instanceof Element)) return false;
  if (node.tagName.toLowerCase() !== vnode.type.toLowerCase()) return false;
  const expectedAttributes = new Set<string>();
  for (const [name, value] of Object.entries(vnode.props)) {
    if (name === "key" || name === "children") continue;
    if (name === "ref" || /^on[A-Z]/.test(name) || value !== null && typeof value === "object" || typeof value === "function") return false;
    const attribute = name === "className" ? "class" : name;
    if (value === false || value === null || value === undefined) {
      if (node.hasAttribute(attribute)) return false;
    } else if (value === true) {
      if (!node.hasAttribute(attribute)) return false;
    } else if (node.getAttribute(attribute) !== String(value)) return false;
    if (value !== false && value !== null && value !== undefined) expectedAttributes.add(attribute);
  }
  for (const attribute of Array.from(node.attributes)) if (!expectedAttributes.has(attribute.name)) return false;
  return matchesStaticChildren(vnode.children, contentNodes(node));
}

function matchesStaticChildren(children: readonly Child[], nodes: readonly Node[]): boolean {
  const expected = flattenStaticChildren(children);
  return expected.length === nodes.length && expected.every((child, index) => matchesStaticChild(child, nodes[index]!));
}

function repairStaticChildren(children: readonly Child[], nodes: readonly Node[]): boolean {
  const expected = flattenStaticChildren(children);
  if (expected.length !== nodes.length) return false;
  for (let index = 0; index < expected.length; index++) {
    const child = expected[index]!;
    const node = nodes[index]!;
    if (matchesStaticChild(child, node)) continue;
    if (isVNode(child) && patchStaticVNode(child, node)) continue;
    const replacement = createStaticNodeFromChild(child);
    if (!replacement) return false;
    replaceNode(node, replacement);
  }
  return true;
}

function patchStaticVNode(vnode: VNode, node: Node): boolean {
  if (vnode.type === Text) {
    if (node.nodeType !== Node.TEXT_NODE) return false;
    node.textContent = String(vnode.props.value ?? "");
    return true;
  }
  if (typeof vnode.type !== "string" || !(node instanceof Element) || node.tagName.toLowerCase() !== vnode.type.toLowerCase()) return false;
  const expectedAttributes = new Set<string>();
  for (const [name, value] of Object.entries(vnode.props)) {
    if (name === "key" || name === "children") continue;
    if (name === "ref" || /^on[A-Z]/.test(name) || value !== null && typeof value === "object" || typeof value === "function") return false;
    const attribute = name === "className" ? "class" : name;
    if (value === false || value === null || value === undefined) node.removeAttribute(attribute);
    else if (value === true) node.setAttribute(attribute, "");
    else node.setAttribute(attribute, String(value));
    if (value !== false && value !== null && value !== undefined) expectedAttributes.add(attribute);
  }
  for (const attribute of Array.from(node.attributes)) if (!expectedAttributes.has(attribute.name)) node.removeAttribute(attribute.name);
  const expected = flattenStaticChildren(vnode.children);
  const actual = contentNodes(node);
  if (expected.length !== actual.length) return false;
  for (let index = 0; index < expected.length; index++) {
    const child = expected[index]!;
    if (matchesStaticChild(child, actual[index]!)) continue;
    if (isVNode(child) && patchStaticVNode(child, actual[index]!)) continue;
    const replacement = createStaticNodeFromChild(child);
    if (!replacement) return false;
    replaceNode(actual[index]!, replacement);
  }
  return true;
}

function matchesStaticChild(child: Child, node: Node): boolean {
  if (isVNode(child)) return matchesStaticVNode(child, node);
  return node.nodeType === Node.TEXT_NODE && node.textContent === String(child ?? "");
}

function flattenStaticChildren(children: readonly Child[]): Child[] {
  const flattened: Child[] = [];
  for (const child of children) {
    if (!isRenderableStaticChild(child)) continue;
    if (isVNode(child) && child.type === Fragment) flattened.push(...flattenStaticChildren(child.children));
    else flattened.push(child);
  }
  return flattened;
}

function isRenderableStaticChild(child: Child): boolean {
  return child !== null && child !== undefined && child !== false && child !== true;
}

function contentNodes(parent: ParentNode): Node[] {
  return Array.from(parent.childNodes).filter(node => node.nodeType !== Node.COMMENT_NODE);
}

function createStaticNodeFromChild(child: Child): Node | undefined {
  if (isVNode(child)) return createStaticNode(child);
  if (child === null || child === undefined || child === false || child === true) return undefined;
  return document.createTextNode(String(child));
}

function createStaticNode(vnode: VNode): Node | undefined {
  if (vnode.type === Text) return document.createTextNode(String(vnode.props.value ?? ""));
  if (typeof vnode.type !== "string") return undefined;
  const element = document.createElement(vnode.type);
  for (const [name, value] of Object.entries(vnode.props)) {
    if (name === "key" || name === "children") continue;
    if (name === "ref" || /^on[A-Z]/.test(name) || value !== null && typeof value === "object" || typeof value === "function") return undefined;
    const attribute = name === "className" ? "class" : name;
    if (value === true) element.setAttribute(attribute, "");
    else if (value !== false && value !== null && value !== undefined) element.setAttribute(attribute, String(value));
  }
  for (const child of flattenStaticChildren(vnode.children)) {
    const node = createStaticNodeFromChild(child);
    if (!node) return undefined;
    element.appendChild(node);
  }
  return element;
}

function replaceNode(previous: Node, next: Node): void {
  const active = document.activeElement;
  const focused = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
    ? active
    : undefined;
  const selection = focused ? { start: focused.selectionStart, end: focused.selectionEnd, direction: focused.selectionDirection } : undefined;
  previous.parentNode?.replaceChild(next, previous);
  if (focused && (focused === previous || previous.contains(focused))) {
    const replacement = next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement
      ? next
      : next instanceof Element ? next.querySelector("input, textarea") : undefined;
    if (replacement instanceof HTMLInputElement || replacement instanceof HTMLTextAreaElement) {
      replacement.focus();
      if (selection) replacement.setSelectionRange(selection.start, selection.end, selection.direction ?? undefined);
    }
  }
}

/** Creates a client runtime for invoking eXact server actions and boundary refreshes. */
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

/** Returns the hydration client previously attached to a container. */
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
  // Operations can route to per-action or per-boundary endpoints, which keeps
  // server components usable inside independently deployed micro-frontend bundles.
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
