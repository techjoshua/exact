import { consumeDomWork, createDomWorkBudget, namespaceForTag, type DomWorkBudget } from "@exact/dom";
import { Fragment, Text, isVNode, sanitizeUrlAttribute, type Child, type VNode } from "@exact/core";
import type { HydrateOptions } from "../types.js";

/** Shared work and depth limits for conservative static-tree adoption. */
export type StaticAdoptionBudget = { work: DomWorkBudget; maxDepth: number };

/** Creates a bounded budget for inspecting and repairing static SSR output. */
export function createStaticAdoptionBudget(
  options: HydrateOptions,
  work = createDomWorkBudget(options.maxTreeNodes)
): StaticAdoptionBudget {
  return {
    work,
    maxDepth: Number.isSafeInteger(options.maxTreeDepth) && options.maxTreeDepth! > 0
      ? Math.min(options.maxTreeDepth!, 1_024)
      : 512
  };
}

/** Adopts or safely repairs a marker-wrapped static tree without mounting components. */
export function adoptStaticTree(vnode: VNode, container: Element, budget: StaticAdoptionBudget): boolean {
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

function visitStatic(budget: StaticAdoptionBudget, depth: number): void {
  consumeDomWork(budget.work);
  if (depth > budget.maxDepth) {
    throw new Error(`eXact hydration tree exceeds the configured maximum depth of ${budget.maxDepth}`);
  }
}

function matchesStaticVNode(vnode: VNode, node: Node, budget: StaticAdoptionBudget, depth: number): boolean {
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

function matchesStaticChildren(children: readonly Child[], nodes: readonly Node[], budget: StaticAdoptionBudget, depth: number): boolean {
  const expected = flattenStaticChildren(children, budget, depth);
  return expected.length === nodes.length && expected.every((child, index) => matchesStaticChild(child, nodes[index]!, budget, depth));
}

function repairStaticChildren(children: readonly Child[], nodes: readonly Node[], budget: StaticAdoptionBudget, depth: number): boolean {
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

function patchStaticVNode(vnode: VNode, node: Node, budget: StaticAdoptionBudget, depth: number): boolean {
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

function matchesStaticChild(child: Child, node: Node, budget: StaticAdoptionBudget, depth: number): boolean {
  if (isVNode(child)) return matchesStaticVNode(child, node, budget, depth);
  return node.nodeType === Node.TEXT_NODE && node.textContent === String(child ?? "");
}

function flattenStaticChildren(children: readonly Child[], budget: StaticAdoptionBudget, depth: number): Child[] {
  const flattened: Child[] = [];
  for (const child of children) {
    visitStatic(budget, depth);
    if (child === null || child === undefined || child === false || child === true) continue;
    if (isVNode(child) && child.type === Fragment) flattened.push(...flattenStaticChildren(child.children, budget, depth + 1));
    else flattened.push(child);
  }
  return flattened;
}

function contentNodes(parent: ParentNode): Node[] {
  return Array.from(parent.childNodes).filter(node => node.nodeType !== Node.COMMENT_NODE);
}

function createStaticNodeFromChild(child: Child, parent: Element | undefined, budget: StaticAdoptionBudget, depth: number): Node | undefined {
  if (isVNode(child)) return createStaticNode(child, parent, budget, depth);
  if (child === null || child === undefined || child === false || child === true) return undefined;
  return document.createTextNode(String(child));
}

function createStaticNode(vnode: VNode, parent: Element | undefined, budget: StaticAdoptionBudget, depth: number): Node | undefined {
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
  const focused = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active : undefined;
  const selection = focused
    ? { start: focused.selectionStart, end: focused.selectionEnd, direction: focused.selectionDirection }
    : undefined;
  previous.parentNode?.replaceChild(next, previous);
  if (!focused || focused !== previous && !previous.contains(focused)) return;
  const replacement = next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement
    ? next
    : next instanceof Element ? next.querySelector("input, textarea") : undefined;
  if (replacement instanceof HTMLInputElement || replacement instanceof HTMLTextAreaElement) {
    replacement.focus();
    if (selection) replacement.setSelectionRange(selection.start, selection.end, selection.direction ?? undefined);
  }
}
