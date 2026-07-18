import { adoptComponentRoot, adoptMarkerlessComponentRoot, adoptStatic, consumeDomWork, createDomWorkBudget, namespaceForTag, render, unmount, walkDomSubtree, type DomWorkBudget } from "@exact/dom";
import { Fragment, Text, isVNode, sanitizeUrlAttribute, type Child, type VNode } from "@exact/core";
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
import { applyPatches, boundaryInnerHtml, boundaryInnerHtmls, createPatchBoundaryResolver, reportMismatch } from "./patches.js";
import { stateForContract } from "./state.js";

export { applyPatches } from "./patches.js";
export { hydrateClientIslands } from "./islands.js";
export { invokeExact, invokeExactBatch } from "./invocations.js";
export { readExactHydrationConfig } from "./config.js";
export type * from "./types.js";

const roots = new WeakMap<Element, HydrationRoot>();
const requestVersions = new WeakMap<Element, Map<string, number>>();

/** Hydrates an SSR container and returns the eXact client attached to that container. */
export function hydrate(vnode: VNode, container: Element, options: HydrateOptions = {}): HydrationRoot {
  const existing = roots.get(container);
  if (existing) {
    render(vnode, container, { logger: options.logger, onErrorReport: options.onErrorReport, maxTreeDepth: options.maxTreeDepth, maxTreeNodes: options.maxTreeNodes, allowUnsafeHtml: options.allowUnsafeHtml, onUnsafeHtml: options.onUnsafeHtml });
    return existing;
  }
  const resolvedOptions = resolveHydrateOptions(container, options);
  const work = createDomWorkBudget(resolvedOptions.maxTreeNodes);
  const captured = captureHydrationDom(container, work);
  const formState = captured.formState;
  if (!captured.hasMarkers) {
    const adopted = resolvedOptions.allowMarkerless && typeof vnode.type === "function"
      ? adoptMarkerlessComponentRoot(vnode, container, { logger: resolvedOptions.logger, onErrorReport: resolvedOptions.onErrorReport, maxTreeDepth: resolvedOptions.maxTreeDepth, maxTreeNodes: remainingDomWork(work), workBudget: work, allowUnsafeHtml: resolvedOptions.allowUnsafeHtml, onUnsafeHtml: resolvedOptions.onUnsafeHtml })
      : false;
    if (adopted) {
      const root = createExactClient(container, resolvedOptions);
      roots.set(container, root);
      container.setAttribute("data-exact-hydrated", "true");
      restoreFormState(container, formState, work);
      return root;
    }
    reportMismatch(resolvedOptions, resolvedOptions.allowMarkerless ? "server markup did not match the client tree" : "missing exact hydration markers", resolvedOptions.allowMarkerless ? "adoption-mismatch" : "missing-markers");
    container.replaceChildren();
    render(vnode, container, { logger: resolvedOptions.logger, onErrorReport: resolvedOptions.onErrorReport, maxTreeDepth: resolvedOptions.maxTreeDepth, maxTreeNodes: remainingDomWork(work), workBudget: work, allowUnsafeHtml: resolvedOptions.allowUnsafeHtml, onUnsafeHtml: resolvedOptions.onUnsafeHtml });
  } else {
    if ((typeof vnode.type === "function"
      ? adoptComponentRoot(vnode, container, { logger: resolvedOptions.logger, onErrorReport: resolvedOptions.onErrorReport, maxTreeDepth: resolvedOptions.maxTreeDepth, maxTreeNodes: remainingDomWork(work), workBudget: work, allowUnsafeHtml: resolvedOptions.allowUnsafeHtml, onUnsafeHtml: resolvedOptions.onUnsafeHtml })
      : adoptStaticTree(vnode, container, createStaticBudget(resolvedOptions, work)) && adoptStatic(vnode, container, {
        logger: resolvedOptions.logger,
        onErrorReport: resolvedOptions.onErrorReport,
        maxTreeDepth: resolvedOptions.maxTreeDepth,
        maxTreeNodes: remainingDomWork(work),
        workBudget: work,
        allowUnsafeHtml: resolvedOptions.allowUnsafeHtml,
        onUnsafeHtml: resolvedOptions.onUnsafeHtml
      }))) {
      const root = createExactClient(container, resolvedOptions);
      roots.set(container, root);
      container.setAttribute("data-exact-hydrated", "true");
      restoreFormState(container, formState, work);
      return root;
    }
    // The DOM renderer currently mounts a new mounted graph.  Clear the SSR
    // range first so a hydration attempt cannot leave duplicate interactive
    // markup behind while marker adoption is unavailable for a boundary.
    container.replaceChildren();
    render(vnode, container, { logger: resolvedOptions.logger, onErrorReport: resolvedOptions.onErrorReport, maxTreeDepth: resolvedOptions.maxTreeDepth, maxTreeNodes: remainingDomWork(work), workBudget: work, allowUnsafeHtml: resolvedOptions.allowUnsafeHtml, onUnsafeHtml: resolvedOptions.onUnsafeHtml });
  }

  restoreFormState(container, formState, work);

  const root = createExactClient(container, resolvedOptions);
  roots.set(container, root);
  container.setAttribute("data-exact-hydrated", "true");
  return root;
}

/** Adopts marker-wrapped static SSR output without replacing the server nodes. */
type StaticBudget = { work: DomWorkBudget; maxDepth: number };

function createStaticBudget(options: HydrateOptions, work = createDomWorkBudget(options.maxTreeNodes)): StaticBudget {
  return {
    work,
    maxDepth: Number.isSafeInteger(options.maxTreeDepth) && options.maxTreeDepth! > 0 ? Math.min(options.maxTreeDepth!, 1_024) : 512
  };
}

function visitStatic(budget: StaticBudget, depth: number): void {
  consumeDomWork(budget.work);
  if (depth > budget.maxDepth) throw new Error(`eXact hydration tree exceeds the configured maximum depth of ${budget.maxDepth}`);
}

function adoptStaticTree(vnode: VNode, container: Element, budget: StaticBudget): boolean {
  visitStatic(budget, 0);
  const nodes = contentNodes(container);
  if (vnode.type === Fragment) return repairStaticChildren(vnode.children, nodes, budget, 1);
  if (nodes.length !== 1) return false;
  if (matchesStaticVNode(vnode, nodes[0]!, budget, 0)) return true;
  const replacement = createStaticNode(vnode, undefined, budget, 0);
  if (!replacement) return false;
  replaceNode(nodes[0]!, replacement);
  return true;
}

function matchesStaticVNode(vnode: VNode, node: Node, budget: StaticBudget, depth: number): boolean {
  if (depth > budget.maxDepth) throw new Error(`eXact hydration tree exceeds the configured maximum depth of ${budget.maxDepth}`);
  if (vnode.type === Text) return node.nodeType === Node.TEXT_NODE && node.textContent === String(vnode.props.value ?? "");
  if (typeof vnode.type !== "string" || !(node instanceof Element)) return false;
  if (node.tagName.toLowerCase() !== vnode.type.toLowerCase()) return false;
  const expectedNamespace = namespaceForTag(vnode.type, node.parentElement ?? undefined) ?? "http://www.w3.org/1999/xhtml";
  if (node.namespaceURI !== expectedNamespace) return false;
  const expectedAttributes = new Set<string>();
  for (const [name, value] of Object.entries(vnode.props)) {
    if (name === "key" || name === "children") continue;
    if (name === "ref" || /^on[A-Z]/.test(name)) continue;
    if (value !== null && typeof value === "object" || typeof value === "function") return false;
    const attribute = name === "className" ? "class" : name;
    if (value === false || value === null || value === undefined) {
      if (node.hasAttribute(attribute)) return false;
    } else if (value === true) {
      if (!node.hasAttribute(attribute)) return false;
    } else if (node.getAttribute(attribute) !== String(sanitizeUrlAttribute(name, value))) return false;
    if (value !== false && value !== null && value !== undefined) expectedAttributes.add(attribute);
  }
  for (const attribute of Array.from(node.attributes)) if (!expectedAttributes.has(attribute.name)) return false;
  return matchesStaticChildren(vnode.children, contentNodes(node), budget, depth + 1);
}

function matchesStaticChildren(children: readonly Child[], nodes: readonly Node[], budget: StaticBudget, depth: number): boolean {
  const expected = flattenStaticChildren(children, budget, depth);
  return expected.length === nodes.length && expected.every((child, index) => matchesStaticChild(child, nodes[index]!, budget, depth));
}

function repairStaticChildren(children: readonly Child[], nodes: readonly Node[], budget: StaticBudget, depth: number): boolean {
  const expected = flattenStaticChildren(children, budget, depth);
  if (expected.length !== nodes.length) return false;
  for (let index = 0; index < expected.length; index++) {
    const child = expected[index]!;
    const node = nodes[index]!;
    if (matchesStaticChild(child, node, budget, depth)) continue;
    if (isVNode(child) && patchStaticVNode(child, node, budget, depth)) continue;
    const replacement = createStaticNodeFromChild(child, undefined, budget, depth);
    if (!replacement) return false;
    replaceNode(node, replacement);
  }
  return true;
}

function patchStaticVNode(vnode: VNode, node: Node, budget: StaticBudget, depth: number): boolean {
  if (depth > budget.maxDepth) throw new Error(`eXact hydration tree exceeds the configured maximum depth of ${budget.maxDepth}`);
  if (vnode.type === Text) {
    if (node.nodeType !== Node.TEXT_NODE) return false;
    node.textContent = String(vnode.props.value ?? "");
    return true;
  }
  if (typeof vnode.type !== "string" || !(node instanceof Element) || node.tagName.toLowerCase() !== vnode.type.toLowerCase()) return false;
  const expectedNamespace = namespaceForTag(vnode.type, node.parentElement ?? undefined) ?? "http://www.w3.org/1999/xhtml";
  if (node.namespaceURI !== expectedNamespace) return false;
  const expectedAttributes = new Set<string>();
  for (const [name, value] of Object.entries(vnode.props)) {
    if (name === "key" || name === "children") continue;
    if (name === "ref" || /^on[A-Z]/.test(name)) continue;
    if (value !== null && typeof value === "object" || typeof value === "function") return false;
    const attribute = name === "className" ? "class" : name;
    if (value === false || value === null || value === undefined) node.removeAttribute(attribute);
    else if (value === true) node.setAttribute(attribute, "");
    else node.setAttribute(attribute, String(sanitizeUrlAttribute(name, value)));
    if (value !== false && value !== null && value !== undefined) expectedAttributes.add(attribute);
  }
  for (const attribute of Array.from(node.attributes)) if (!expectedAttributes.has(attribute.name)) node.removeAttribute(attribute.name);
  const expected = flattenStaticChildren(vnode.children, budget, depth + 1);
  const actual = contentNodes(node);
  if (expected.length !== actual.length) return false;
  for (let index = 0; index < expected.length; index++) {
    const child = expected[index]!;
    if (matchesStaticChild(child, actual[index]!, budget, depth + 1)) continue;
    if (isVNode(child) && patchStaticVNode(child, actual[index]!, budget, depth + 1)) continue;
    const replacement = createStaticNodeFromChild(child, undefined, budget, depth + 1);
    if (!replacement) return false;
    replaceNode(actual[index]!, replacement);
  }
  return true;
}

function matchesStaticChild(child: Child, node: Node, budget: StaticBudget, depth: number): boolean {
  if (isVNode(child)) return matchesStaticVNode(child, node, budget, depth);
  return node.nodeType === Node.TEXT_NODE && node.textContent === String(child ?? "");
}

function flattenStaticChildren(children: readonly Child[], budget: StaticBudget, depth: number): Child[] {
  const flattened: Child[] = [];
  for (const child of children) {
    visitStatic(budget, depth);
    if (!isRenderableStaticChild(child)) continue;
    if (isVNode(child) && child.type === Fragment) flattened.push(...flattenStaticChildren(child.children, budget, depth + 1));
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

function createStaticNodeFromChild(child: Child, parent: Element | undefined, budget: StaticBudget, depth: number): Node | undefined {
  if (isVNode(child)) return createStaticNode(child, parent, budget, depth);
  if (child === null || child === undefined || child === false || child === true) return undefined;
  return document.createTextNode(String(child));
}

function createStaticNode(vnode: VNode, parent: Element | undefined, budget: StaticBudget, depth: number): Node | undefined {
  if (depth > budget.maxDepth) throw new Error(`eXact hydration tree exceeds the configured maximum depth of ${budget.maxDepth}`);
  if (vnode.type === Text) return document.createTextNode(String(vnode.props.value ?? ""));
  if (typeof vnode.type !== "string") return undefined;
  const namespace = namespaceForTag(vnode.type, parent);
  const element = namespace && namespace !== "http://www.w3.org/1999/xhtml"
    ? document.createElementNS(namespace, vnode.type)
    : document.createElement(vnode.type);
  for (const [name, value] of Object.entries(vnode.props)) {
    if (name === "key" || name === "children") continue;
    if (name === "ref" || /^on[A-Z]/.test(name)) continue;
    if (value !== null && typeof value === "object" || typeof value === "function") return undefined;
    const attribute = name === "className" ? "class" : name;
    if (value === true) element.setAttribute(attribute, "");
    else if (value !== false && value !== null && value !== undefined) element.setAttribute(attribute, String(sanitizeUrlAttribute(name, value)));
  }
  for (const child of flattenStaticChildren(vnode.children, budget, depth + 1)) {
    const node = createStaticNodeFromChild(child, element, budget, depth + 1);
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
  const lifetime = new AbortController();
  const abortLifetime = () => lifetime.abort(resolvedOptions.signal?.reason);
  if (resolvedOptions.signal?.aborted) abortLifetime();
  else resolvedOptions.signal?.addEventListener("abort", abortLifetime, { once: true });
  const runtimeOptions: HydrateOptions = {
    ...resolvedOptions,
    endpoints: cloneEndpointRoutes(resolvedOptions.endpoints),
    stateContracts: { ...(resolvedOptions.stateContracts ?? {}) },
    actionBoundaries: { ...(resolvedOptions.actionBoundaries ?? {}) },
    islands: { ...(resolvedOptions.islands ?? {}) },
    transports: { ...(resolvedOptions.transports ?? {}) },
    signal: lifetime.signal
  };
  let disposed = false;
  const assertActive = () => { if (disposed) throw new Error("eXact hydration root has been disposed"); };
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
      assertActive();
      return applyPatches(container, patches, runtimeOptions);
    },
    invokeAction(id, payload) {
      assertActive();
      return invokeAndApply(container, client, "action", id, payload, runtimeOptions);
    },
    refreshBoundary(id, payload) {
      assertActive();
      return invokeAndApply(container, client, "refresh", id, payload, runtimeOptions);
    },
    async refreshIsland(id, registry, payload) {
      assertActive();
      mergeClientIslands(runtimeOptions, registry);
      return invokeAndApply(container, client, "refresh", id, payload, runtimeOptions);
    },
    registerManifest(config) {
      assertActive();
      mergeHydrationRegistration(runtimeOptions, config);
      if (config.islands) hydrateClientIslands(container, runtimeOptions.islands ?? {}, runtimeOptions);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      resolvedOptions.signal?.removeEventListener("abort", abortLifetime);
      lifetime.abort(new DOMException("eXact hydration root disposed", "AbortError"));
      roots.delete(container);
      container.removeAttribute("data-exact-hydrated");
      requestVersions.get(container)?.clear();
      unmount(container);
    }
  };
  return client;
}

type FormState = {
  node: Element;
  path: number[];
  identity?: { attribute: string; value: string };
  signature: string;
  value?: string;
  checked?: boolean;
  selected?: boolean[];
  selection?: { start: number | null; end: number | null; direction?: "forward" | "backward" | "none" | null };
  focused: boolean;
};

function captureHydrationDom(container: Element, work: DomWorkBudget): { formState: FormState[]; hasMarkers: boolean } {
  const active = document.activeElement;
  const controls: Element[] = [];
  let hasMarkers = false;
  walkDomSubtree(container, node => {
    if (node instanceof Comment && node.data.startsWith("exact:")) hasMarkers = true;
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement
      || node instanceof Element && node.getAttribute("contenteditable") === "true") controls.push(node);
  }, { budget: work });
  const formState = controls.flatMap(control => {
    const dirty = control instanceof HTMLInputElement
      ? control.value !== control.defaultValue || control.checked !== control.defaultChecked
      : control instanceof HTMLTextAreaElement
        ? control.value !== control.defaultValue
        : control instanceof HTMLSelectElement
          ? Array.from(control.options).some(option => option.selected !== option.defaultSelected)
          : control.textContent !== control.getAttribute("data-exact-ssr-text");
    if (!dirty && control !== active) return [];
    const state: FormState = {
      node: control,
      path: nodePath(container, control, work),
      identity: formControlIdentity(control),
      signature: formControlSignature(control),
      focused: control === active
    };
    if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
      state.value = control.value;
      if (control instanceof HTMLInputElement) state.checked = control.checked;
      state.selection = { start: control.selectionStart, end: control.selectionEnd, direction: control.selectionDirection };
    } else if (control instanceof HTMLSelectElement) {
      state.selected = Array.from(control.options, option => option.selected);
    } else state.value = control.textContent ?? "";
    return [state];
  });
  return { formState, hasMarkers };
}

function restoreFormState(container: Element, states: readonly FormState[], work: DomWorkBudget): void {
  if (!states.length) return;
  const identities = indexFormControlIdentities(container, work);
  for (const state of states) {
    const identityMatch = state.identity
      ? identities.get(`${state.identity.attribute}\0${state.identity.value}`)
      : undefined;
    const pathMatch = nodeAtPath(container, state.path, work);
    const retainedIdentity = container.contains(state.node)
      && (!state.identity || state.node.getAttribute(state.identity.attribute) === state.identity.value);
    const candidate = retainedIdentity ? state.node : identityMatch ?? pathMatch;
    const control = candidate instanceof Element && formControlSignature(candidate) === state.signature
      ? candidate
      : undefined;
    if (!(control instanceof Element)) continue;
    if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
      if (state.value !== undefined) control.value = state.value;
      if (control instanceof HTMLInputElement && state.checked !== undefined) control.checked = state.checked;
      if (state.focused) control.focus({ preventScroll: true });
      if (state.selection && state.selection.start !== null && state.selection.end !== null) {
        control.setSelectionRange(state.selection.start, state.selection.end, state.selection.direction ?? undefined);
      }
    } else if (control instanceof HTMLSelectElement && state.selected) {
      Array.from(control.options).forEach((option, index) => { option.selected = state.selected![index] ?? false; });
      if (state.focused) control.focus({ preventScroll: true });
    } else if (state.value !== undefined) {
      control.textContent = state.value;
      if (state.focused && control instanceof HTMLElement) control.focus({ preventScroll: true });
    }
  }
}

function formControlIdentity(element: Element): { attribute: string; value: string } | undefined {
  for (const attribute of ["data-exact-control-id", "data-exact-id", "id", "name"] as const) {
    const value = element.getAttribute(attribute);
    if (value) return { attribute, value };
  }
  return undefined;
}

function formControlSignature(element: Element): string {
  const type = element instanceof HTMLInputElement ? element.type : "";
  return `${element.namespaceURI ?? ""}|${element.localName}|${type}|${element.getAttribute("name") ?? ""}`;
}

function indexFormControlIdentities(container: Element, work: DomWorkBudget): Map<string, Element | undefined> {
  const identities = new Map<string, Element | undefined>();
  walkDomSubtree(container, node => {
    if (!(node instanceof Element)) return;
    for (const attribute of ["data-exact-control-id", "data-exact-id", "id", "name"] as const) {
      const value = node.getAttribute(attribute);
      if (!value) continue;
      const key = `${attribute}\0${value}`;
      identities.set(key, identities.has(key) ? undefined : node);
    }
  }, { budget: work });
  return identities;
}

function nodePath(root: Node, node: Node, work: DomWorkBudget): number[] {
  const path: number[] = [];
  for (let cursor: Node | null = node; cursor && cursor !== root; cursor = cursor.parentNode) {
    consumeDomWork(work);
    if (!cursor.parentNode) return [];
    path.unshift(Array.prototype.indexOf.call(cursor.parentNode.childNodes, cursor));
  }
  return path;
}

function nodeAtPath(root: Node, path: readonly number[], work: DomWorkBudget): Node | undefined {
  let cursor: Node | undefined = root;
  for (const index of path) { consumeDomWork(work); cursor = cursor?.childNodes[index]; }
  return cursor;
}

function remainingDomWork(work: DomWorkBudget): number {
  const remaining = work.limit - work.used;
  if (remaining <= 0) consumeDomWork(work);
  return remaining;
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
  const work = createDomWorkBudget(options.maxTreeNodes);
  let versions = requestVersions.get(container);
  if (!versions) { versions = new Map(); requestVersions.set(container, versions); }
  const configuredBoundaries = options.actionBoundaries?.[id];
  const requestKeys = [...new Set(type === "refresh"
    ? [`boundary:${id}`]
    : configuredBoundaries?.length
      ? configuredBoundaries.map(boundary => `boundary:${boundary}`)
      : [`action:${id}`])];
  const requestVersion = Math.max(0, ...requestKeys.map(key => versions!.get(key) ?? 0)) + 1;
  for (const key of requestKeys) versions.set(key, requestVersion);
  const requestOrdinal = (versions.get("request") ?? 0) + 1;
  versions.set("request", requestOrdinal);
  const operation: ExactInvocationRequest = {
    type,
    id,
    payload,
    state: type === "action" ? stateForContract(client.state, client.stateContracts?.[id]) : client.state,
    boundaryHtml: type === "refresh" ? boundaryInnerHtml(container, id, work) : undefined,
    boundaryHtmls: type === "action" ? boundaryHtmlsFor(container, options.actionBoundaries?.[id], work) : undefined
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
      stream: options.stream,
      streamLimits: options.streamLimits,
      signal: options.signal
    })
    : await enqueueExactOperation(container, {
      endpoint,
      operation,
      fetch: transport.fetch,
      headers: transport.headers,
      logger: options.logger,
      stream: options.stream,
      streamLimits: options.streamLimits,
      signal: options.signal
    });
  const staleKeys = new Set(requestKeys.filter(key => versions!.get(key) !== requestVersion));
  if (staleKeys.size === requestKeys.length) {
    options.onDiagnostic?.({
      code: "stale-response",
      message: `ignored stale exact ${type} response for ${id}`,
      patch: { type, id }
    });
    return result;
  }
  let responsePatches = result.patches;
  const partiallyStale = staleKeys.size > 0;
  if (partiallyStale && configuredBoundaries && responsePatches) {
    const rejected: string[] = [];
    const boundaryForPatch = createPatchBoundaryResolver(container, configuredBoundaries, work);
    responsePatches = responsePatches.filter(patch => {
      const owner = boundaryForPatch(patch.id);
      const accepted = owner !== undefined && !staleKeys.has(`boundary:${owner}`);
      if (!accepted) rejected.push(`${patch.type}:${patch.id}`);
      return accepted;
    });
    options.onDiagnostic?.({
      code: "stale-response",
      message: `partially ignored stale exact ${type} response for ${id}`
        + (rejected.length ? ` (${rejected.join(", ")})` : ""),
      patch: { type, id }
    });
  }
  const patchOptions = { ...options, workBudget: work };
  let patchesApplied = responsePatches ? applyPatches(container, responsePatches, patchOptions) : true;
  if (!patchesApplied && type === "refresh" && result.html) {
    patchesApplied = applyPatches(container, [{ type: "replace", id, html: result.html }], patchOptions);
  }
  if (!patchesApplied) {
    options.onDiagnostic?.({
      code: "invalid-patch",
      message: `rejected exact ${type} response for ${id}; DOM and state were left unchanged`,
      patch: { type, id }
    });
    return result;
  }
  if (responsePatches?.length && options.islands) hydrateClientIslands(container, options.islands, options);
  if (!partiallyStale && "state" in result && requestOrdinal >= (versions.get("state-committed") ?? 0)) {
    versions.set("state-committed", requestOrdinal);
    client.state = result.state;
  }
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

function boundaryHtmlsFor(container: Element, ids: readonly string[] | undefined, work: DomWorkBudget): Record<string, string> | undefined {
  if (!ids?.length) return undefined;
  const htmls = boundaryInnerHtmls(container, ids, work);
  return Object.keys(htmls).length ? htmls : undefined;
}
