import { logFrameworkEvent, type Logger } from "@exact/core";
import type { ExactPatch } from "@exact/server";
import { cssEscape } from "./dom.js";

export type PatchOptions = {
  logger?: Logger;
  onMismatch?: "replace" | "throw";
};

/** Applies server-generated patches to an existing hydrated container. */
export function applyPatches(container: Element, patches: readonly ExactPatch[], options: PatchOptions = {}): boolean {
  for (const patch of patches) {
    const ok = applyPatch(container, patch);
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
export function reportMismatch(options: PatchOptions, message: string): void {
  logFrameworkEvent("warn", "hydrate", "mismatch", message, undefined, options.logger);
}

function applyPatch(container: Element, patch: ExactPatch): boolean {
  if (patch.type === "text") {
    const target = findExactTarget(container, patch.id) ?? findServerSlotElement(container, patch.id);
    if (!target) return false;
    target.textContent = patch.value;
    return true;
  }

  if (patch.type === "prop") {
    const target = findExactElementTarget(container, patch.id);
    if (!target) return false;
    if (patch.value === false || patch.value === null || patch.value === undefined) {
      target.removeAttribute(patch.name);
    } else {
      target.setAttribute(patch.name, String(patch.value));
    }
    return true;
  }

  if (patch.type === "style") {
    const target = findExactElementTarget(container, patch.id) as HTMLElement | undefined;
    if (!target) return false;
    if (patch.value === null) target.style.removeProperty(patch.name);
    else target.style.setProperty(patch.name, patch.value);
    return true;
  }

  if (patch.type === "replace") {
    const range = findExactRange(container, patch.id);
    if (!range) {
      const clientBoundary = findClientBoundaryElement(container, patch.id);
      if (clientBoundary) {
        replaceElement(clientBoundary, patch.html);
        return true;
      }
      const exactElement = findExactElement(container, patch.id);
      if (exactElement) {
        replaceElement(exactElement, patch.html);
        return true;
      }
      const slot = findServerSlotElement(container, patch.id);
      if (!slot) return false;
      replaceElementChildren(slot, patch.html);
      return true;
    }
    replaceRange(range, patch.html);
    return true;
  }

  if (patch.type === "state") {
    const target = findExactElement(container, patch.id);
    if (!target) return false;
    target.setAttribute("data-exact-state", JSON.stringify(patch.value));
    return true;
  }

  if (patch.type === "list") {
    const range = findExactRange(container, patch.id);
    if (!range) return false;
    if (patch.op === "remove") {
      const item = findExactItemRange(container, patch.key, range);
      if (!item) return false;
      replaceRange(item, "");
      return true;
    }
    const before = patch.before ? findExactItemRange(container, patch.before, range) : undefined;
    const anchor = before?.start ?? range.end;
    if (patch.op === "move") {
      const item = findExactItemRange(container, patch.key, range);
      if (!item) {
        // A missing moved item can still be recovered if the server included fresh HTML.
        // This keeps list patching resilient across stale client snapshots.
        if (!patch.html) return false;
        insertHtmlBefore(anchor, patch.html);
        return true;
      }
      moveRangeBefore(item, anchor);
      return true;
    }
    if (!patch.html) return false;
    insertHtmlBefore(anchor, patch.html);
    return true;
  }

  return false;
}

function findExactTarget(container: Element, id: string): Node | undefined {
  const range = findExactRange(container, id);
  if (!range) return findExactElement(container, id);
  let node = range.start.nextSibling;
  while (node && node !== range.end) {
    if (node.nodeType !== Node.COMMENT_NODE) return node;
    node = node.nextSibling;
  }
  return undefined;
}

function findExactElement(container: Element, id: string): Element | undefined {
  return container.querySelector(`[data-exact-id="${cssEscape(id)}"]`) ?? undefined;
}

function findServerSlotElement(container: Element, id: string): Element | undefined {
  return container.querySelector(`[data-exact-server-slot="${cssEscape(id)}"]`) ?? undefined;
}

function findClientBoundaryElement(container: Element, id: string): Element | undefined {
  return container.querySelector(`[data-exact-client-boundary="${cssEscape(id)}"]`) ?? undefined;
}

function findExactElementTarget(container: Element, id: string): Element | undefined {
  const exact = findExactElement(container, id);
  if (exact) return exact;
  const range = findExactRange(container, id);
  if (!range) return undefined;
  let node = range.start.nextSibling;
  while (node && node !== range.end) {
    if (node.nodeType === Node.ELEMENT_NODE) return node as Element;
    node = node.nextSibling;
  }
  return undefined;
}

function findExactRange(container: Element, id: string): { start: Comment; end: Comment } | undefined {
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
  return comment.data.startsWith("exact:item:") && comment.data.endsWith(`:${key}`);
}

function replaceRange(range: { start: Comment; end: Comment }, html: string): void {
  let cursor = range.start.nextSibling;
  while (cursor && cursor !== range.end) {
    const next = cursor.nextSibling;
    cursor.parentNode?.removeChild(cursor);
    cursor = next;
  }
  if (!html) return;
  const template = document.createElement("template");
  template.innerHTML = html;
  range.end.parentNode?.insertBefore(template.content, range.end);
}

function replaceElementChildren(element: Element, html: string): void {
  element.replaceChildren();
  if (!html) return;
  const template = document.createElement("template");
  template.innerHTML = html;
  element.appendChild(template.content);
}

function replaceElement(element: Element, html: string): void {
  if (!html) {
    element.remove();
    return;
  }
  const template = document.createElement("template");
  template.innerHTML = html;
  element.replaceWith(template.content);
}

function insertHtmlBefore(anchor: Node, html: string): void {
  const template = document.createElement("template");
  template.innerHTML = html;
  anchor.parentNode?.insertBefore(template.content, anchor);
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
