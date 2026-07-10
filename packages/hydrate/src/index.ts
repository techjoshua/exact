import { render } from "@exact/dom";
import { logFrameworkEvent, type Logger, type VNode } from "@exact/core";
import type { ExactPatch } from "@exact/server";

export type HydrateOptions = {
  endpoint?: string;
  state?: unknown;
  logger?: Logger;
  onMismatch?: "replace" | "throw";
};

export type HydrationRoot = {
  readonly endpoint?: string;
  readonly state?: unknown;
  applyPatches(patches: readonly ExactPatch[]): void;
};

const roots = new WeakMap<Element, HydrationRoot>();

export function hydrate(vnode: VNode, container: Element, options: HydrateOptions = {}): HydrationRoot {
  if (!hasExactMarkers(container)) {
    reportMismatch(options, "missing exact hydration markers");
    render(vnode, container, { logger: options.logger });
  } else {
    render(vnode, container, { logger: options.logger });
  }

  const root: HydrationRoot = {
    endpoint: options.endpoint,
    state: options.state,
    applyPatches(patches) {
      applyPatches(container, patches, options);
    }
  };
  roots.set(container, root);
  return root;
}

export function getHydrationRoot(container: Element): HydrationRoot | undefined {
  return roots.get(container);
}

export function applyPatches(container: Element, patches: readonly ExactPatch[], options: HydrateOptions = {}): void {
  for (const patch of patches) {
    const ok = applyPatch(container, patch);
    if (!ok) {
      reportMismatch(options, `could not apply exact patch ${patch.type}:${patch.id}`);
      if (options.onMismatch === "throw") {
        throw new Error(`Could not apply exact patch ${patch.type}:${patch.id}`);
      }
      return;
    }
  }
}

function applyPatch(container: Element, patch: ExactPatch): boolean {
  if (patch.type === "text") {
    const target = findExactTarget(container, patch.id);
    if (!target) return false;
    target.textContent = patch.value;
    return true;
  }

  if (patch.type === "prop") {
    const target = findExactElement(container, patch.id);
    if (!target) return false;
    if (patch.value === false || patch.value === null || patch.value === undefined) {
      target.removeAttribute(patch.name);
    } else {
      target.setAttribute(patch.name, String(patch.value));
    }
    return true;
  }

  if (patch.type === "style") {
    const target = findExactElement(container, patch.id) as HTMLElement | undefined;
    if (!target) return false;
    if (patch.value === null) target.style.removeProperty(patch.name);
    else target.style.setProperty(patch.name, patch.value);
    return true;
  }

  if (patch.type === "replace") {
    const range = findExactRange(container, patch.id);
    if (!range) return false;
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
      const item = findExactRange(container, `item:${patch.key}`);
      if (!item) return false;
      replaceRange(item, "");
      return true;
    }
    if (!patch.html) return false;
    const template = document.createElement("template");
    template.innerHTML = patch.html;
    range.end.parentNode?.insertBefore(template.content, range.end);
    return true;
  }

  return false;
}

function hasExactMarkers(container: Element): boolean {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_COMMENT);
  while (walker.nextNode()) {
    if ((walker.currentNode as Comment).data.startsWith("exact:")) return true;
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

function reportMismatch(options: HydrateOptions, message: string): void {
  logFrameworkEvent("warn", "hydrate", "mismatch", message, undefined, options.logger);
}

function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/["\\]/g, "\\$&");
}
