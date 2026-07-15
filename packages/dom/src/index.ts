import {
  Cell,
  Dynamic,
  ErrorContext,
  Fragment,
  Portal,
  ServerSlot,
  Text,
  attemptCleanup,
  createCleanupFailure,
  createComponentInstance,
  createErrorContext,
  createErrorReport,
  createVNode,
  getCellVNode,
  handleComponentError,
  isCellVNode,
  isVNode,
  normalizeRenderResult,
  renderInstance,
  recordCleanupFailure,
  throwCleanupFailure,
  type Child,
  type Component,
  type ComponentFunction,
  type ComponentInstance,
  type ErrorContextValue,
  type ErrorReport,
  type RefBinding,
  type VNode,
  unwrap,
  watch
} from "@exact/core";
import { encodeExactMarkerPart } from "@exact/core";
import {
  createEffectScope,
  flushSync,
  withEffectScope,
  type EffectScope,
} from "@exact/reactive";
import {
  childToVNode,
  getComponentProps,
  getListBinding,
  materializeList,
  planChildReconciliation,
  stopRemovedListChildren,
  stopReplacedChildren
} from "./children.js";
import { preserveFocus } from "./focus.js";
import { describeNode, describeVNodeType, domDebug, formatError } from "./debug.js";
import { clearDelegated } from "./events.js";
import { clearElementOwner, setElementOwner } from "./ownership.js";
import { afterMountedChildren, lastMountedNode, placeMountedBefore } from "./placement.js";
import { applyDomProp, clearElementProps, updateProps } from "./props.js";
import { adoptServerSlot, mountServerSlot } from "./server-slots.js";
import { componentMounts, roots } from "./state.js";
import { namespaceForTag } from "./namespace.js";
import { consumeDomWork, walkDomSubtree, type DomWorkBudget } from "./work.js";
import type { Mounted, RenderOptions, Root } from "./types.js";
export {
  deg,
  em,
  fr,
  ms,
  percent,
  px,
  rad,
  rem,
  s,
  turn,
  vh,
  vmax,
  vmin,
  vw,
  type CssValue
} from "./style.js";

export type { RenderOptions } from "./types.js";
export { applyDomProp };
export { HTML_NAMESPACE, MATHML_NAMESPACE, SVG_NAMESPACE, namespaceForTag } from "./namespace.js";
export { DEFAULT_DOM_WORK_LIMIT, DomTraversalLimitError, consumeDomWork, createDomWorkBudget, reserveDomWork, walkDomSubtree, type DomWorkBudget } from "./work.js";

/** Returns the first host DOM node currently owned by an eXact component. */
export function findComponentDomNode(instance: ComponentInstance<any>): Node | null {
  const mounted = componentMounts.get(instance);
  return mounted ? firstHostNode(mounted) : null;
}

function firstHostNode(mounted: Mounted): Node | null {
  if (typeof mounted.vnode.type === "string" && mounted.dom instanceof Element) return mounted.dom;
  if (mounted.vnode.type === Text && mounted.dom.nodeType === Node.TEXT_NODE && mounted.dom.textContent !== "") return mounted.dom;
  for (const child of mounted.children) {
    const node = firstHostNode(child);
    if (node) return node;
  }
  return null;
}

function ownMountedInstance(mounted: Mounted, instance: ComponentInstance<any>): void {
  mounted.instance = instance;
  componentMounts.set(instance, mounted);
}

const DEFAULT_MAX_TREE_DEPTH = 512;
const HARD_MAX_TREE_DEPTH = 1_024;
const DEFAULT_MAX_TREE_NODES = 100_000;

class DomTreeDepthError extends Error {
  constructor(limit: number) {
    super(`eXact DOM tree exceeds the configured maximum depth of ${limit}`);
    this.name = "DomTreeDepthError";
  }
}

class DomTreeWorkError extends Error {
  constructor(limit: number) {
    super(`eXact DOM update exceeds the configured maximum of ${limit} render values`);
    this.name = "DomTreeWorkError";
  }
}

/** Renders or patches a vnode tree into a DOM container. */
export function render(vnode: VNode, container: Element, options: RenderOptions = {}): void {
  let root = roots.get(container);
  if (!root) {
    root = {
      container,
      delegated: new Map(),
      errors: createDomErrorContext(options), portalTargets: new Set(),
      current: vnode,
      version: 0,
      boundary: undefined as never,
      debugMarkers: false,
      maxTreeDepth: normalizeTreeDepth(options.maxTreeDepth),
      traversalDepth: 0,
      maxTreeNodes: normalizeTreeNodes(options.maxTreeNodes),
      traversedNodes: 0,
      workDepth: 0,
      workBudget: options.workBudget
    };
    root.boundary = createRootBoundary(root);
    roots.set(container, root);
  }
  root.current = vnode;
  root.version++;
  root.logger = options.logger;
  root.debugMarkers = options.debugMarkers ?? false;
  root.maxTreeDepth = normalizeTreeDepth(options.maxTreeDepth);
  root.maxTreeNodes = normalizeTreeNodes(options.maxTreeNodes);
  root.workBudget = options.workBudget;

  const next = root.mode === "hydrated"
    ? vnode
    : createVNode(root.boundary, { version: root.version });
  try {
    withDomWork(root, () => {
      root.mounted = patch(root, container, root.mounted, next, undefined, undefined);
      flushSync();
    });
  } finally {
    root.workBudget = undefined;
  }
}

/**
 * Disposes the renderer root attached to a container.
 *
 * All component scopes, reactive bindings, refs, ownership records, direct
 * listeners, and delegated root listeners are released before the DOM owned by
 * the root is removed. Returns false when the container has no active root.
 */
export function unmount(container: Element): boolean {
  return dispose(container, true);
}

/** Releases a renderer root, optionally retaining its current DOM for a server patch. */
export function dispose(container: Element, removeDom = false): boolean {
  const root = roots.get(container);
  if (!root) return false;

  // Delete first so lifecycle callbacks may safely render a fresh root into the
  // same container without the old root later deleting the replacement.
  roots.delete(container);
  const failure = teardownFailure();
  attemptTeardown(failure, () => clearDelegated(root));

  const mounted = root.mounted;
  root.mounted = undefined;
  if (mounted) {
    attemptTeardown(failure, () => unmountMounted(mounted));
    if (removeDom) attemptTeardown(failure, () => removeMountedNodes(container, mounted));
  }
  throwTeardownFailure(failure);
  return true;
}

/**
 * Releases renderer roots contained by a server-owned region before external
 * DOM replacement. Descendants are disposed deepest-first so nested island
 * roots cannot retain listeners, scopes, or ownership for detached nodes.
 */
export function disposeOwnedSubtree(container: Element, includeSelf = true, work?: number | DomWorkBudget): number {
  const candidates: Element[] = [];
  walkDomSubtree(container, node => {
    if (node instanceof Element && (includeSelf || node !== container)) candidates.push(node);
  }, typeof work === "number" ? { maxNodes: work } : { budget: work });
  let disposed = 0;
  const failure = teardownFailure();
  for (let index = candidates.length - 1; index >= 0; index--) {
    try { if (dispose(candidates[index]!, false)) disposed++; }
    catch (error) { recordTeardownFailure(failure, error); }
  }
  throwTeardownFailure(failure);
  return disposed;
}

/**
 * Attaches the renderer to an already-validated static SSR boundary.  Unlike a
 * validation-only hydration pass this creates the normal mounted graph, so a
 * later render patches the adopted nodes instead of appending a second tree.
 */
export function adoptStatic(vnode: VNode, container: Element, options: RenderOptions = {}): boolean {
  if (roots.has(container)) return true;
  const markers = boundaryMarkers(container);
  if (!markers) return false;

  const root: Root = {
    container,
    delegated: new Map(),
    errors: createDomErrorContext(options), portalTargets: new Set(),
    current: vnode,
    version: 1,
    boundary: undefined as never,
    debugMarkers: false,
    maxTreeDepth: normalizeTreeDepth(options.maxTreeDepth),
    traversalDepth: 0, maxTreeNodes: normalizeTreeNodes(options.maxTreeNodes), traversedNodes: 0, workDepth: 0,
    workBudget: options.workBudget,
    logger: options.logger
  };
  root.boundary = createRootBoundary(root);
  const scope = createEffectScope();
  const boundaryVNode = createVNode(root.boundary, { version: root.version });
  const mounted: Mounted = { vnode: boundaryVNode, dom: markers.start, end: markers.end, scope, children: [] };
  try {
    return withDomWork(root, () => {
      countDomWork(root);
      const instance = withEffectScope(scope, () => createComponentInstance(root.boundary, { version: root.version }));
      ownMountedInstance(mounted, instance);
      const rendered = withEffectScope(scope, () => renderInstance(instance, () => rerenderComponent(root, mounted)));
      const nodes = contentNodesBetween(markers.start, markers.end);
      const children = adoptStaticChildren(root, rendered, nodes, instance, scope);
      if (!children) {
        unmountMounted(mounted);
        clearDelegated(root);
        return false;
      }
      mounted.children = children;
      instance.markMounted();
      root.mounted = mounted;
      roots.set(container, root);
      return true;
    });
  } catch (error) {
    unmountMounted(mounted);
    clearDelegated(root);
    if (isDomRenderLimitError(error)) throw error;
    return false;
  } finally {
    root.workBudget = undefined;
  }
}

/** Adopts an SSR-root component boundary as the renderer root. */
export function adoptComponentRoot(vnode: VNode, container: Element, options: RenderOptions = {}): boolean {
  if (typeof vnode.type !== "function" || roots.has(container)) return false;
  const markers = boundaryMarkers(container);
  if (!markers || !markers.start.data.startsWith("exact:component:")) return false;
  const root: Root = {
    container, delegated: new Map(), errors: createDomErrorContext(options), portalTargets: new Set(), current: vnode,
    version: 1, boundary: undefined as never, debugMarkers: false,
    maxTreeDepth: normalizeTreeDepth(options.maxTreeDepth), traversalDepth: 0,
    maxTreeNodes: normalizeTreeNodes(options.maxTreeNodes), traversedNodes: 0, workDepth: 0,
    workBudget: options.workBudget,
    logger: options.logger, mode: "hydrated"
  };
  root.boundary = createRootBoundary(root);
  const scope = createEffectScope();
  const mounted: Mounted = { vnode, dom: markers.start, end: markers.end, scope, children: [] };
  try {
    return withDomWork(root, () => {
      countDomWork(root);
      const instance = withEffectScope(scope, () => createComponentInstance(
        vnode.type as ComponentFunction<any, Record<string, unknown>>, getComponentProps(vnode)
      ));
      ownMountedInstance(mounted, instance);
      const rendered = withEffectScope(scope, () => renderInstance(instance, () => rerenderComponent(root, mounted)));
      const children = adoptStaticChildren(root, rendered, contentNodesBetween(markers.start, markers.end), instance, scope);
      if (!children) { unmountMounted(mounted); clearDelegated(root); return false; }
      mounted.children = children;
      instance.markMounted();
      root.mounted = mounted;
      roots.set(container, root);
      return true;
    });
  } catch (error) {
    unmountMounted(mounted);
    clearDelegated(root);
    if (isDomRenderLimitError(error)) throw error;
    return false;
  } finally {
    root.workBudget = undefined;
  }
}

/** Adopts a component root whose server markup intentionally omits eXact markers.
 *
 * Invisible text anchors establish the range required by the mounted renderer
 * without changing serialized HTML. This is primarily used by compatibility
 * layers whose public server output cannot expose eXact's marker protocol.
 */
export function adoptMarkerlessComponentRoot(vnode: VNode, container: Element, options: RenderOptions = {}): boolean {
  if (typeof vnode.type !== "function" || roots.has(container)) return false;
  const start = document.createTextNode("");
  const end = document.createTextNode("");
  container.insertBefore(start, container.firstChild);
  container.appendChild(end);
  const root: Root = {
    container, delegated: new Map(), errors: createDomErrorContext(options), portalTargets: new Set(), current: vnode,
    version: 1, boundary: undefined as never, debugMarkers: false,
    maxTreeDepth: normalizeTreeDepth(options.maxTreeDepth), traversalDepth: 0,
    maxTreeNodes: normalizeTreeNodes(options.maxTreeNodes), traversedNodes: 0, workDepth: 0,
    workBudget: options.workBudget,
    logger: options.logger, mode: "hydrated", markerlessHydration: true
  };
  root.boundary = createRootBoundary(root);
  const scope = createEffectScope();
  const mounted: Mounted = { vnode, dom: start, end, scope, children: [] };
  try {
    return withDomWork(root, () => {
      countDomWork(root);
      const instance = withEffectScope(scope, () => createComponentInstance(
        vnode.type as ComponentFunction<any, Record<string, unknown>>, getComponentProps(vnode)
      ));
      ownMountedInstance(mounted, instance);
      const rendered = withEffectScope(scope, () => renderInstance(instance, () => rerenderComponent(root, mounted)));
      const children = adoptStaticChildren(root, rendered, contentNodesBetween(start, end), instance, scope);
      if (!children) {
        unmountMounted(mounted);
        clearDelegated(root);
        throw new Error("markerless root children did not adopt");
      }
      mounted.children = children;
      instance.markMounted();
      root.mounted = mounted;
      roots.set(container, root);
      return true;
    });
  } catch (error) {
    unmountMounted(mounted);
    clearDelegated(root);
    if (isDomRenderLimitError(error)) throw error;
    return false;
  } finally {
    root.workBudget = undefined;
    if (!roots.has(container)) {
      start.remove();
      end.remove();
    }
  }
}

function boundaryMarkers(container: Element): { start: Comment; end: Comment } | undefined {
  const comments = Array.from(container.childNodes).filter((node): node is Comment => node.nodeType === Node.COMMENT_NODE);
  const start = comments.find(node => node.data.startsWith("exact:"));
  if (!start) return undefined;
  const end = comments.find(node => node.data === `/${start.data}`);
  return end ? { start, end } : undefined;
}

function contentNodesBetween(start: Node, end: Node): Node[] {
  const nodes: Node[] = [];
  for (let current = start.nextSibling; current && current !== end; current = current.nextSibling) nodes.push(current);
  return nodes;
}

function adoptStaticChildren(
  root: Root,
  children: Child[],
  nodes: readonly Node[],
  parentInstance: ComponentInstance<any>,
  parentScope: EffectScope
): Mounted[] | undefined {
  return adoptStaticChildrenRange(root, children, nodes, parentInstance, parentScope, true)?.mounts;
}

function adoptStaticChildrenRange(
  root: Root,
  children: Child[],
  nodes: readonly Node[],
  parentInstance: ComponentInstance<any>,
  parentScope: EffectScope,
  requireAll: boolean
): { mounts: Mounted[]; next: number } | undefined {
  const vnodes = children.map(childToVNode).filter((child): child is VNode => !!child);
  const mounts: Mounted[] = [];
  let cursor = 0;
  for (const child of vnodes) {
    const result = adoptStaticMounted(root, child, nodes, cursor, parentInstance, parentScope);
    if (!result) {
      unmountMany(mounts);
      return undefined;
    }
    mounts.push(result.mounted);
    cursor = result.next;
  }
  if (requireAll && cursor !== nodes.length) {
    unmountMany(mounts);
    return undefined;
  }
  return { mounts, next: cursor };
}

function adoptStaticMounted(
  root: Root,
  vnode: VNode,
  nodes: readonly Node[],
  cursor: number,
  parentInstance: ComponentInstance<any>,
  parentScope: EffectScope
): { mounted: Mounted; next: number } | undefined {
  return withTreeDepth(root, () => {
    countDomWork(root);
    return adoptStaticMountedInner(root, vnode, nodes, cursor, parentInstance, parentScope);
  });
}

function adoptStaticMountedInner(
  root: Root,
  vnode: VNode,
  nodes: readonly Node[],
  cursor: number,
  parentInstance: ComponentInstance<any>,
  parentScope: EffectScope
): { mounted: Mounted; next: number } | undefined {
  const scope = createEffectScope(parentScope);
  if (typeof vnode.type === "function") {
    if (root.markerlessHydration) {
      const mounted: Mounted = { vnode, dom: undefined as never, scope, children: [] };
      try {
        const instance = withEffectScope(scope, () => createComponentInstance(
          vnode.type as ComponentFunction<any, Record<string, unknown>>, getComponentProps(vnode), parentInstance
        ));
        ownMountedInstance(mounted, instance);
        const rendered = withEffectScope(scope, () => renderInstance(instance, () => rerenderComponent(root, mounted)));
        const adopted = adoptStaticChildrenRange(root, rendered, nodes.slice(cursor), instance, scope, false);
        if (!adopted || !adopted.mounts.length) { unmountMounted(mounted); throw new Error(`markerless component ${describeVNodeType(vnode.type)} children did not adopt`); }
        const first = adopted.mounts[0]!.dom;
        const lastMount = adopted.mounts[adopted.mounts.length - 1]!;
        const last = lastMount.end ?? lastMount.dom;
        const parent = first.parentNode;
        if (!parent || last.parentNode !== parent) { unmountMany(adopted.mounts); unmountMounted(mounted); throw new Error(`markerless component ${describeVNodeType(vnode.type)} range is disconnected`); }
        const start = document.createTextNode("");
        const end = document.createTextNode("");
        parent.insertBefore(start, first);
        parent.insertBefore(end, last.nextSibling);
        mounted.dom = start;
        mounted.end = end;
        mounted.children = adopted.mounts;
        instance.markMounted();
        return { mounted, next: cursor + adopted.next };
      } catch (error) {
        unmountMounted(mounted);
        throw error;
      }
    }
    const start = nodes[cursor];
    if (!(start instanceof Comment) || !start.data.startsWith("exact:component:")) { scope.stop(); return undefined; }
    const endIndex = nodes.findIndex((node, index) => index > cursor && node instanceof Comment && node.data === `/${start.data}`);
    if (endIndex < 0) { scope.stop(); return undefined; }
    const mounted: Mounted = { vnode, dom: start, end: nodes[endIndex]!, scope, children: [] };
    try {
      const instance = withEffectScope(scope, () => createComponentInstance(
        vnode.type as ComponentFunction<any, Record<string, unknown>>, getComponentProps(vnode), parentInstance
      ));
      ownMountedInstance(mounted, instance);
      const rendered = withEffectScope(scope, () => renderInstance(instance, () => rerenderComponent(root, mounted)));
      const children = adoptStaticChildren(root, rendered, nodes.slice(cursor + 1, endIndex), instance, scope);
      if (!children) { unmountMounted(mounted); return undefined; }
      mounted.children = children;
      instance.markMounted();
      return { mounted, next: endIndex + 1 };
    } catch {
      unmountMounted(mounted);
      return undefined;
    }
  }
  if (isCellVNode(vnode) || vnode.type === Dynamic) {
    const kind = isCellVNode(vnode) ? "cell" : "dynamic";
    const start = nodes[cursor];
    if (!(start instanceof Comment) || !start.data.startsWith(`exact:${kind}:`)) { scope.stop(); return undefined; }
    const endIndex = nodes.findIndex((node, index) => index > cursor && node instanceof Comment && node.data === `/${start.data}`);
    if (endIndex < 0) { scope.stop(); return undefined; }
    const end = nodes[endIndex] as Comment;
    const mounted: Mounted = { vnode, dom: start, end, scope, children: [] };
    const initial = isCellVNode(vnode)
      ? [getCellVNode(vnode)]
      : normalizeRenderResult(unwrap(vnode.props.value) as Child | Child[]);
    const children = adoptStaticChildren(root, initial, nodes.slice(cursor + 1, endIndex), parentInstance, scope);
    if (!children) { scope.stop(); return undefined; }
    mounted.children = children;
    if (isCellVNode(vnode)) {
      // Cells are patched by their owning component render; their marker range
      // still provides stable DOM ownership during hydration.
      return { mounted, next: endIndex + 1 };
    }
    const value = vnode.props.value;
    mounted.stop = watch(() => {
      const nextChildren = normalizeRenderResult(unwrap(value) as Child | Child[]);
      const parent = start.parentNode;
      if (!parent) return;
      mounted.children = patchChildren(root, parent, mounted.children, nextChildren, parentInstance, scope, afterMountedChildren(mounted));
    }, undefined, { scope, onSchedule: () => stopReplacedChildren(mounted, normalizeRenderResult(unwrap(value) as Child | Child[])) });
    return { mounted, next: endIndex + 1 };
  }
  if (vnode.type === Fragment) {
    const start = nodes[cursor];
    const list = getListBinding(vnode);
    const isListMarker = list && start instanceof Comment && start.data.startsWith("exact:");
    if (!(start instanceof Comment) || !start.data.startsWith("exact:fragment:") && !isListMarker) {
      const adopted = adoptStaticChildrenRange(root, vnode.children, nodes.slice(cursor), parentInstance, scope, false);
      if (!adopted) { scope.stop(); return undefined; }
      const children = adopted.mounts;
      const marker = document.createTextNode("");
      const first = nodes[cursor];
      if (!first?.parentNode) { scope.stop(); return undefined; }
      first.parentNode.insertBefore(marker, first);
      return { mounted: { vnode, dom: marker, scope, children }, next: cursor + adopted.next };
    }
    const endIndex = nodes.findIndex((node, index) => index > cursor && node instanceof Comment && node.data === `/${start.data}`);
    if (endIndex < 0) { scope.stop(); return undefined; }
    const children = list
      ? adoptKeyedListChildren(root, materializeList(list), nodes.slice(cursor + 1, endIndex), parentInstance, scope)
      : adoptStaticChildren(root, vnode.children, nodes.slice(cursor + 1, endIndex), parentInstance, scope);
    if (!children) { scope.stop(); return undefined; }
    const mounted: Mounted = { vnode, dom: start, end: nodes[endIndex]!, scope, children };
    if (list) {
      mounted.stop = watch(() => {
        const parent = start.parentNode;
        if (!parent) return;
        mounted.children = patchChildren(root, parent, mounted.children, materializeList(list), parentInstance, scope, afterMountedChildren(mounted));
      }, undefined, { scope, onSchedule: () => stopRemovedListChildren(mounted, list) });
    }
    return { mounted, next: endIndex + 1 };
  }
  const node = nodes[cursor];
  if (!node) { scope.stop(); return undefined; }
  if (vnode.type === Text) {
    if (node.nodeType !== Node.TEXT_NODE || node.textContent !== String(vnode.props.value ?? "")) { scope.stop(); return undefined; }
    const separator = root.markerlessHydration && nodes[cursor + 1] instanceof Comment && (nodes[cursor + 1] as Comment).data === " "
      ? nodes[cursor + 1]
      : undefined;
    return { mounted: { vnode, dom: node, ...(separator ? { end: separator } : {}), scope, children: [] }, next: cursor + (separator ? 2 : 1) };
  }
  if (typeof vnode.type !== "string" || !(node instanceof Element) || node.tagName.toLowerCase() !== vnode.type.toLowerCase()) {
    scope.stop();
    return undefined;
  }
  const children = adoptStaticChildren(root, vnode.children, Array.from(node.childNodes), parentInstance, scope);
  if (!children) { scope.stop(); return undefined; }
  setElementOwner(node, parentInstance);
  updateProps(root, node, {}, vnode.props, scope);
  return { mounted: { vnode, dom: node, scope, children }, next: cursor + 1 };
}

function adoptKeyedListChildren(
  root: Root, vnodes: VNode[], nodes: readonly Node[], parentInstance: ComponentInstance<any>, parentScope: EffectScope
): Mounted[] | undefined {
  const mounts: Mounted[] = [];
  let cursor = 0;
  for (const vnode of vnodes) {
    const start = nodes[cursor];
    const key = vnode.key;
    if (key === undefined || !(start instanceof Comment) || !isItemMarkerForKey(start.data, key)) {
      unmountMany(mounts);
      return undefined;
    }
    const endIndex = nodes.findIndex((node, index) => index > cursor && node instanceof Comment && node.data === `/${start.data}`);
    if (endIndex < 0) {
      unmountMany(mounts);
      return undefined;
    }
    const adopted = adoptStaticMounted(root, vnode, nodes.slice(cursor + 1, endIndex), 0, parentInstance, parentScope);
    if (!adopted || adopted.next !== endIndex - cursor - 1) {
      unmountMany(adopted ? [adopted.mounted, ...mounts] : mounts);
      return undefined;
    }
    mounts.push({ vnode, dom: start, end: nodes[endIndex]!, range: "item", scope: createEffectScope(parentScope), children: [adopted.mounted] });
    cursor = endIndex + 1;
  }
  if (cursor !== nodes.length) {
    unmountMany(mounts);
    return undefined;
  }
  return mounts;
}

function isItemMarkerForKey(marker: string, key: string): boolean {
  if (!marker.startsWith("exact:item:")) return false;
  const encoded = marker.slice("exact:item:".length);
  const safe = encodeExactMarkerPart(key);
  return encoded === key || encoded === safe || encoded.endsWith(`:${key}`) || encoded.endsWith(`:${safe}`);
}

function createRootBoundary(root: Root): ComponentFunction<{}, { version: number }> {
  return function RootBoundary(this: Component<{}>, props: { version: number }) {
    this.setContext(ErrorContext, root.errors);

    return () => {
      void props.version;
      return root.errors.errors.length
        ? createRootErrorView(root.errors.errors)
        : root.current;
    };
  };
}

function createDomErrorContext(options: RenderOptions): ErrorContextValue {
  const base = createErrorContext();
  if (!options.onErrorReport) return base;
  return {
    ...base,
    report(error, reportOptions) {
      const report = base.report(error, reportOptions);
      options.onErrorReport?.(report);
      return report;
    }
  };
}

function createRootErrorView(errors: ErrorReport[]): VNode {
  const reports: ErrorReport[] = [];
  for (let index = 0; index < errors.length; index++) {
    reports.push(errors[index]!);
  }
  return createVNode(
    "section",
    { role: "alert", className: "exact-error-boundary" },
    createVNode("h1", null, "Application error"),
    ...reports.map(error => createVNode(
      "article",
      { key: error.id, className: "exact-error" },
      createVNode("h2", null, error.component?.name ?? "Application"),
      createVNode("p", null, `${error.source}${error.phase ? `:${error.phase}` : ""}`),
      createVNode("pre", null, formatError(error.error))
    ))
  );
}

function createMarker(root: Root, label: "cell" | "component" | "dynamic" | "fragment" | "portal"): Node {
  return root.debugMarkers
    ? document.createComment(`exact-${label}`)
    : document.createTextNode("");
}

function createElement(tag: string, parent?: Node, props?: Record<string, unknown>): Element {
  const parentElement = parent instanceof Element ? parent : undefined;
  const namespace = namespaceForTag(tag, parentElement);
  const element = namespace ? document.createElementNS(namespace, tag) : document.createElement(tag);
  // annotation-xml's encoding determines the namespace of its children, so it
  // must exist before child elements are constructed.
  if (namespace === "http://www.w3.org/1998/Math/MathML" && tag === "annotation-xml"
    && typeof props?.encoding === "string") element.setAttribute("encoding", props.encoding);
  return element;
}

function mount(root: Root, vnode: VNode, parentInstance?: ComponentInstance<any>, parentScope?: EffectScope, parentNode?: Node, countWork = true): Mounted {
  return withTreeDepth(root, () => {
    if (countWork) countDomWork(root);
    const scope = createEffectScope(parentScope);
    try {
      return mountInner(root, vnode, scope, parentInstance, parentNode);
    } catch (error) {
      scope.stop();
      throw error;
    }
  });
}

function mountInner(root: Root, vnode: VNode, scope: EffectScope, parentInstance?: ComponentInstance<any>, parentNode?: Node): Mounted {
  if (isCellVNode(vnode)) {
    const marker = createMarker(root, "cell");
    const mounted: Mounted = { vnode, dom: marker, scope, children: [] };
    mounted.children = mountDetachedChildren(root, [getCellVNode(vnode)], parentInstance, mounted.scope, parentNode);
    return mounted;
  }

  if (vnode.type === Text) {
    const node = document.createTextNode("");
    const mounted: Mounted = { vnode, dom: node, scope, children: [] };
    bindText(mounted, vnode.props.value);
    return mounted;
  }

  if (vnode.type === Fragment) {
    const marker = createMarker(root, "fragment");
    const mounted: Mounted = { vnode, dom: marker, scope, children: [] };
    const list = getListBinding(vnode);
    mounted.children = list
      ? mountDetachedChildren(root, materializeList(list), parentInstance, mounted.scope, parentNode)
      : mountDetachedChildren(root, vnode.children, parentInstance, mounted.scope, parentNode);
    if (list) {
      mounted.stop = watch(() => {
        const nextChildren = materializeList(list);
        const parent = marker.parentNode;
        if (!parent) return;
        mounted.children = patchChildren(root, parent, mounted.children, nextChildren, parentInstance, mounted.scope, afterMountedChildren(mounted));
      }, undefined, {
        scope: mounted.scope,
        onSchedule: () => stopRemovedListChildren(mounted, list)
      });
    }
    return mounted;
  }

  if (vnode.type === Dynamic) {
    const marker = createMarker(root, "dynamic");
    const mounted: Mounted = { vnode, dom: marker, scope, children: [] };
    const value = vnode.props.value;
    mounted.children = mountDetachedChildren(root, normalizeRenderResult(unwrap(value) as Child | Child[]), parentInstance, mounted.scope, parentNode);
    mounted.stop = watch(() => {
      const nextChildren = normalizeRenderResult(unwrap(value) as Child | Child[]);
      const parent = marker.parentNode;
      if (!parent) return;
      mounted.children = patchChildren(
        root,
        parent,
        mounted.children,
        nextChildren,
        parentInstance,
        mounted.scope,
        afterMountedChildren(mounted)
      );
    }, undefined, {
      scope: mounted.scope,
      onSchedule: () => stopReplacedChildren(mounted, normalizeRenderResult(unwrap(value) as Child | Child[]))
    });
    return mounted;
  }

  if (vnode.type === Portal) {
    const marker = createMarker(root, "portal");
    const target = portalTarget(vnode);
    const mounted: Mounted = { vnode, dom: marker, scope, children: [], portalTarget: target };
    const eventContainer = portalEventContainer(root, target);
    if (eventContainer === target) root.portalTargets.add(target);
    mounted.children = withEventContainer(root, eventContainer, () => mountChildren(root, target, vnode.children, parentInstance, mounted.scope));
    return mounted;
  }

  if (vnode.type === ServerSlot) {
    return mountServerSlot(root, vnode, scope);
  }

  if (typeof vnode.type === "function") {
    const wrapper = createMarker(root, "component");
    const mounted: Mounted = { vnode, dom: wrapper, scope, children: [] };
    let constructing = true;
    let invalidatedDuringConstruction = false;
    const invalidate = () => {
      if (constructing) {
        invalidatedDuringConstruction = true;
        return;
      }
      rerenderComponent(root, mounted);
    };
    try {
      const instance = withEffectScope(mounted.scope, () => createComponentInstance(
          vnode.type as ComponentFunction<any, Record<string, unknown>>,
          getComponentProps(vnode),
          parentInstance
        ));
      ownMountedInstance(mounted, instance);
      const rendered = withEffectScope(mounted.scope, () => renderInstance(instance, invalidate));
      mounted.children = mountDetachedChildren(root, rendered, instance, mounted.scope, parentNode);
      instance.markMounted();
    } catch (error) {
      if (isDomRenderLimitError(error)) throw error;
      const fallback = handleComponentError(
        parentInstance,
        createErrorReport(error, "construct", parentInstance, describeVNodeType(vnode.type))
      );
      mounted.children = fallback
        ? mountDetachedChildren(root, normalizeRenderResult(fallback()), parentInstance, mounted.scope, parentNode)
        : [];
    }
    constructing = false;
    if (invalidatedDuringConstruction) mounted.afterPlacement = () => {
      if (mounted.scope.active) rerenderComponent(root, mounted);
    };
    return mounted;
  }

  const element = createElement(vnode.type as string, parentNode, vnode.props);
  const mounted: Mounted = { vnode, dom: element, scope, children: [] };
  if (parentInstance) setElementOwner(element, parentInstance);
  mounted.children = mountChildren(root, element, vnode.children, parentInstance, mounted.scope);
  updateProps(root, element, {}, vnode.props, mounted.scope);
  return mounted;
}

function patch(
  root: Root,
  parent: Node,
  mounted: Mounted | undefined,
  next: VNode,
  parentInstance?: ComponentInstance<any>,
  parentScope?: EffectScope
): Mounted {
  return withTreeDepth(root, () => {
    countDomWork(root);
    return patchInner(root, parent, mounted, next, parentInstance, parentScope);
  });
}

function patchInner(
  root: Root,
  parent: Node,
  mounted: Mounted | undefined,
  next: VNode,
  parentInstance?: ComponentInstance<any>,
  parentScope?: EffectScope
): Mounted {
  if (!mounted) {
    const created = mount(root, next, parentInstance, parentScope, parent, false);
    placeMountedBefore(root, parent, created, null);
    return created;
  }

  // Pre-patch ownership hooks may stop a subtree before DOM mutation (for
  // example to release pointer capture). A stopped wrapper must be replaced as
  // a unit; recursing through it would attempt to parent new scopes beneath an
  // inactive scope.
  if (!mounted.scope.active) {
    const replacement = mount(root, next, parentInstance, parentScope, parent, false);
    placeMountedBefore(root, parent, replacement, mounted.dom);
    disposeMounted(parent, mounted);
    return replacement;
  }

  if (mounted.vnode.type !== next.type || mounted.vnode.key !== next.key) {
    domDebug(root, "replace node", {
      previousType: describeVNodeType(mounted.vnode.type),
      previousKey: mounted.vnode.key ?? "none",
      nextType: describeVNodeType(next.type),
      nextKey: next.key ?? "none",
      parent: describeNode(parent)
    });
    const replacement = mount(root, next, parentInstance, parentScope, parent, false);
    placeMountedBefore(root, parent, replacement, mounted.dom);
    disposeMounted(parent, mounted);
    return replacement;
  }

  // SSR keyed item markers wrap an otherwise ordinary vnode. Keep the marker
  // range as the identity/move unit while delegating the actual patch to its
  // adopted child.
  if (mounted.range === "item") {
    mounted.vnode = next;
    const child = mounted.children[0];
    if (child) {
      mounted.children = [patch(root, parent, child, next, parentInstance, mounted.scope)];
    } else {
      const created = mount(root, next, parentInstance, mounted.scope, parent, false);
      mounted.children = [created];
      placeMountedBefore(root, parent, created, mounted.end);
    }
    return mounted;
  }

  if (isCellVNode(next)) {
    mounted.vnode = next;
    const nextChild = getCellVNode(next);
    const previousChild = mounted.children[0];
    if (previousChild) {
      mounted.children = [patch(root, parent, previousChild, nextChild, parentInstance, mounted.scope)];
    } else {
      const child = mount(root, nextChild, parentInstance, mounted.scope, parent, false);
      mounted.children = [child];
      placeMountedBefore(root, parent, child, mounted.dom.nextSibling);
    }
    return mounted;
  }

  if (next.type === Text) {
    mounted.vnode = next;
    bindText(mounted, next.props.value);
    return mounted;
  }

  if (next.type === Fragment) {
    const previousList = getListBinding(mounted.vnode);
    const nextList = getListBinding(next);
    mounted.vnode = next;
    if (previousList !== nextList) {
      mounted.stop?.();
      mounted.stop = undefined;
      mounted.children = patchChildren(
        root,
        parent,
        mounted.children,
        nextList ? materializeList(nextList) : next.children,
        parentInstance,
        mounted.scope,
        afterMountedChildren(mounted)
      );
      if (nextList) {
        mounted.stop = watch(() => {
          mounted.children = patchChildren(
            root,
            mounted.dom.parentNode ?? parent,
            mounted.children,
            materializeList(nextList),
            parentInstance,
            mounted.scope,
            afterMountedChildren(mounted)
          );
        }, undefined, {
          scope: mounted.scope,
          onSchedule: () => stopRemovedListChildren(mounted, nextList)
        });
      }
    } else if (!nextList) {
      mounted.children = patchChildren(root, parent, mounted.children, next.children, parentInstance, mounted.scope, afterMountedChildren(mounted));
    }
    return mounted;
  }

  if (next.type === Dynamic) {
    mounted.vnode = next;
    const value = next.props.value;
    mounted.stop?.();
    mounted.children = patchChildren(
      root,
      parent,
      mounted.children,
      normalizeRenderResult(unwrap(value) as Child | Child[]),
      parentInstance,
      mounted.scope,
      afterMountedChildren(mounted)
    );
    mounted.stop = watch(() => {
      const nextChildren = normalizeRenderResult(unwrap(value) as Child | Child[]);
      mounted.children = patchChildren(
        root,
        mounted.dom.parentNode ?? parent,
        mounted.children,
        nextChildren,
        parentInstance,
        mounted.scope,
        afterMountedChildren(mounted)
      );
    }, undefined, {
      scope: mounted.scope,
      onSchedule: () => stopReplacedChildren(mounted, normalizeRenderResult(unwrap(value) as Child | Child[]))
    });
    return mounted;
  }

  if (next.type === Portal) {
    const previousTarget = mounted.portalTarget ?? portalTarget(mounted.vnode);
    const nextTarget = portalTarget(next);
    mounted.vnode = next;
    if (previousTarget !== nextTarget) {
      mounted.children = patchChildren(root, previousTarget, mounted.children, [], parentInstance, mounted.scope);
      mounted.portalTarget = nextTarget;
      const eventContainer = portalEventContainer(root, nextTarget);
      if (eventContainer === nextTarget) root.portalTargets.add(nextTarget);
      mounted.children = withEventContainer(root, eventContainer, () => mountChildren(root, nextTarget, next.children, parentInstance, mounted.scope));
    } else {
      mounted.children = withEventContainer(root, portalEventContainer(root, nextTarget), () => patchChildren(root, nextTarget, mounted.children, next.children, parentInstance, mounted.scope));
    }
    return mounted;
  }

  if (next.type === ServerSlot) {
    mounted.vnode = next;
    if (mounted.dom instanceof Element && mounted.dom.getAttribute("data-exact-server-slot") === String(next.props.id ?? "")) {
      return mounted;
    }
    const replacement = mountServerSlot(root, next, mounted.scope);
    placeMountedBefore(root, parent, replacement, mounted.dom);
    disposeMounted(parent, mounted);
    return replacement;
  }

  if (typeof next.type === "function") {
    mounted.vnode = next;
    mounted.instance?.updateProps(getComponentProps(next));
    return mounted;
  }

  const previousProps = mounted.vnode.props;
  mounted.vnode = next;
  mounted.children = patchChildren(root, mounted.dom, mounted.children, next.children, parentInstance, mounted.scope);
  updateProps(root, mounted.dom as Element, previousProps, next.props, mounted.scope);
  return mounted;
}

function mountDetachedChildren(root: Root, children: Child[], parentInstance?: ComponentInstance<any>, parentScope?: EffectScope, parentNode?: Node): Mounted[] {
  assertUniqueChildKeys(children);
  const mounted: Mounted[] = [];
  for (const child of children) {
    const vnode = childToVNode(child);
    if (!vnode) { countDomWork(root); continue; }
    mounted.push(mount(root, vnode, parentInstance, parentScope, parentNode));
  }
  return mounted;
}

function portalTarget(vnode: VNode): Node {
  const target = vnode.props.target;
  if (!(target instanceof Node)) throw new TypeError("An eXact portal target must be a DOM Node");
  return target;
}

function withEventContainer<T>(root: Root, container: Node, run: () => T): T {
  const previous = root.eventContainer;
  root.eventContainer = container;
  try { return run(); }
  finally { root.eventContainer = previous; }
}

function portalEventContainer(root: Root, target: Node): Node {
  return root.container === target || root.container.contains(target) ? root.container : target;
}

function mountChildren(root: Root, parent: Node, children: Child[], parentInstance?: ComponentInstance<any>, parentScope?: EffectScope): Mounted[] {
  assertUniqueChildKeys(children);
  const mounted: Mounted[] = [];
  for (const child of children) {
    const vnode = childToVNode(child);
    if (!vnode) { countDomWork(root); continue; }
    const childMounted = mount(root, vnode, parentInstance, parentScope, parent);
    if (vnode.type === ServerSlot) adoptServerSlot(parent, childMounted);
    mounted.push(childMounted);
    placeMountedBefore(root, parent, childMounted, null);
  }
  return mounted;
}

function assertUniqueChildKeys(children: Child[]): void {
  const keys = new Set<string>();
  for (const child of children) {
    const vnode = childToVNode(child);
    if (!vnode || vnode.key === undefined) continue;
    if (keys.has(vnode.key)) throw new Error(`Duplicate key "${vnode.key}" in rendered children`);
    keys.add(vnode.key);
  }
}

function patchChildren(
  root: Root,
  parent: Node,
  oldChildren: Mounted[],
  nextChildren: Child[],
  parentInstance?: ComponentInstance<any>,
  parentScope?: EffectScope,
  before?: Node | null
): Mounted[] {
  domDebug(root, "patch children", {
    parent: describeNode(parent),
    oldCount: oldChildren.length,
    nextCount: nextChildren.length,
    before: describeNode(before)
  });
  // DOM writes for form controls can disturb the active element; patch inside the
  // focus-preservation helper so reorders and reactive updates stay ergonomic.
  return withDomWork(root, () => preserveFocus(root, () => {
    for (const child of nextChildren) if (!childToVNode(child)) countDomWork(root);
    return patchChildrenInner(root, parent, oldChildren, nextChildren, parentInstance, parentScope, before);
  }));
}

function patchChildrenInner(
  root: Root,
  parent: Node,
  oldChildren: Mounted[],
  nextChildren: Child[],
  parentInstance?: ComponentInstance<any>,
  parentScope?: EffectScope,
  before?: Node | null
): Mounted[] {
  const nextVNodes = nextChildren
    .map(childToVNode)
    .filter((vnode): vnode is VNode => !!vnode);
  const nextKeys = new Set<string>();
  for (const vnode of nextVNodes) {
    if (vnode.key === undefined) continue;
    if (nextKeys.has(vnode.key)) throw new Error(`Duplicate key "${vnode.key}" in rendered children`);
    nextKeys.add(vnode.key);
  }
  const plan = planChildReconciliation(oldChildren, nextVNodes);
  const keyedOldOrder = nextVNodes.map((vnode, index) => {
    if (vnode.key === undefined) return -1;
    const previous = plan.matches[index];
    return previous && previous.vnode.type === vnode.type ? plan.oldKeyIndices.get(vnode.key)! : -1;
  });
  const stableKeyedPositions = longestIncreasingSubsequencePositions(keyedOldOrder);
  const nextMounted: Mounted[] = [];
  let cursor = before ?? null;

  // Walk from the end so each placed node can use the already-positioned next
  // sibling as its insertion anchor. This keeps keyed moves deterministic.
  for (let index = nextVNodes.length - 1; index >= 0; index--) {
    const vnode = nextVNodes[index]!;
    const old = plan.matches[index];
    const patched = patch(root, parent, old, vnode, parentInstance, parentScope);
    if (vnode.type === ServerSlot) adoptServerSlot(parent, patched);
    nextMounted.unshift(patched);
    // Unkeyed children are reconciled positionally. A matching unkeyed mount
    // is already in the correct relative position; moving it merely because a
    // sibling was inserted can reorder it around fragment anchors. Apart from
    // producing visibly unstable lists, that detaches pointer-captured nodes
    // in browsers and ends active drags. Keyed children retain the LIS move
    // pass, while only genuinely new unkeyed children need placement here.
    if (vnode.key !== undefined
      ? !stableKeyedPositions.has(index) || keyedOldOrder[index] === -1
      : !old) {
      placeMountedBefore(root, parent, patched, cursor);
    }
    cursor = patched.dom;
  }

  const retained = new Set(nextMounted);
  const teardown = teardownFailure();
  for (const old of oldChildren) {
    if (!retained.has(old)) {
      attemptTeardown(teardown, () => unmountMounted(old));
      attemptTeardown(teardown, () => removeMountedNodes(parent, old));
    }
  }
  throwTeardownFailure(teardown);

  return nextMounted;
}

/** Returns next-child positions that are already in increasing old-child order. */
function longestIncreasingSubsequencePositions(values: readonly number[]): Set<number> {
  const tails: number[] = [];
  const predecessors = new Array<number>(values.length).fill(-1);
  for (let index = 0; index < values.length; index++) {
    const value = values[index]!;
    if (value < 0) continue;
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (values[tails[middle]!]! < value) low = middle + 1;
      else high = middle;
    }
    if (low > 0) predecessors[index] = tails[low - 1]!;
    tails[low] = index;
  }
  const positions = new Set<number>();
  let cursor = tails[tails.length - 1] ?? -1;
  while (cursor >= 0) {
    positions.add(cursor);
    cursor = predecessors[cursor]!;
  }
  return positions;
}

function rerenderComponent(root: Root, mounted: Mounted): void {
  if (!mounted.instance) return;
  if (!mounted.scope.active) return;
  if (mounted.rendering) {
    mounted.rerenderPending = true;
    return;
  }
  mounted.rendering = true;
  try {
    do {
      mounted.rerenderPending = false;
      domDebug(root, "rerender component", {
        type: describeVNodeType(mounted.vnode.type),
        key: mounted.vnode.key ?? "none"
      });
      const nextChildren = withEffectScope(
        mounted.scope,
        () => normalizeRenderResult(renderInstance(mounted.instance!, () => rerenderComponent(root, mounted)))
      );
      mounted.children = patchChildren(
        root,
        mounted.dom.parentNode ?? root.container,
        mounted.children,
        nextChildren,
        mounted.instance,
        mounted.scope,
        afterMountedChildren(mounted)
      );
    } while (mounted.rerenderPending && mounted.scope.active);
  } finally {
    mounted.rendering = false;
  }
}

function bindText(mounted: Mounted, value: unknown): void {
  mounted.stop?.();
  const node = mounted.dom as CharacterData;
  mounted.stop = watch(() => {
    const text = String(unwrap(value) ?? "");
    if (node.data !== text) {
      node.data = text;
    }
  }, undefined, { scope: mounted.scope });
}

const teardownFailure = createCleanupFailure;
const recordTeardownFailure = recordCleanupFailure;
const attemptTeardown = attemptCleanup;
const throwTeardownFailure = throwCleanupFailure;

function unmountMany(mounts: readonly Mounted[]): void {
  const failure = teardownFailure();
  for (const mounted of mounts) attemptTeardown(failure, () => unmountMounted(mounted));
  throwTeardownFailure(failure);
}

function disposeMounted(parent: Node, mounted: Mounted): void {
  const failure = teardownFailure();
  attemptTeardown(failure, () => unmountMounted(mounted));
  attemptTeardown(failure, () => removeMountedNodes(parent, mounted));
  throwTeardownFailure(failure);
}

function unmountMounted(mounted: Mounted): void {
  const pending: Array<{ mounted: Mounted; complete: boolean }> = [{ mounted, complete: false }];
  const failure = teardownFailure();
  while (pending.length) {
    const current = pending.pop()!;
    if (!current.complete) {
      attemptTeardown(failure, () => current.mounted.scope.stop());
      pending.push({ mounted: current.mounted, complete: true });
      for (let index = current.mounted.children.length - 1; index >= 0; index--) {
        pending.push({ mounted: current.mounted.children[index]!, complete: false });
      }
      continue;
    }
    if (current.mounted.instance) {
      componentMounts.delete(current.mounted.instance);
      attemptTeardown(failure, () => current.mounted.instance!.unmount());
    }
    if (current.mounted.stop) attemptTeardown(failure, current.mounted.stop);
    if (current.mounted.dom instanceof Element) {
      attemptTeardown(failure, () => clearElementProps(current.mounted.dom as Element));
      attemptTeardown(failure, () => clearElementOwner(current.mounted.dom as Element));
    }
    const ref = current.mounted.vnode.props.ref as RefBinding<unknown> | undefined;
    if (ref) attemptTeardown(failure, () => ref.fulfill(undefined));
  }
  throwTeardownFailure(failure);
}

function removeMountedNodes(parent: Node, mounted: Mounted): void {
  const pending: Array<{ mounted: Mounted; parent: Node; complete: boolean }> = [{ mounted, parent, complete: false }];
  const failure = teardownFailure();
  while (pending.length) {
    const current = pending.pop()!;
    if (!current.complete) {
      pending.push({ ...current, complete: true });
      const childParent = current.mounted.portalTarget ?? current.parent;
      for (let index = current.mounted.children.length - 1; index >= 0; index--) {
        pending.push({ mounted: current.mounted.children[index]!, parent: childParent, complete: false });
      }
      continue;
    }
    if (current.mounted.dom.parentNode === current.parent) attemptTeardown(failure, () => current.parent.removeChild(current.mounted.dom));
    if (current.mounted.end?.parentNode === current.parent) attemptTeardown(failure, () => current.parent.removeChild(current.mounted.end!));
  }
  throwTeardownFailure(failure);
}

function normalizeTreeDepth(value: number | undefined): number {
  return Number.isSafeInteger(value) && value! > 0
    ? Math.min(value!, HARD_MAX_TREE_DEPTH)
    : DEFAULT_MAX_TREE_DEPTH;
}

function normalizeTreeNodes(value: number | undefined): number {
  return Number.isSafeInteger(value) && value! > 0 ? value! : DEFAULT_MAX_TREE_NODES;
}

function withDomWork<T>(root: Root, run: () => T): T {
  const outermost = root.workDepth++ === 0;
  if (outermost) root.traversedNodes = 0;
  try { return run(); }
  finally { root.workDepth--; }
}

function countDomWork(root: Root): void {
  if (root.workBudget) consumeDomWork(root.workBudget);
  if (++root.traversedNodes > root.maxTreeNodes) throw new DomTreeWorkError(root.maxTreeNodes);
}

function isDomRenderLimitError(error: unknown): error is DomTreeDepthError | DomTreeWorkError {
  return error instanceof DomTreeDepthError || error instanceof DomTreeWorkError;
}

function withTreeDepth<T>(root: Root, run: () => T): T {
  root.traversalDepth++;
  if (root.traversalDepth > root.maxTreeDepth) {
    root.traversalDepth--;
    throw new DomTreeDepthError(root.maxTreeDepth);
  }
  try {
    return run();
  } finally {
    root.traversalDepth--;
  }
}
