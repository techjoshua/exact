import {
  Cell,
  Dynamic,
  Fragment,
  Text,
  createComponentInstance,
  createTextVNode,
  getCellVNode,
  isCellVNode,
  isVNode,
  normalizeRenderResult,
  renderInstance,
  type Child,
  type ComponentFunction,
  type ComponentInstance,
  type ListBinding,
  type RefBinding,
  type StopHandle,
  type VNode,
  unwrap,
  watch
} from "@exact/core";
import { computed, type ReactiveValue } from "@exact/reactive";

type Mounted = {
  vnode: VNode;
  dom: Node;
  children: Mounted[];
  instance?: ComponentInstance<any>;
  delegatedEvents?: Map<string, EventListener>;
  stop?: StopHandle;
};

type Root = {
  container: Element;
  mounted?: Mounted;
  delegated: Map<string, EventListener>;
};

const roots = new WeakMap<Element, Root>();
const eventHandlers = new WeakMap<Element, Map<string, EventListener>>();
const propBindings = new WeakMap<Element, Map<string, StopHandle>>();

export function render(vnode: VNode, container: Element): void {
  let root = roots.get(container);
  if (!root) {
    root = { container, delegated: new Map() };
    roots.set(container, root);
  }

  root.mounted = patch(root, container, root.mounted, vnode, undefined);
}

function mount(root: Root, vnode: VNode, parentInstance?: ComponentInstance<any>): Mounted {
  if (isCellVNode(vnode)) {
    const marker = document.createComment("exact-cell");
    const mounted: Mounted = { vnode, dom: marker, children: [] };
    mounted.children = mountDetachedChildren(root, [getCellVNode(vnode)], parentInstance);
    return mounted;
  }

  if (vnode.type === Text) {
    const node = document.createTextNode("");
    const mounted: Mounted = { vnode, dom: node, children: [] };
    bindText(mounted, vnode.props.value);
    return mounted;
  }

  if (vnode.type === Fragment) {
    const marker = document.createComment("exact-fragment");
    const mounted: Mounted = { vnode, dom: marker, children: [] };
    const list = getListBinding(vnode);
    mounted.children = list
      ? mountDetachedChildren(root, materializeList(list), parentInstance)
      : mountDetachedChildren(root, vnode.children, parentInstance);
    if (list) {
      mounted.stop = watch(() => {
        const nextChildren = materializeList(list);
        const parent = marker.parentNode;
        if (!parent) return;
        mounted.children = patchChildren(root, parent, mounted.children, nextChildren, parentInstance, afterMountedChildren(mounted));
      });
    }
    return mounted;
  }

  if (vnode.type === Dynamic) {
    const marker = document.createComment("exact-dynamic");
    const mounted: Mounted = { vnode, dom: marker, children: [] };
    const value = vnode.props.value;
    mounted.children = mountDetachedChildren(root, normalizeRenderResult(unwrap(value) as Child | Child[]), parentInstance);
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
        afterMountedChildren(mounted)
      );
    });
    return mounted;
  }

  if (typeof vnode.type === "function") {
    const instance = createComponentInstance(
      vnode.type as ComponentFunction<any, Record<string, unknown>>,
      getComponentProps(vnode),
      parentInstance
    );
    const rendered = renderInstance(instance, () => rerenderComponent(root, mounted));
    const wrapper = document.createComment("exact-component");
    const mounted: Mounted = { vnode, dom: wrapper, children: [], instance };
    mounted.children = mountDetachedChildren(root, rendered, instance);
    instance.markMounted();
    return mounted;
  }

  const element = document.createElement(vnode.type as string);
  const mounted: Mounted = { vnode, dom: element, children: [] };
  mounted.children = mountChildren(root, element, vnode.children, parentInstance);
  updateProps(root, element, {}, vnode.props);
  return mounted;
}

function patch(
  root: Root,
  parent: Node,
  mounted: Mounted | undefined,
  next: VNode,
  parentInstance?: ComponentInstance<any>
): Mounted {
  if (!mounted) {
    const created = mount(root, next, parentInstance);
    parent.appendChild(created.dom);
    appendMountedChildren(parent, created);
    return created;
  }

  if (mounted.vnode.type !== next.type || mounted.vnode.key !== next.key) {
    domDebug("replace node", {
      previousType: describeVNodeType(mounted.vnode.type),
      previousKey: mounted.vnode.key ?? "none",
      nextType: describeVNodeType(next.type),
      nextKey: next.key ?? "none",
      parent: describeNode(parent)
    });
    const replacement = mount(root, next, parentInstance);
    parent.insertBefore(replacement.dom, mounted.dom);
    appendMountedChildren(parent, replacement);
    unmountMounted(mounted);
    removeMountedNodes(parent, mounted);
    return replacement;
  }

  if (isCellVNode(next)) {
    mounted.vnode = next;
    mounted.children = patchChildren(
      root,
      parent,
      mounted.children,
      [getCellVNode(next)],
      parentInstance,
      afterMountedChildren(mounted)
    );
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
            afterMountedChildren(mounted)
          );
        });
      }
    } else if (!nextList) {
      mounted.children = patchChildren(root, parent, mounted.children, next.children, parentInstance, afterMountedChildren(mounted));
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
        afterMountedChildren(mounted)
      );
    });
    return mounted;
  }

  if (typeof next.type === "function") {
    mounted.vnode = next;
    mounted.instance?.updateProps(getComponentProps(next));
    return mounted;
  }

  const previousProps = mounted.vnode.props;
  mounted.vnode = next;
  mounted.children = patchChildren(root, mounted.dom, mounted.children, next.children, parentInstance);
  updateProps(root, mounted.dom as Element, previousProps, next.props);
  return mounted;
}

function mountDetachedChildren(root: Root, children: Child[], parentInstance?: ComponentInstance<any>): Mounted[] {
  const mounted: Mounted[] = [];
  for (const child of children) {
    const vnode = childToVNode(child);
    if (!vnode) continue;
    mounted.push(mount(root, vnode, parentInstance));
  }
  return mounted;
}

function mountChildren(root: Root, parent: Node, children: Child[], parentInstance?: ComponentInstance<any>): Mounted[] {
  const mounted: Mounted[] = [];
  for (const child of children) {
    const vnode = childToVNode(child);
    if (!vnode) continue;
    const childMounted = mount(root, vnode, parentInstance);
    mounted.push(childMounted);
    parent.appendChild(childMounted.dom);
    appendMountedChildren(parent, childMounted);
  }
  return mounted;
}

function patchChildren(
  root: Root,
  parent: Node,
  oldChildren: Mounted[],
  nextChildren: Child[],
  parentInstance?: ComponentInstance<any>,
  before?: Node | null
): Mounted[] {
  domDebug("patch children", {
    parent: describeNode(parent),
    oldCount: oldChildren.length,
    nextCount: nextChildren.length,
    before: describeNode(before)
  });
  return preserveFocus(() => patchChildrenInner(root, parent, oldChildren, nextChildren, parentInstance, before));
}

function patchChildrenInner(
  root: Root,
  parent: Node,
  oldChildren: Mounted[],
  nextChildren: Child[],
  parentInstance?: ComponentInstance<any>,
  before?: Node | null
): Mounted[] {
  const oldByKey = new Map<string, Mounted>();
  const unkeyed = [...oldChildren];

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
    const patched = patch(root, parent, old, vnode, parentInstance);
    nextMounted.unshift(patched);
    insertBeforeIfNeeded(parent, patched.dom, cursor);
    appendMountedChildren(parent, patched, cursor);
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

function preserveFocus<T>(work: () => T): T {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  const result = work();
  if (
    active
    && active.isConnected
    && document.activeElement === document.body
  ) {
    domDebug("restore focus", {
      active: describeNode(active),
      bodyOwnsFocus: document.activeElement === document.body
    });
    active.focus({ preventScroll: true });
  }
  return result;
}

function rerenderComponent(root: Root, mounted: Mounted): void {
  if (!mounted.instance) return;
  domDebug("rerender component", {
    type: describeVNodeType(mounted.vnode.type),
    key: mounted.vnode.key ?? "none"
  });
  const nextChildren = normalizeRenderResult(renderInstance(mounted.instance, () => rerenderComponent(root, mounted)));
  mounted.children = patchChildren(root, mounted.dom.parentNode ?? root.container, mounted.children, nextChildren, mounted.instance, afterMountedChildren(mounted));
}

function bindText(mounted: Mounted, value: unknown): void {
  mounted.stop?.();
  const node = mounted.dom as CharacterData;
  mounted.stop = watch(() => {
    node.data = String(unwrap(value) ?? "");
  });
}

function updateProps(root: Root, element: Element, previous: Record<string, unknown>, next: Record<string, unknown>): void {
  preserveFocus(() => {
    for (const key of Object.keys(previous)) {
      if (!(key in next)) setProp(root, element, key, undefined, previous[key]);
    }

    for (const [key, value] of Object.entries(next)) {
      if (!Object.is(previous[key], value)) setProp(root, element, key, value, previous[key]);
    }
  });
}

function setProp(root: Root, element: Element, key: string, value: unknown, previous?: unknown): void {
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
    const stop = bindStyle(element as HTMLElement, value);
    setPropBinding(element, key, stop);
    return;
  }

  const stop = watch(() => preserveFocus(() => {
    const actual = unwrap(value);

    if (actual === false || actual === null || actual === undefined) {
      clearDomProp(element, key);
      return;
    }

    setDomProp(element, key, key === "class" || key === "className" ? normalizeClass(actual) : actual);
  }));

  setPropBinding(element, key, stop);
}

function bindStyle(element: HTMLElement, value: unknown): StopHandle {
  let previousNames = new Set<string>();
  return watch(() => {
    const actual = unwrap(value);

    if (actual === false || actual === null || actual === undefined) {
      element.removeAttribute("style");
      previousNames.clear();
      return;
    }

    if (typeof actual === "string") {
      element.style.cssText = actual;
      previousNames.clear();
      return;
    }

    if (!actual || typeof actual !== "object") {
      element.removeAttribute("style");
      previousNames.clear();
      return;
    }

    const nextNames = new Set<string>();
    for (const [name, rawValue] of Object.entries(actual)) {
      const styleValue = unwrap(rawValue);
      nextNames.add(name);
      if (styleValue === null || styleValue === undefined || styleValue === false) {
        element.style.removeProperty(toCssProperty(name));
      } else {
        element.style.setProperty(toCssProperty(name), String(styleValue));
      }
    }

    for (const name of previousNames) {
      if (!nextNames.has(name)) element.style.removeProperty(toCssProperty(name));
    }
    previousNames = nextNames;
  });
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

function setDomProp(element: Element, key: string, value: unknown): void {
  const property = normalizePropName(key);

  if (property === "defaultValue" && isFocusedTextControl(element)) {
    domDebug("skip focused defaultValue", {
      element: describeNode(element),
      value
    });
    return;
  }

  if (property === "value" || property === "defaultValue") {
    domDebug("set form value prop", {
      element: describeNode(element),
      property,
      active: describeNode(document.activeElement),
      value
    });
  }

  if (property in element) {
      try {
      const record = element as unknown as Record<string, unknown>;
      if (!Object.is(record[property], value)) {
        record[property] = value;
      }
      if (typeof value === "boolean") {
        if (value) {
          element.setAttribute(property, "");
        } else {
          element.removeAttribute(property);
        }
      }
        return;
      } catch {
        // Fall through to attribute setting for readonly DOM properties.
      }
    }

  element.setAttribute(property, String(value));
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
      if (handler) preserveFocus(() => handler.call(cursor, event));
      if (event.cancelBubble) break;
      if (cursor === root.container) break;
      cursor = cursor.parentElement;
    }
  };

  root.container.addEventListener(type, listener);
  root.delegated.set(type, listener);
}

function eventTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

function appendMountedChildren(parent: Node, mounted: Mounted, before?: Node | null): void {
  if (mounted.vnode.type !== Cell && mounted.vnode.type !== Fragment && mounted.vnode.type !== Dynamic && typeof mounted.vnode.type !== "function") return;
  for (const child of mounted.children) {
    insertBeforeIfNeeded(parent, child.dom, before ?? null);
    appendMountedChildren(parent, child, before);
  }
}

function insertBeforeIfNeeded(parent: Node, node: Node, before?: Node | null): void {
  const cursor = before ?? null;
  if (node === cursor) {
    domDebug("skip placement", {
      reason: "node-is-cursor",
      parent: describeNode(parent),
      node: describeNode(node),
      before: describeNode(cursor)
    });
    return;
  }
  if (node.parentNode === parent && node.nextSibling === cursor) {
    domDebug("skip placement", {
      reason: "already-before-cursor",
      parent: describeNode(parent),
      node: describeNode(node),
      before: describeNode(cursor)
    });
    return;
  }
  domDebug("place node", {
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

function unmountMounted(mounted: Mounted): void {
  for (const child of mounted.children) unmountMounted(child);
  if (mounted.instance) mounted.instance.unmount();
  mounted.stop?.();

  if (mounted.dom instanceof Element) {
    for (const stop of propBindings.get(mounted.dom)?.values() ?? []) {
      stop();
    }
    propBindings.delete(mounted.dom);
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

function domDebug(message: string, details?: Record<string, unknown>): void {
  try {
    if (
      globalThis.localStorage?.getItem("exact.dom.debug") !== "1"
      && globalThis.localStorage?.getItem("exact.kanban.debug") !== "1"
    ) {
      return;
    }
  } catch {
    return;
  }

  console.log(`[exact-dom] ${message}`, details ?? {});
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
