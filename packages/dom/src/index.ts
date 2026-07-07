import {
  Fragment,
  Text,
  createComponentInstance,
  createTextVNode,
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

  const element = document.createElement(vnode.type);
  const mounted: Mounted = { vnode, dom: element, children: [] };
  updateProps(root, element, {}, vnode.props);
  mounted.children = mountChildren(root, element, vnode.children, parentInstance);
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
    const replacement = mount(root, next, parentInstance);
    parent.insertBefore(replacement.dom, mounted.dom);
    appendMountedChildren(parent, replacement);
    unmountMounted(mounted);
    removeMountedNodes(parent, mounted);
    return replacement;
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

  if (typeof next.type === "function") {
    mounted.vnode = next;
    mounted.instance?.updateProps(getComponentProps(next));
    return mounted;
  }

  const previousProps = mounted.vnode.props;
  mounted.vnode = next;
  updateProps(root, mounted.dom as Element, previousProps, next.props);
  mounted.children = patchChildren(root, mounted.dom, mounted.children, next.children, parentInstance);
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
    parent.insertBefore(patched.dom, cursor);
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

function rerenderComponent(root: Root, mounted: Mounted): void {
  if (!mounted.instance) return;
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
  for (const key of Object.keys(previous)) {
    if (!(key in next)) setProp(root, element, key, undefined);
  }

  for (const [key, value] of Object.entries(next)) {
    if (!Object.is(previous[key], value)) setProp(root, element, key, value);
  }
}

function setProp(root: Root, element: Element, key: string, value: unknown): void {
  if (key === "children") return;

  clearPropBinding(element, key);

  if (key === "ref") {
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

  if (value === false || value === null || value === undefined) {
    element.removeAttribute(key);
    return;
  }

  const stop = watch(() => {
    const actual = unwrap(value);

    if (actual === false || actual === null || actual === undefined) {
      element.removeAttribute(key);
      return;
    }

    if (key in element) {
      try {
        (element as unknown as Record<string, unknown>)[key] = actual;
        return;
      } catch {
        // Fall through to attribute setting for readonly DOM properties.
      }
    }

    element.setAttribute(key, String(actual));
  });

  let bindings = propBindings.get(element);
  if (!bindings) {
    bindings = new Map();
    propBindings.set(element, bindings);
  }
  bindings.set(key, stop);
}

function ensureDelegated(root: Root, type: string): void {
  if (root.delegated.has(type)) return;

  const listener = (event: Event) => {
    let cursor = event.target as Element | null;
    while (cursor && cursor !== root.container.parentElement) {
      const handler = eventHandlers.get(cursor)?.get(type);
      if (handler) handler.call(cursor, event);
      if (cursor === root.container) break;
      cursor = cursor.parentElement;
    }
  };

  root.container.addEventListener(type, listener);
  root.delegated.set(type, listener);
}

function appendMountedChildren(parent: Node, mounted: Mounted, before?: Node | null): void {
  if (mounted.vnode.type !== Fragment && typeof mounted.vnode.type !== "function") return;
  for (const child of mounted.children) {
    parent.insertBefore(child.dom, before ?? null);
    appendMountedChildren(parent, child, before);
  }
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
