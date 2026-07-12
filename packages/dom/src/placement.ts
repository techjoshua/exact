import { Cell, Dynamic, Fragment } from "@exact/core";
import { describeNode, domDebug } from "./debug.js";
import type { Mounted, Root } from "./types.js";

export function placeMountedBefore(root: Root, parent: Node, mounted: Mounted, before?: Node | null): void {
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

export function mountedDomNodes(mounted: Mounted): Node[] {
  const nodes = [mounted.dom];
  if (mounted.vnode.type === Cell || mounted.vnode.type === Fragment || mounted.vnode.type === Dynamic || typeof mounted.vnode.type === "function") {
    for (const child of mounted.children) {
      nodes.push(...mountedDomNodes(child));
    }
  }
  return nodes;
}

export function afterMountedChildren(mounted: Mounted): Node | null {
  const lastChild = mounted.children[mounted.children.length - 1];
  return lastChild ? lastMountedNode(lastChild).nextSibling : mounted.dom.nextSibling;
}

export function lastMountedNode(mounted: Mounted): Node {
  const lastChild = mounted.children[mounted.children.length - 1];
  return lastChild ? lastMountedNode(lastChild) : mounted.dom;
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
