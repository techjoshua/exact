import { encodeExactMarkerPart, logFrameworkEvent, type Logger } from "@exact/core";
import { applyDomProp } from "@exact/dom";
import type { ExactPatch } from "@exact/server";
import type { HydrationDiagnostic } from "./types.js";

export type PatchOptions = {
  logger?: Logger;
  onMismatch?: "replace" | "throw";
  onDiagnostic?: (diagnostic: HydrationDiagnostic) => void;
};

/** Applies server-generated patches to an existing hydrated container. */
export function applyPatches(container: Element, patches: readonly ExactPatch[], options: PatchOptions = {}): boolean {
  if (!patches.length) return true;
  const index = createProtocolIndex(container);
  if (!index || !validatePatchSequence(index, patches)) {
    const failed = patches.find(patch => !index || !canApplyPatch(index, patch));
    const detail = failed ? `${failed.type}:${failed.id}` : "invalid marker topology";
    reportMismatch(options, `could not atomically apply exact patches (${detail})`, "invalid-patch", failed);
    if (options.onMismatch === "throw") throw new Error(`Could not apply exact patch batch (${detail})`);
    return false;
  }

  // Patches target compiler-owned server boundaries. Disposing the containing
  // renderer root here would tear down unrelated client components even for a
  // text/attribute patch and leave retained DOM inert.
  for (const patch of patches) {
    const ok = applyPatch(container, patch, index);
    if (!ok) {
      reportMismatch(options, `could not apply exact patch ${patch.type}:${patch.id}`);
      if (options.onMismatch === "throw") {
        throw new Error(`Could not apply exact patch ${patch.type}:${patch.id}`);
      }
      return false;
    }
  }
  return true;
}

/** Returns whether a container contains eXact comment markers for hydration patching. */
export function hasExactMarkers(container: Element): boolean {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_COMMENT);
  while (walker.nextNode()) {
    if ((walker.currentNode as Comment).data.startsWith("exact:")) return true;
  }
  return false;
}

/** Returns the current HTML inside an exact boundary or slot. */
export function boundaryInnerHtml(container: Element, id: string): string | undefined {
  const range = findExactRange(container, id);
  if (!range) return findServerSlotElement(container, id)?.innerHTML ?? findClientBoundaryElement(container, id)?.outerHTML;
  const wrapper = document.createElement("div");
  let cursor = range.start.nextSibling;
  while (cursor && cursor !== range.end) {
    wrapper.appendChild(cursor.cloneNode(true));
    cursor = cursor.nextSibling;
  }
  return wrapper.innerHTML;
}

/** Reports a patch or hydration mismatch through framework logging. */
export function reportMismatch(
  options: PatchOptions,
  message: string,
  code: HydrationDiagnostic["code"] = "adoption-mismatch",
  patch?: { type: string; id: string }
): void {
  logFrameworkEvent("warn", "hydrate", "mismatch", message, undefined, options.logger);
  options.onDiagnostic?.({ code, message, patch });
}

type ExactRange = { start: Comment; end: Comment };
type ProtocolIndex = {
  ranges: Map<string, ExactRange>;
  exactElements: Map<string, Element>;
  serverSlots: Map<string, Element>;
  clientBoundaries: Map<string, Element>;
  listItems: Map<string, Map<string, ExactRange>>;
};

function canApplyPatch(index: ProtocolIndex, patch: ExactPatch): boolean {
  if (patch.type === "text") return index.ranges.has(patch.id) || index.exactElements.has(patch.id) || index.serverSlots.has(patch.id);
  if (patch.type === "prop" || patch.type === "style") return index.exactElements.has(patch.id) || index.ranges.has(patch.id);
  if (patch.type === "replace") return index.ranges.has(patch.id) || index.exactElements.has(patch.id)
    || index.serverSlots.has(patch.id) || index.clientBoundaries.has(patch.id);
  if (patch.type === "state") return index.exactElements.has(patch.id);
  if (patch.type === "list") {
    if (!index.ranges.has(patch.id)) return false;
    if (patch.op === "insert") return !!patch.html && (!patch.before || !!findIndexedItem(index, patch.id, patch.before));
    const item = findIndexedItem(index, patch.id, patch.key);
    if (patch.op === "remove") return !!item;
    return !!item || !!patch.html;
  }
  return false;
}

function validatePatchSequence(index: ProtocolIndex, patches: readonly ExactPatch[]): boolean {
  const keys = new Map<string, Set<string>>();
  for (const [listId, items] of index.listItems) keys.set(listId, new Set(items.keys()));
  const has = (set: Set<string>, key: string | undefined) => !key || set.has(key) || set.has(encodeExactMarkerPart(key));
  for (const patch of patches) {
    if (patch.type !== "list") {
      if (!canApplyPatch(index, patch)) return false;
      continue;
    }
    if (!index.ranges.has(patch.id)) return false;
    let list = keys.get(patch.id);
    if (!list) keys.set(patch.id, list = new Set());
    if (!has(list, patch.before)) return false;
    if (patch.op === "insert") {
      if (!patch.html || has(list, patch.key)) return false;
      list.add(patch.key);
    } else if (patch.op === "remove") {
      if (!has(list, patch.key)) return false;
      list.delete(patch.key);
      list.delete(encodeExactMarkerPart(patch.key));
    } else if (!has(list, patch.key) && !patch.html) return false;
  }
  return true;
}

function applyPatch(container: Element, patch: ExactPatch, index?: ProtocolIndex): boolean {
  if (patch.type === "text") {
    const target = findExactTarget(container, patch.id, index) ?? findServerSlotElement(container, patch.id, index);
    if (!target) return false;
    target.textContent = patch.value;
    return true;
  }

  if (patch.type === "prop") {
    const target = findExactElementTarget(container, patch.id, index);
    if (!target) return false;
    applyDomProp(target, patch.name, patch.value);
    return true;
  }

  if (patch.type === "style") {
    const target = findExactElementTarget(container, patch.id, index) as HTMLElement | undefined;
    if (!target) return false;
    if (patch.value === null) target.style.removeProperty(patch.name);
    else target.style.setProperty(patch.name, patch.value);
    return true;
  }

  if (patch.type === "replace") {
    const range = findExactRange(container, patch.id, index);
    if (!range) {
      const clientBoundary = findClientBoundaryElement(container, patch.id, index);
      if (clientBoundary) {
        replaceElement(clientBoundary, patch.html);
        return true;
      }
      const exactElement = findExactElement(container, patch.id, index);
      if (exactElement) {
        replaceElement(exactElement, patch.html);
        return true;
      }
      const slot = findServerSlotElement(container, patch.id, index);
      if (!slot) return false;
      replaceElementChildren(slot, patch.html);
      return true;
    }
    replaceRange(range, patch.html);
    return true;
  }

  if (patch.type === "state") {
    const target = findExactElement(container, patch.id, index);
    if (!target) return false;
    target.setAttribute("data-exact-state", JSON.stringify(patch.value));
    return true;
  }

  if (patch.type === "list") {
    const range = findExactRange(container, patch.id, index);
    if (!range) return false;
    if (patch.op === "remove") {
      const item = index ? findIndexedItem(index, patch.id, patch.key) : findExactItemRange(container, patch.key, range);
      if (!item) return false;
      replaceRange(item, "");
      if (index) reindexList(index, patch.id);
      return true;
    }
    const before = patch.before ? (index ? findIndexedItem(index, patch.id, patch.before) : findExactItemRange(container, patch.before, range)) : undefined;
    const anchor = before?.start ?? range.end;
    if (patch.op === "move") {
      const item = index ? findIndexedItem(index, patch.id, patch.key) : findExactItemRange(container, patch.key, range);
      if (!item) {
        // A missing moved item can still be recovered if the server included fresh HTML.
        // This keeps list patching resilient across stale client snapshots.
        if (!patch.html) return false;
        insertHtmlBefore(anchor, patch.html);
        if (index) reindexList(index, patch.id);
        return true;
      }
      moveRangeBefore(item, anchor);
      if (index) reindexList(index, patch.id);
      return true;
    }
    if (!patch.html) return false;
    insertHtmlBefore(anchor, patch.html);
    if (index) reindexList(index, patch.id);
    return true;
  }

  return false;
}

function findExactTarget(container: Element, id: string, index?: ProtocolIndex): Node | undefined {
  const range = findExactRange(container, id, index);
  if (!range) return findExactElement(container, id, index);
  let node = range.start.nextSibling;
  while (node && node !== range.end) {
    if (node.nodeType !== Node.COMMENT_NODE) return node;
    node = node.nextSibling;
  }
  return undefined;
}

function findExactElement(container: Element, id: string, index?: ProtocolIndex): Element | undefined {
  if (index) return index.exactElements.get(id);
  return findElementByExactAttribute(container, "data-exact-id", id);
}

function findServerSlotElement(container: Element, id: string, index?: ProtocolIndex): Element | undefined {
  if (index) return index.serverSlots.get(id);
  return findElementByExactAttribute(container, "data-exact-server-slot", id);
}

function findClientBoundaryElement(container: Element, id: string, index?: ProtocolIndex): Element | undefined {
  if (index) return index.clientBoundaries.get(id);
  return findElementByExactAttribute(container, "data-exact-client-boundary", id);
}

function findElementByExactAttribute(container: Element, attribute: string, id: string): Element | undefined {
  if (container.getAttribute(attribute) === id) return container;
  for (const element of Array.from(container.querySelectorAll(`[${attribute}]`))) {
    if (element.getAttribute(attribute) === id) return element;
  }
  return undefined;
}

function findExactElementTarget(container: Element, id: string, index?: ProtocolIndex): Element | undefined {
  const exact = findExactElement(container, id, index);
  if (exact) return exact;
  const range = findExactRange(container, id, index);
  if (!range) return undefined;
  let node = range.start.nextSibling;
  while (node && node !== range.end) {
    if (node.nodeType === Node.ELEMENT_NODE) return node as Element;
    node = node.nextSibling;
  }
  return undefined;
}

function findExactRange(container: Element, id: string, index?: ProtocolIndex): ExactRange | undefined {
  if (index) return index.ranges.get(id);
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_COMMENT);
  let start: Comment | undefined;
  while (walker.nextNode()) {
    const comment = walker.currentNode as Comment;
    if (comment.data === `exact:${id}`) start = comment;
    if (start && comment.data === `/exact:${id}`) return { start, end: comment };
  }
  return undefined;
}

function findExactItemRange(
  container: Element,
  key: string,
  within?: { start: Comment; end: Comment }
): { start: Comment; end: Comment } | undefined {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_COMMENT);
  let inRange = !within;
  let start: Comment | undefined;
  while (walker.nextNode()) {
    const comment = walker.currentNode as Comment;
    if (within && comment === within.start) {
      inRange = true;
      continue;
    }
    if (within && comment === within.end) return undefined;
    if (!inRange) continue;
    if (isExactItemStart(comment, key)) start = comment;
    if (start && comment.data === `/${start.data}`) return { start, end: comment };
  }
  return undefined;
}

function isExactItemStart(comment: Comment, key: string): boolean {
  if (!comment.data.startsWith("exact:item:")) return false;
  const suffix = comment.data.slice(comment.data.lastIndexOf(":") + 1);
  return suffix === key || suffix === encodeExactMarkerPart(key) || comment.data.endsWith(`:${key}`);
}

function findIndexedItem(index: ProtocolIndex, listId: string, key: string): ExactRange | undefined {
  const items = index.listItems.get(listId);
  if (!items) return undefined;
  return items.get(key) ?? items.get(encodeExactMarkerPart(key));
}

function createProtocolIndex(container: Element): ProtocolIndex | undefined {
  const index: ProtocolIndex = {
    ranges: new Map(), exactElements: new Map(), serverSlots: new Map(),
    clientBoundaries: new Map(), listItems: new Map()
  };
  const attributes: Array<[string, Map<string, Element>]> = [
    ["data-exact-id", index.exactElements],
    ["data-exact-server-slot", index.serverSlots],
    ["data-exact-client-boundary", index.clientBoundaries]
  ];
  for (const [attribute, output] of attributes) {
    for (const element of [container, ...Array.from(container.querySelectorAll(`[${attribute}]`))]) {
      const value = element.getAttribute(attribute);
      if (value === null) continue;
      if (output.has(value)) return undefined;
      output.set(value, element);
    }
  }
  const stack: Array<{ data: string; id: string; start: Comment; listId?: string; itemKey?: string }> = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_COMMENT);
  while (walker.nextNode()) {
    const comment = walker.currentNode as Comment;
    const data = comment.data;
    if (data.startsWith("/exact:")) {
      const open = stack.pop();
      if (!open || data !== `/${open.data}`) return undefined;
      const range = { start: open.start, end: comment };
      if (open.itemKey !== undefined && open.listId) {
        let items = index.listItems.get(open.listId);
        if (!items) index.listItems.set(open.listId, items = new Map());
        if (items.has(open.itemKey)) return undefined;
        items.set(open.itemKey, range);
      } else {
        if (index.ranges.has(open.id)) return undefined;
        index.ranges.set(open.id, range);
      }
      continue;
    }
    if (!data.startsWith("exact:")) continue;
    const id = data.slice("exact:".length);
    const itemKey = id.startsWith("item:") ? id.slice(id.lastIndexOf(":") + 1) : undefined;
    const listId = itemKey === undefined ? undefined
      : [...stack].reverse().find(entry => entry.itemKey === undefined)?.id;
    stack.push({ data, id, start: comment, listId, itemKey });
  }
  return stack.length ? undefined : index;
}

function reindexList(index: ProtocolIndex, listId: string): void {
  const list = index.ranges.get(listId);
  if (!list) return;
  const items = new Map<string, ExactRange>();
  let cursor: Node | null = list.start.nextSibling;
  const starts = new Map<string, Comment>();
  while (cursor && cursor !== list.end) {
    if (cursor instanceof Comment && cursor.data.startsWith("exact:item:")) {
      starts.set(cursor.data, cursor);
    } else if (cursor instanceof Comment && cursor.data.startsWith("/exact:item:")) {
      const data = cursor.data.slice(1);
      const start = starts.get(data);
      if (start) items.set(data.slice(data.lastIndexOf(":") + 1), { start, end: cursor });
    }
    cursor = cursor.nextSibling;
  }
  index.listItems.set(listId, items);
}

function replaceRange(range: { start: Comment; end: Comment }, html: string): void {
  let cursor = range.start.nextSibling;
  while (cursor && cursor !== range.end) {
    const next = cursor.nextSibling;
    cursor.parentNode?.removeChild(cursor);
    cursor = next;
  }
  if (!html) return;
  const parent = range.end.parentNode;
  if (parent) parent.insertBefore(parseFragment(parent, html), range.end);
}

function replaceElementChildren(element: Element, html: string): void {
  element.replaceChildren();
  if (!html) return;
  element.appendChild(parseFragment(element, html));
}

function replaceElement(element: Element, html: string): void {
  if (!html) {
    element.remove();
    return;
  }
  const parent = element.parentNode;
  if (parent) element.replaceWith(parseFragment(parent, html));
}

function insertHtmlBefore(anchor: Node, html: string): void {
  const parent = anchor.parentNode;
  if (parent) parent.insertBefore(parseFragment(parent, html), anchor);
}

function parseFragment(parent: Node, html: string): DocumentFragment {
  if (parent instanceof Element) {
    const range = document.createRange();
    range.selectNodeContents(parent);
    return range.createContextualFragment(html);
  }
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content;
}

function moveRangeBefore(range: { start: Comment; end: Comment }, anchor: Node): void {
  if (isNodeInsideRange(anchor, range)) return;
  const fragment = document.createDocumentFragment();
  let cursor: Node | null = range.start;
  while (cursor) {
    const next: Node | null = cursor.nextSibling;
    fragment.appendChild(cursor);
    if (cursor === range.end) break;
    cursor = next;
  }
  anchor.parentNode?.insertBefore(fragment, anchor);
}

function isNodeInsideRange(node: Node, range: { start: Comment; end: Comment }): boolean {
  let cursor: Node | null = range.start;
  while (cursor) {
    if (cursor === node) return true;
    if (cursor === range.end) return false;
    cursor = cursor.nextSibling;
  }
  return false;
}
