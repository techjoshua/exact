import {
  createTextVNode,
  getCellVNode,
  isCellVNode,
  isVNode,
  type Child,
  type ListBinding,
  type VNode
} from "@exact/core";
import type { Mounted } from "./types.js";

/** Stops mounted children that cannot be reused by an upcoming replacement patch. */
export function stopReplacedChildren(mounted: Mounted, nextChildren: Child[]): void {
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

/** Stops list children whose keys are not present in the next materialized list. */
export function stopRemovedListChildren<T>(mounted: Mounted, list: ListBinding<T>): void {
  const nextKeys = new Set(materializeList(list).map(child => child.key).filter((key): key is string => key !== undefined));
  for (const child of mounted.children) {
    if (child.vnode.key && nextKeys.has(child.vnode.key)) continue;
    child.scope.stop();
  }
}

/** Converts a render child into a vnode, dropping boolean and nullish placeholders. */
export function childToVNode(child: Child): VNode | undefined {
  if (child === null || child === undefined || child === false || child === true) return undefined;
  if (isVNode(child)) return child;
  return createTextVNode(child);
}

/** Builds component props from vnode props and normalized JSX children. */
export function getComponentProps(vnode: VNode): Record<string, unknown> {
  const props = { ...vnode.props };

  if (vnode.children.length === 1) {
    props.children = vnode.children[0];
  } else if (vnode.children.length > 1) {
    props.children = vnode.children;
  }

  return props;
}

/** Returns the list binding stored on a fragment vnode, if it represents a keyed list. */
export function getListBinding(vnode: VNode): ListBinding | undefined {
  return vnode.props.list as ListBinding | undefined;
}

/** Expands a keyed list binding into renderable vnodes with stable keys. */
export function materializeList<T>(list: ListBinding<T>): VNode[] {
  const collection = list.source ? list.source.get() : list.collection;
  const nodes: VNode[] = [];
  for (const item of collection) {
    const node = list.render(item);
    nodes.push({ ...node, key: String(list.key(item)) });
  }
  return nodes;
}

function canPatchMounted(mounted: Mounted, next: VNode): boolean {
  if (mounted.vnode.type !== next.type || mounted.vnode.key !== next.key) return false;
  if (isCellVNode(next)) {
    const previousChild = mounted.children[0];
    return previousChild ? canPatchMounted(previousChild, getCellVNode(next)) : false;
  }
  return true;
}
