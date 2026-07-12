import { ServerSlot, type VNode } from "@exact/core";
import type { EffectScope } from "@exact/reactive";
import type { Mounted, Root } from "./types.js";

/** Mounts or adopts an existing server-rendered slot element for a client island. */
export function mountServerSlot(root: Root, vnode: VNode, scope: EffectScope): Mounted {
  const id = String(vnode.props.id ?? "");
  const element = findServerSlotDeep(root.container, id) ?? document.createElement("span");
  element.setAttribute("data-exact-server-slot", id);
  if (element instanceof HTMLElement) element.style.display = "contents";
  return { vnode, dom: element, scope, children: [] };
}

/** Repoints a mounted server slot at an existing matching element under the parent. */
export function adoptServerSlot(parent: Node, mounted: Mounted): void {
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
