import {
  Cell,
  Dynamic,
  ErrorContext,
  Fragment,
  ServerSlot,
  Text,
  createComponentInstance,
  createErrorContext,
  createErrorReport,
  createTextVNode,
  createVNode,
  getCellVNode,
  handleComponentError,
  isCellVNode,
  isVNode,
  logFrameworkEvent,
  normalizeRenderResult,
  renderInstance,
  type Child,
  type Component,
  type ComponentFunction,
  type ComponentInstance,
  type ErrorContextValue,
  type ErrorReport,
  type ListBinding,
  type Logger,
  type RefBinding,
  type StopHandle,
  type VNode,
  unwrap,
  watch
} from "@exact/core";
import {
  computed,
  createEffectScope,
  flushSync,
  withEffectScope,
  type EffectScope,
  type ReactiveValue
} from "@exact/reactive";

type Mounted = {
  vnode: VNode;
  dom: Node;
  scope: EffectScope;
  children: Mounted[];
  instance?: ComponentInstance<any>;
  delegatedEvents?: Map<string, EventListener>;
  stop?: StopHandle;
};

type Root = {
  container: Element;
  mounted?: Mounted;
  delegated: Map<string, EventListener>;
  errors: ErrorContextValue;
  current: VNode;
  version: number;
  boundary: ComponentFunction<{}, { version: number }>;
  logger?: Logger;
  debugMarkers: boolean;
};

const roots = new WeakMap<Element, Root>();
const eventHandlers = new WeakMap<Element, Map<string, EventListener>>();
const elementOwners = new WeakMap<Element, ComponentInstance<any>>();
const propBindings = new WeakMap<Element, Map<string, StopHandle>>();

export type RenderOptions = {
  logger?: Logger;
  debugMarkers?: boolean;
};

export function render(vnode: VNode, container: Element, options: RenderOptions = {}): void {
  let root = roots.get(container);
  if (!root) {
    root = {
      container,
      delegated: new Map(),
      errors: createErrorContext(),
      current: vnode,
      version: 0,
      boundary: undefined as never,
      debugMarkers: false
    };
    root.boundary = createRootBoundary(root);
    roots.set(container, root);
  }
  root.current = vnode;
  root.version++;
  root.logger = options.logger;
  root.debugMarkers = options.debugMarkers ?? false;

  root.mounted = patch(root, container, root.mounted, createVNode(root.boundary, {
    version: root.version
  }), undefined, undefined);
  flushSync();
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

function createMarker(root: Root, label: "cell" | "component" | "dynamic" | "fragment"): Node {
  return root.debugMarkers
    ? document.createComment(`exact-${label}`)
    : document.createTextNode("");
}

function mount(root: Root, vnode: VNode, parentInstance?: ComponentInstance<any>, parentScope?: EffectScope): Mounted {
  const scope = createEffectScope(parentScope);
  if (isCellVNode(vnode)) {
    const marker = createMarker(root, "cell");
    const mounted: Mounted = { vnode, dom: marker, scope, children: [] };
    mounted.children = mountDetachedChildren(root, [getCellVNode(vnode)], parentInstance, mounted.scope);
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
      ? mountDetachedChildren(root, materializeList(list), parentInstance, mounted.scope)
      : mountDetachedChildren(root, vnode.children, parentInstance, mounted.scope);
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
    mounted.children = mountDetachedChildren(root, normalizeRenderResult(unwrap(value) as Child | Child[]), parentInstance, mounted.scope);
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

  if (vnode.type === ServerSlot) {
    return mountServerSlot(root, vnode, scope);
  }

  if (typeof vnode.type === "function") {
    const wrapper = createMarker(root, "component");
    const mounted: Mounted = { vnode, dom: wrapper, scope, children: [] };
    try {
      const instance = withEffectScope(mounted.scope, () => createComponentInstance(
          vnode.type as ComponentFunction<any, Record<string, unknown>>,
          getComponentProps(vnode),
          parentInstance
        ));
      mounted.instance = instance;
      const rendered = withEffectScope(mounted.scope, () => renderInstance(instance, () => rerenderComponent(root, mounted)));
      mounted.children = mountDetachedChildren(root, rendered, instance, mounted.scope);
      instance.markMounted();
    } catch (error) {
      const fallback = handleComponentError(
        parentInstance,
        createErrorReport(error, "construct", parentInstance, describeVNodeType(vnode.type))
      );
      mounted.children = fallback
        ? mountDetachedChildren(root, normalizeRenderResult(fallback()), parentInstance, mounted.scope)
        : [];
    }
    return mounted;
  }

  const element = document.createElement(vnode.type as string);
  const mounted: Mounted = { vnode, dom: element, scope, children: [] };
  if (parentInstance) elementOwners.set(element, parentInstance);
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
  if (!mounted) {
    const created = mount(root, next, parentInstance, parentScope);
    placeMountedBefore(root, parent, created, null);
    return created;
  }

  if (mounted.vnode.type !== next.type || mounted.vnode.key !== next.key) {
    domDebug(root, "replace node", {
      previousType: describeVNodeType(mounted.vnode.type),
      previousKey: mounted.vnode.key ?? "none",
      nextType: describeVNodeType(next.type),
      nextKey: next.key ?? "none",
      parent: describeNode(parent)
    });
    const replacement = mount(root, next, parentInstance, parentScope);
    placeMountedBefore(root, parent, replacement, mounted.dom);
    unmountMounted(mounted);
    removeMountedNodes(parent, mounted);
    return replacement;
  }

  if (isCellVNode(next)) {
    mounted.vnode = next;
    const nextChild = getCellVNode(next);
    const previousChild = mounted.children[0];
    if (previousChild) {
      mounted.children = [patch(root, parent, previousChild, nextChild, parentInstance, mounted.scope)];
    } else {
      const child = mount(root, nextChild, parentInstance, mounted.scope);
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

  if (next.type === ServerSlot) {
    mounted.vnode = next;
    if (mounted.dom instanceof Element && mounted.dom.getAttribute("data-exact-server-slot") === String(next.props.id ?? "")) {
      return mounted;
    }
    const replacement = mountServerSlot(root, next, mounted.scope);
    placeMountedBefore(root, parent, replacement, mounted.dom);
    unmountMounted(mounted);
    removeMountedNodes(parent, mounted);
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

function mountDetachedChildren(root: Root, children: Child[], parentInstance?: ComponentInstance<any>, parentScope?: EffectScope): Mounted[] {
  const mounted: Mounted[] = [];
  for (const child of children) {
    const vnode = childToVNode(child);
    if (!vnode) continue;
    mounted.push(mount(root, vnode, parentInstance, parentScope));
  }
  return mounted;
}

function mountChildren(root: Root, parent: Node, children: Child[], parentInstance?: ComponentInstance<any>, parentScope?: EffectScope): Mounted[] {
  const mounted: Mounted[] = [];
  for (const child of children) {
    const vnode = childToVNode(child);
    if (!vnode) continue;
    const childMounted = mount(root, vnode, parentInstance, parentScope);
    if (vnode.type === ServerSlot) adoptServerSlot(parent, childMounted);
    mounted.push(childMounted);
    placeMountedBefore(root, parent, childMounted, null);
  }
  return mounted;
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
  return preserveFocus(root, () => patchChildrenInner(root, parent, oldChildren, nextChildren, parentInstance, parentScope, before));
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
  const oldByKey = new Map<string, Mounted>();
  const unkeyed = oldChildren.filter(child => !child.vnode.key);

  for (const child of oldChildren) {
    if (child.vnode.key) {
      oldByKey.set(child.vnode.key, child);
    }
  }

  const nextVNodes = nextChildren
    .map(childToVNode)
    .filter((vnode): vnode is VNode => !!vnode);
  const nextMounted: Mounted[] = [];
  let cursor = before ?? null;

  for (let index = nextVNodes.length - 1; index >= 0; index--) {
    const vnode = nextVNodes[index]!;
    const old = vnode.key ? oldByKey.get(vnode.key) : unkeyed.pop();
    if (old?.vnode.key) oldByKey.delete(old.vnode.key);
    const patched = patch(root, parent, old, vnode, parentInstance, parentScope);
    if (vnode.type === ServerSlot) adoptServerSlot(parent, patched);
    nextMounted.unshift(patched);
    placeMountedBefore(root, parent, patched, cursor);
    cursor = patched.dom;
  }

  for (const old of oldChildren) {
    if (!nextMounted.includes(old)) {
      unmountMounted(old);
      removeMountedNodes(parent, old);
    }
  }

  return nextMounted;
}

function preserveFocus<T>(root: Root, work: () => T): T {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  const result = work();
  if (
    active
    && active.isConnected
    && document.activeElement === document.body
  ) {
    domDebug(root, "restore focus", {
      active: describeNode(active),
      bodyOwnsFocus: document.activeElement === document.body
    });
    active.focus({ preventScroll: true });
  }
  return result;
}

function mountServerSlot(root: Root, vnode: VNode, scope: EffectScope): Mounted {
  const id = String(vnode.props.id ?? "");
  const element = findServerSlotDeep(root.container, id) ?? document.createElement("span");
  element.setAttribute("data-exact-server-slot", id);
  if (element instanceof HTMLElement) element.style.display = "contents";
  return { vnode, dom: element, scope, children: [] };
}

function adoptServerSlot(parent: Node, mounted: Mounted): void {
  if (mounted.vnode.type !== ServerSlot) return;
  const id = String(mounted.vnode.props.id ?? "");
  const existing = findServerSlot(parent, id);
  if (!existing || existing === mounted.dom) return;
  mounted.dom = existing;
}

function findServerSlot(parent: Node, id: string): Element | undefined {
  for (const child of Array.from(parent.childNodes)) {
    if (child instanceof Element && child.getAttribute("data-exact-server-slot") === id) {
      return child;
    }
  }
  return undefined;
}

function findServerSlotDeep(parent: ParentNode, id: string): Element | undefined {
  if (parent instanceof Element && parent.getAttribute("data-exact-server-slot") === id) return parent;
  for (const element of Array.from(parent.querySelectorAll("[data-exact-server-slot]"))) {
    if (element.getAttribute("data-exact-server-slot") === id) return element;
  }
  return undefined;
}

function rerenderComponent(root: Root, mounted: Mounted): void {
  if (!mounted.instance) return;
  if (!mounted.scope.active) return;
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

function updateProps(root: Root, element: Element, previous: Record<string, unknown>, next: Record<string, unknown>, scope: EffectScope): void {
  preserveFocus(root, () => {
    for (const key of Object.keys(previous)) {
      if (!(key in next)) setProp(root, element, key, undefined, previous[key], scope);
    }

    for (const [key, value] of Object.entries(next)) {
      if (!Object.is(previous[key], value)) setProp(root, element, key, value, previous[key], scope);
    }
  });
}

function setProp(root: Root, element: Element, key: string, value: unknown, previous: unknown, scope: EffectScope): void {
  if (key === "children") return;

  clearPropBinding(element, key);

  if (key === "ref") {
    if (previous && previous !== value) {
      (previous as RefBinding<unknown>).fulfill(undefined);
    }
    (value as RefBinding<unknown> | undefined)?.fulfill(element);
    return;
  }

  if (/^on[A-Z]/.test(key)) {
    const type = key.slice(2).toLowerCase();
    let handlers = eventHandlers.get(element);
    if (!handlers) {
      handlers = new Map();
      eventHandlers.set(element, handlers);
    }

    if (typeof value === "function") {
      handlers.set(type, value as EventListener);
      ensureDelegated(root, type);
    } else {
      handlers.delete(type);
    }
    return;
  }

  if (key === "style") {
    if (previous !== value) {
      (element as HTMLElement).removeAttribute("style");
    }
    const stop = bindStyle(element as HTMLElement, value, scope);
    setPropBinding(element, key, stop);
    return;
  }

  const stop = watch(() => preserveFocus(root, () => {
    const actual = unwrap(value);

    if (actual === false || actual === null || actual === undefined) {
      clearDomProp(element, key);
      return;
    }

    setDomProp(root, element, key, key === "class" || key === "className" ? normalizeClass(actual) : actual);
  }), undefined, { scope });

  setPropBinding(element, key, stop);
}

function bindStyle(element: HTMLElement, value: unknown, scope: EffectScope): StopHandle {
  let previousNames = new Set<string>();
  let previousCssText: string | undefined;
  const previousValues = new Map<string, string>();
  return watch(() => {
    const actual = unwrap(value);

    if (actual === false || actual === null || actual === undefined) {
      if (element.hasAttribute("style")) {
        element.removeAttribute("style");
      }
      previousNames.clear();
      previousCssText = undefined;
      previousValues.clear();
      return;
    }

    if (typeof actual === "string") {
      if (previousCssText !== actual || element.style.cssText !== actual) {
        element.style.cssText = actual;
      }
      previousNames.clear();
      previousCssText = actual;
      previousValues.clear();
      return;
    }

    if (!actual || typeof actual !== "object") {
      if (element.hasAttribute("style")) {
        element.removeAttribute("style");
      }
      previousNames.clear();
      previousCssText = undefined;
      previousValues.clear();
      return;
    }

    previousCssText = undefined;
    const nextNames = new Set<string>();
    for (const [name, rawValue] of Object.entries(actual)) {
      const styleValue = unwrap(rawValue);
      const property = toCssProperty(name);
      nextNames.add(property);
      if (styleValue === null || styleValue === undefined || styleValue === false) {
        if (previousValues.has(property) || element.style.getPropertyValue(property)) {
          element.style.removeProperty(property);
        }
        previousValues.delete(property);
      } else {
        const nextValue = String(styleValue);
        if (previousValues.get(property) !== nextValue || element.style.getPropertyValue(property) !== nextValue) {
          element.style.setProperty(property, nextValue);
        }
        previousValues.set(property, nextValue);
      }
    }

    for (const name of previousNames) {
      if (!nextNames.has(name)) {
        element.style.removeProperty(name);
        previousValues.delete(name);
      }
    }
    previousNames = nextNames;
  }, undefined, { scope });
}

export type CssValue = string | number | ReactiveValue<string>;

type CssInput = unknown;

export const px = unit("px");
export const rem = unit("rem");
export const em = unit("em");
export const percent = unit("%");
export const vh = unit("vh");
export const vw = unit("vw");
export const vmin = unit("vmin");
export const vmax = unit("vmax");
export const fr = unit("fr");
export const ms = unit("ms");
export const s = unit("s");
export const deg = unit("deg");
export const rad = unit("rad");
export const turn = unit("turn");

function unit(suffix: string): (value: CssInput) => ReactiveValue<string> {
  return (value: CssInput) => computed(() => `${unwrap(value) ?? ""}${suffix}`);
}

function normalizeClass(value: unknown): string {
  const actual = unwrap(value);
  if (actual === false || actual === null || actual === undefined) return "";
  if (typeof actual === "string") return actual;
  if (Array.isArray(actual)) {
    return actual.map(item => normalizeClass(item)).filter(Boolean).join(" ");
  }
  if (typeof actual === "object") {
    return Object.entries(actual).filter(([, enabled]) => Boolean(unwrap(enabled))).map(([name]) => name).join(" ");
  }
  return String(actual);
}

function setDomProp(root: Root, element: Element, key: string, value: unknown): void {
  const property = normalizePropName(key);

  if (property === "defaultValue" && isFocusedTextControl(element)) {
    domDebug(root, "skip focused defaultValue", {
      element: describeNode(element),
      value
    });
    return;
  }

  if (property in element) {
    try {
      const record = element as unknown as Record<string, unknown>;
      if (Object.is(record[property], value)) {
        syncBooleanAttribute(element, property, value);
        return;
      }

      if (property === "value" || property === "defaultValue") {
        domDebug(root, "set form value prop", {
          element: describeNode(element),
          property,
          active: describeNode(document.activeElement),
          value
        });
      }
      record[property] = value;
      syncBooleanAttribute(element, property, value);
      return;
    } catch {
      // Fall through to attribute setting for readonly DOM properties.
    }
  }

  const attributeValue = String(value);
  if (element.getAttribute(property) !== attributeValue) {
    element.setAttribute(property, attributeValue);
  }
}

function syncBooleanAttribute(element: Element, property: string, value: unknown): void {
  if (typeof value !== "boolean") return;
  if (value) {
    if (!element.hasAttribute(property)) element.setAttribute(property, "");
  } else {
    if (element.hasAttribute(property)) element.removeAttribute(property);
  }
}

function clearDomProp(element: Element, key: string): void {
  const property = normalizePropName(key);

  if (property in element) {
    const current = (element as unknown as Record<string, unknown>)[property];
    try {
      if (typeof current === "boolean") {
        (element as unknown as Record<string, unknown>)[property] = false;
      } else if (typeof current === "string") {
        (element as unknown as Record<string, unknown>)[property] = "";
      }
    } catch {
      // Attribute removal below is still the portable fallback.
    }
  }

  element.removeAttribute(property);
}

function normalizePropName(key: string): string {
  return key === "className" ? "class" : key;
}

function isFocusedTextControl(element: Element): boolean {
  return document.activeElement === element
    && (
      element instanceof HTMLInputElement
      || element instanceof HTMLTextAreaElement
    );
}

function toCssProperty(name: string): string {
  return name.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
}

function ensureDelegated(root: Root, type: string): void {
  if (root.delegated.has(type)) return;

  const listener = (event: Event) => {
    let cursor = eventTargetElement(event.target);
    while (cursor && cursor !== root.container.parentElement) {
      const handler = eventHandlers.get(cursor)?.get(type);
      if (handler) {
        const current = cursor;
        preserveFocus(root, () => {
          try {
            callDelegatedHandler(handler, current, event);
          } catch (error) {
            const owner = findOwnerInstance(current);
            handleComponentError(owner, createErrorReport(error, "event", owner, type));
          }
        });
      }
      if (event.cancelBubble) break;
      if (cursor === root.container) break;
      cursor = cursor.parentElement;
    }
  };

  root.container.addEventListener(type, listener);
  root.delegated.set(type, listener);
}

function callDelegatedHandler(handler: EventListener, current: Element, event: Event): void {
  const ownDescriptor = Object.getOwnPropertyDescriptor(event, "currentTarget");
  Object.defineProperty(event, "currentTarget", {
    configurable: true,
    value: current
  });
  try {
    handler.call(current, event);
  } finally {
    if (ownDescriptor) {
      Object.defineProperty(event, "currentTarget", ownDescriptor);
    } else {
      delete (event as { currentTarget?: EventTarget | null }).currentTarget;
    }
  }
}

function eventTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

function placeMountedBefore(root: Root, parent: Node, mounted: Mounted, before?: Node | null): void {
  const cursor = before?.parentNode === parent ? before : null;
  const nodes = mountedDomNodes(mounted);
  const first = nodes[0];
  const last = nodes[nodes.length - 1];

  if (first.parentNode === parent && last.nextSibling === cursor && areContiguous(nodes)) {
    domDebug(root, "skip placement", {
      reason: "mounted-range-already-before-cursor",
      parent: describeNode(parent),
      node: describeNode(first),
      before: describeNode(cursor)
    });
    return;
  }

  for (const node of nodes) {
    insertBeforeIfNeeded(root, parent, node, cursor);
  }
}

function mountedDomNodes(mounted: Mounted): Node[] {
  const nodes = [mounted.dom];
  if (mounted.vnode.type === Cell || mounted.vnode.type === Fragment || mounted.vnode.type === Dynamic || typeof mounted.vnode.type === "function") {
    for (const child of mounted.children) {
      nodes.push(...mountedDomNodes(child));
    }
  }
  return nodes;
}

function areContiguous(nodes: Node[]): boolean {
  for (let index = 0; index < nodes.length - 1; index++) {
    if (nodes[index]!.nextSibling !== nodes[index + 1]) return false;
  }
  return true;
}

function insertBeforeIfNeeded(root: Root, parent: Node, node: Node, before?: Node | null): void {
  const cursor = before?.parentNode === parent ? before : null;
  if (node === cursor) {
    domDebug(root, "skip placement", {
      reason: "node-is-cursor",
      parent: describeNode(parent),
      node: describeNode(node),
      before: describeNode(cursor)
    });
    return;
  }
  if (node.parentNode === parent && node.nextSibling === cursor) {
    domDebug(root, "skip placement", {
      reason: "already-before-cursor",
      parent: describeNode(parent),
      node: describeNode(node),
      before: describeNode(cursor)
    });
    return;
  }
  domDebug(root, "place node", {
    parent: describeNode(parent),
    node: describeNode(node),
    before: describeNode(cursor),
    active: describeNode(document.activeElement)
  });
  parent.insertBefore(node, cursor);
}

function afterMountedChildren(mounted: Mounted): Node | null {
  const lastChild = mounted.children[mounted.children.length - 1];
  return lastChild ? lastMountedNode(lastChild).nextSibling : mounted.dom.nextSibling;
}

function lastMountedNode(mounted: Mounted): Node {
  const lastChild = mounted.children[mounted.children.length - 1];
  return lastChild ? lastMountedNode(lastChild) : mounted.dom;
}

function stopReplacedChildren(mounted: Mounted, nextChildren: Child[]): void {
  const nextVNodes = nextChildren
    .map(childToVNode)
    .filter((vnode): vnode is VNode => !!vnode);

  const keyed = new Map<string, VNode>();
  const unkeyed: VNode[] = [];
  for (const vnode of nextVNodes) {
    if (vnode.key) keyed.set(vnode.key, vnode);
    else unkeyed.push(vnode);
  }

  for (const child of mounted.children) {
    const next = child.vnode.key ? keyed.get(child.vnode.key) : unkeyed.shift();
    if (next && canPatchMounted(child, next)) continue;
    child.scope.stop();
  }
}

function canPatchMounted(mounted: Mounted, next: VNode): boolean {
  if (mounted.vnode.type !== next.type || mounted.vnode.key !== next.key) return false;
  if (isCellVNode(next)) {
    const previousChild = mounted.children[0];
    return previousChild ? canPatchMounted(previousChild, getCellVNode(next)) : false;
  }
  return true;
}

function stopRemovedListChildren<T>(mounted: Mounted, list: ListBinding<T>): void {
  const nextKeys = new Set(materializeList(list).map(child => child.key).filter((key): key is string => key !== undefined));
  for (const child of mounted.children) {
    if (child.vnode.key && nextKeys.has(child.vnode.key)) continue;
    child.scope.stop();
  }
}

function unmountMounted(mounted: Mounted): void {
  mounted.scope.stop();
  for (const child of mounted.children) unmountMounted(child);
  if (mounted.instance) mounted.instance.unmount();
  mounted.stop?.();

  if (mounted.dom instanceof Element) {
    for (const stop of propBindings.get(mounted.dom)?.values() ?? []) {
      stop();
    }
    propBindings.delete(mounted.dom);
    eventHandlers.delete(mounted.dom);
    elementOwners.delete(mounted.dom);
  }

  const ref = mounted.vnode.props.ref as RefBinding<unknown> | undefined;
  ref?.fulfill(undefined);
}

function removeMountedNodes(parent: Node, mounted: Mounted): void {
  for (const child of mounted.children) {
    removeMountedNodes(parent, child);
  }

  if (mounted.dom.parentNode === parent) {
    parent.removeChild(mounted.dom);
  }
}

function childToVNode(child: Child): VNode | undefined {
  if (child === null || child === undefined || child === false || child === true) return undefined;
  if (isVNode(child)) return child;
  return createTextVNode(child);
}

function getComponentProps(vnode: VNode): Record<string, unknown> {
  const props = { ...vnode.props };

  if (vnode.children.length === 1) {
    props.children = vnode.children[0];
  } else if (vnode.children.length > 1) {
    props.children = vnode.children;
  }

  return props;
}

function getListBinding(vnode: VNode): ListBinding | undefined {
  return vnode.props.list as ListBinding | undefined;
}

function materializeList<T>(list: ListBinding<T>): VNode[] {
  const collection = list.source ? list.source.get() : list.collection;
  const nodes: VNode[] = [];
  for (const item of collection) {
    const node = list.render(item);
    nodes.push({ ...node, key: String(list.key(item)) });
  }
  return nodes;
}

function clearPropBinding(element: Element, key: string): void {
  const bindings = propBindings.get(element);
  const stop = bindings?.get(key);
  if (!stop) return;
  stop();
  bindings?.delete(key);
}

function setPropBinding(element: Element, key: string, stop: StopHandle): void {
  let bindings = propBindings.get(element);
  if (!bindings) {
    bindings = new Map();
    propBindings.set(element, bindings);
  }
  bindings.set(key, stop);
}

function domDebug(root: Root, message: string, details?: Record<string, unknown>): void {
  logFrameworkEvent("trace", "dom", "patch", message, details, root.logger);
}

function findOwnerInstance(element: Element): ComponentInstance<any> | undefined {
  let cursor: Element | null = element;
  while (cursor) {
    const owner = elementOwners.get(cursor);
    if (owner) return owner;
    cursor = cursor.parentElement;
  }
  return undefined;
}

function describeNode(node: Node | null | undefined): string {
  if (!node) return "none";
  if (node instanceof Element) {
    const id = node.id ? `#${node.id}` : "";
    const className = typeof node.className === "string" && node.className
      ? `.${node.className.split(/\s+/).filter(Boolean).join(".")}`
      : "";
    return `${node.tagName.toLowerCase()}${id}${className}`;
  }
  return node.nodeName;
}

function describeVNodeType(type: VNode["type"]): string {
  if (typeof type === "string") return type;
  if (typeof type === "function") return type.name || "anonymous";
  return String(type.description ?? type.toString());
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}
