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
  normalizeRenderResult,
  renderInstance,
  type Child,
  type Component,
  type ComponentFunction,
  type ComponentInstance,
  type ErrorReport,
  type ListBinding,
  type RefBinding,
  type VNode,
  unwrap,
  watch
} from "@exact/core";
import {
  createEffectScope,
  flushSync,
  withEffectScope,
  type EffectScope,
} from "@exact/reactive";
import { preserveFocus } from "./focus.js";
import { describeNode, describeVNodeType, domDebug, formatError } from "./debug.js";
import { clearElementOwner, setElementOwner } from "./ownership.js";
import { afterMountedChildren, lastMountedNode, placeMountedBefore } from "./placement.js";
import { clearElementProps, updateProps } from "./props.js";
import { adoptServerSlot, mountServerSlot } from "./server-slots.js";
import { roots } from "./state.js";
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
    clearElementProps(mounted.dom);
    clearElementOwner(mounted.dom);
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
