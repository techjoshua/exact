import {
  attemptCleanup, createCleanupFailure, encodeExactMarkerPart, logFrameworkEvent, throwCleanupFailure,
  type CleanupFailure, type Logger
} from "@exact/core";
import {
  applyDomProp, consumeDomWork, createDomWorkBudget, disposeOwnedSubtree, reserveDomWork, walkDomSubtree,
  type DomWorkBudget
} from "@exact/dom";
import type { ExactPatch } from "@exact/server";
import type { HydrationDiagnostic } from "./types.js";

export type PatchOptions = {
  logger?: Logger;
  onMismatch?: "replace" | "throw";
  onDiagnostic?: (diagnostic: HydrationDiagnostic) => void;
  maxTreeNodes?: number;
  workBudget?: DomWorkBudget;
};

/** Applies server-generated patches to an existing hydrated container. */
export function applyPatches(container: Element, patches: readonly ExactPatch[], options: PatchOptions = {}): boolean {
  if (!patches.length) return true;
  const index = createProtocolIndex(container, options.workBudget ?? options.maxTreeNodes);
  if (!index || !validatePatchSequence(index, patches) || !validatePatchTopology(index, patches)) {
    const failed = patches.find(patch => !index || !canApplyPatch(index, patch));
    const detail = failed ? `${failed.type}:${failed.id}` : "invalid marker topology";
    reportMismatch(options, `could not atomically apply exact patches (${detail})`, "invalid-patch", failed);
    if (options.onMismatch === "throw") throw new Error(`Could not apply exact patch batch (${detail})`);
    return false;
  }

  const prepared = preparePatchBatch(container, index, patches);
  if (!prepared.ok) {
    reportMismatch(options, `could not atomically apply exact patches (${prepared.detail})`, "invalid-patch");
    if (options.onMismatch === "throw") throw new Error(`Could not apply exact patch batch (${prepared.detail})`);
    return false;
  }

  // Patches target compiler-owned server boundaries. Disposing the containing
  // renderer root here would tear down unrelated client components even for a
  // text/attribute patch and leave retained DOM inert.
  const cleanupFailure = createCleanupFailure();
  const commitBudget = createDomWorkBudget(Number.MAX_SAFE_INTEGER);
  for (let patchIndex = 0; patchIndex < patches.length; patchIndex++) {
    const patch = patches[patchIndex]!;
    const ok = applyPatch(container, patch, index, prepared.patches[patchIndex], commitBudget, cleanupFailure);
    if (!ok) {
      throw new Error(`Prepared exact patch invariant failed for ${patch.type}:${patch.id}`);
    }
  }
  throwCleanupFailure(cleanupFailure);
  return true;
}

/** Returns whether a container contains eXact comment markers for hydration patching. */
export function hasExactMarkers(container: Element, work?: number | DomWorkBudget): boolean {
  let found = false;
  walkDomSubtree(container, node => {
    if (node instanceof Comment && node.data.startsWith("exact:")) found = true;
  }, typeof work === "number" ? { maxNodes: work } : { budget: work });
  return found;
}

/** Returns the current HTML inside an exact boundary or slot. */
export function boundaryInnerHtml(container: Element, id: string, work?: number | DomWorkBudget): string | undefined {
  const index = createProtocolIndex(container, work);
  if (!index) return undefined;
  return indexedBoundaryHtml(container, index, id);
}

/** Reads several boundary snapshots through one bounded protocol index pass. */
export function boundaryInnerHtmls(container: Element, ids: readonly string[], work?: number | DomWorkBudget): Record<string, string> {
  const index = createProtocolIndex(container, work);
  if (!index) return {};
  const htmls: Record<string, string> = {};
  for (const id of ids) {
    const html = indexedBoundaryHtml(container, index, id);
    if (html !== undefined) htmls[id] = html;
  }
  return htmls;
}

function indexedBoundaryHtml(container: Element, index: ProtocolIndex, id: string): string | undefined {
  const range = index.ranges.get(id);
  if (!range) return findServerSlotElement(container, id, index)?.innerHTML ?? findClientBoundaryElement(container, id, index)?.outerHTML;
  const wrapper = document.createElement("div");
  let cursor = range.start.nextSibling;
  while (cursor && cursor !== range.end) {
    wrapper.appendChild(cursor.cloneNode(true));
    cursor = cursor.nextSibling;
  }
  return wrapper.innerHTML;
}

/**
 * Resolves a patch target to the innermost declared boundary that contains it.
 * This is used to discard only the stale portion of an overlapping action
 * response without allowing patches to escape the action's declared contract.
 */
export function createPatchBoundaryResolver(
  container: Element,
  boundaryIds: readonly string[],
  work?: number | DomWorkBudget
): (patchId: string) => string | undefined {
  const index = createProtocolIndex(container, work);
  if (!index) return () => undefined;
  const boundaries = boundaryIds.flatMap(id => {
    const target = protocolTarget(index, id);
    return target ? [{ id, target }] : [];
  });
  const ids = new Set(boundaries.map(boundary => boundary.id));
  return patchId => {
    if (ids.has(patchId)) return patchId;
    const target = protocolTarget(index, patchId);
    if (!target) return undefined;
    let owner: { id: string; target: Node | ExactRange } | undefined;
    for (const candidate of boundaries) {
      if (!protocolTargetContains(candidate.target, target)) continue;
      if (!owner || protocolTargetContains(owner.target, candidate.target)) owner = candidate;
    }
    return owner?.id;
  };
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
  budget: DomWorkBudget;
};

type PreparedPatch = { fragment?: DocumentFragment; stateJson?: string };
type PreparedBatch = { ok: true; patches: PreparedPatch[] } | { ok: false; detail: string };

function protocolTarget(index: ProtocolIndex, id: string): Node | ExactRange | undefined {
  return index.ranges.get(id) ?? index.exactElements.get(id)
    ?? index.serverSlots.get(id) ?? index.clientBoundaries.get(id);
}

function protocolTargetContains(container: Node | ExactRange, target: Node | ExactRange): boolean {
  const targetNode = target instanceof Node ? target : target.start;
  if (container instanceof Node) return container === targetNode || container.contains(targetNode);
  if (targetNode === container.start || targetNode === container.end) return true;
  const parent = container.start.parentNode;
  if (!parent || container.end.parentNode !== parent) return false;
  let direct: Node | null = targetNode;
  while (direct?.parentNode && direct.parentNode !== parent) direct = direct.parentNode;
  if (!direct || direct.parentNode !== parent) return false;
  for (let cursor = container.start.nextSibling; cursor && cursor !== container.end; cursor = cursor.nextSibling) {
    if (cursor === direct) return true;
  }
  return false;
}

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
    } else if (!has(list, patch.key)) {
      if (!patch.html) return false;
      list.add(patch.key);
    }
  }
  return true;
}

function validatePatchTopology(index: ProtocolIndex, patches: readonly ExactPatch[]): boolean {
  const targets = patches.map(patch => protocolTarget(index, patch.id));
  for (let left = 0; left < patches.length; left++) {
    const leftPatch = patches[left]!;
    if (!isStructuralPatch(leftPatch) || !targets[left]) continue;
    for (let right = 0; right < patches.length; right++) {
      if (left === right || !targets[right]) continue;
      const rightPatch = patches[right]!;
      if (leftPatch.type === "list" && rightPatch.type === "list" && leftPatch.id === rightPatch.id) continue;
      if (leftPatch.type === "text" && leftPatch.id === rightPatch.id) continue;
      if (protocolTargetContains(targets[left]!, targets[right]!)) return false;
    }
  }
  return true;
}

function isStructuralPatch(patch: ExactPatch): boolean {
  return patch.type === "text" || patch.type === "replace" || patch.type === "list";
}

function preparePatchBatch(container: Element, index: ProtocolIndex, patches: readonly ExactPatch[]): PreparedBatch {
  const prepared: PreparedPatch[] = [];
  let commitWork = 0;
  for (const patch of patches) {
    const item: PreparedPatch = {};
    let fragmentNodes = 0;
    if ((patch.type === "replace" || patch.type === "list") && patch.html) {
      const parent = fragmentContext(container, index, patch);
      if (!parent) return { ok: false, detail: `missing fragment context for ${patch.type}:${patch.id}` };
      const parsed = parseFragment(parent, patch.html, index.budget);
      if (patch.type === "list" && !isValidListItemFragment(parsed.fragment, patch.key)) {
        return { ok: false, detail: `list fragment does not declare key ${patch.key}` };
      }
      item.fragment = parsed.fragment;
      fragmentNodes = parsed.nodeCount;
    }
    if (patch.type === "prop") {
      const target = findExactElementTarget(container, patch.id, index);
      if (!target) return { ok: false, detail: `missing prop target ${patch.id}` };
      target.ownerDocument.createAttribute(patch.name);
    }
    if (patch.type === "state") {
      const stateJson = JSON.stringify(patch.value);
      if (stateJson === undefined) return { ok: false, detail: `state ${patch.id} is not JSON serializable` };
      item.stateJson = stateJson;
    }
    const targetNodes = isStructuralPatch(patch) ? countProtocolTargetNodes(index, patch.id) : 0;
    const patchWork = isStructuralPatch(patch) ? targetNodes * 3 + fragmentNodes : 1;
    if (!Number.isSafeInteger(patchWork) || commitWork > Number.MAX_SAFE_INTEGER - patchWork) {
      return { ok: false, detail: "patch work estimate exceeds the safe integer range" };
    }
    commitWork += patchWork;
    prepared.push(item);
  }
  reserveDomWork(index.budget, commitWork);
  return { ok: true, patches: prepared };
}

function fragmentContext(container: Element, index: ProtocolIndex, patch: ExactPatch): Node | undefined {
  if (patch.type === "list") return index.ranges.get(patch.id)?.end.parentNode ?? undefined;
  if (patch.type !== "replace") return undefined;
  const range = index.ranges.get(patch.id);
  if (range) return range.end.parentNode ?? undefined;
  const clientBoundary = findClientBoundaryElement(container, patch.id, index);
  if (clientBoundary) return clientBoundary.parentNode ?? undefined;
  const exactElement = findExactElement(container, patch.id, index);
  if (exactElement) return exactElement.parentNode ?? undefined;
  return findServerSlotElement(container, patch.id, index);
}

function countProtocolTargetNodes(index: ProtocolIndex, id: string): number {
  const target = protocolTarget(index, id);
  if (!target) return 0;
  if (target instanceof Node) return walkDomSubtree(target, () => undefined, { budget: index.budget });
  let count = 0;
  for (let cursor: Node | null = target.start; cursor; cursor = cursor.nextSibling) {
    count += walkDomSubtree(cursor, () => undefined, { budget: index.budget });
    if (cursor === target.end) break;
  }
  return count;
}

function applyPatch(
  container: Element,
  patch: ExactPatch,
  index: ProtocolIndex,
  prepared: PreparedPatch | undefined,
  budget: DomWorkBudget,
  cleanupFailure: CleanupFailure
): boolean {
  if (patch.type === "text") {
    const target = findExactTarget(container, patch.id, index) ?? findServerSlotElement(container, patch.id, index);
    if (!target) return false;
    if (target instanceof Element) attemptCleanup(cleanupFailure, () => disposeOwnedSubtree(target, false, budget));
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
        replaceElement(clientBoundary, prepared?.fragment, budget, cleanupFailure);
        return true;
      }
      const exactElement = findExactElement(container, patch.id, index);
      if (exactElement) {
        replaceElement(exactElement, prepared?.fragment, budget, cleanupFailure);
        return true;
      }
      const slot = findServerSlotElement(container, patch.id, index);
      if (!slot) return false;
      replaceElementChildren(slot, prepared?.fragment, budget, cleanupFailure);
      return true;
    }
    replaceRange(range, prepared?.fragment, budget, cleanupFailure);
    return true;
  }

  if (patch.type === "state") {
    const target = findExactElement(container, patch.id, index);
    if (!target) return false;
    target.setAttribute("data-exact-state", prepared!.stateJson!);
    return true;
  }

  if (patch.type === "list") {
    const range = findExactRange(container, patch.id, index);
    if (!range) return false;
    if (patch.op === "remove") {
      const item = index ? findIndexedItem(index, patch.id, patch.key) : findExactItemRange(container, patch.key, range);
      if (!item) return false;
      replaceRange(item, undefined, budget, cleanupFailure);
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
        insertFragmentBefore(anchor, prepared?.fragment);
        if (index) reindexList(index, patch.id);
        return true;
      }
      moveRangeBefore(item, anchor, budget);
      if (index) reindexList(index, patch.id);
      return true;
    }
    if (!patch.html) return false;
    insertFragmentBefore(anchor, prepared?.fragment);
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
  let match: Element | undefined;
  walkDomSubtree(container, node => {
    if (!match && node instanceof Element && node.getAttribute(attribute) === id) match = node;
  });
  return match;
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
  let start: Comment | undefined;
  let result: ExactRange | undefined;
  walkDomSubtree(container, node => {
    if (result || !(node instanceof Comment)) return;
    const comment = node;
    if (comment.data === `exact:${id}`) start = comment;
    if (start && comment.data === `/exact:${id}`) result = { start, end: comment };
  });
  return result;
}

function findExactItemRange(
  container: Element,
  key: string,
  within?: { start: Comment; end: Comment }
): { start: Comment; end: Comment } | undefined {
  let inRange = !within;
  let start: Comment | undefined;
  let result: ExactRange | undefined;
  walkDomSubtree(container, node => {
    if (result || !(node instanceof Comment)) return;
    const comment = node;
    if (within && comment === within.start) {
      inRange = true;
      return;
    }
    if (within && comment === within.end) { inRange = false; return; }
    if (!inRange) return;
    if (isExactItemStart(comment, key)) start = comment;
    if (start && comment.data === `/${start.data}`) result = { start, end: comment };
  });
  return result;
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

function createProtocolIndex(container: Element, work?: number | DomWorkBudget): ProtocolIndex | undefined {
  const budget = typeof work === "number" || work === undefined ? createDomWorkBudget(work) : work;
  const index: ProtocolIndex = {
    ranges: new Map(), exactElements: new Map(), serverSlots: new Map(),
    clientBoundaries: new Map(), listItems: new Map(), budget
  };
  const attributes: Array<[string, Map<string, Element>]> = [
    ["data-exact-id", index.exactElements],
    ["data-exact-server-slot", index.serverSlots],
    ["data-exact-client-boundary", index.clientBoundaries]
  ];
  const stack: Array<{ data: string; id: string; start: Comment; nearestBoundaryId?: string; listId?: string; itemKey?: string }> = [];
  let valid = true;
  walkDomSubtree(container, node => {
    if (!valid) return;
    if (node instanceof Element) {
      for (const [attribute, output] of attributes) {
        const value = node.getAttribute(attribute);
        if (value === null) continue;
        if (output.has(value)) { valid = false; return; }
        output.set(value, node);
      }
      return;
    }
    if (!(node instanceof Comment)) return;
    const comment = node;
    const data = comment.data;
    if (data.startsWith("/exact:")) {
      const open = stack.pop();
      if (!open || data !== `/${open.data}`) { valid = false; return; }
      const range = { start: open.start, end: comment };
      if (open.itemKey !== undefined && open.listId) {
        let items = index.listItems.get(open.listId);
        if (!items) index.listItems.set(open.listId, items = new Map());
        if (items.has(open.itemKey)) { valid = false; return; }
        items.set(open.itemKey, range);
      } else {
        if (index.ranges.has(open.id)) { valid = false; return; }
        index.ranges.set(open.id, range);
      }
      return;
    }
    if (!data.startsWith("exact:")) return;
    const id = data.slice("exact:".length);
    const itemKey = id.startsWith("item:") ? id.slice(id.lastIndexOf(":") + 1) : undefined;
    const parentBoundary = stack.at(-1)?.nearestBoundaryId;
    const listId = itemKey === undefined ? undefined : parentBoundary;
    const nearestBoundaryId = itemKey === undefined ? id : parentBoundary;
    stack.push({ data, id, start: comment, nearestBoundaryId, listId, itemKey });
  }, { budget });
  return !valid || stack.length ? undefined : index;
}

function reindexList(index: ProtocolIndex, listId: string): void {
  const list = index.ranges.get(listId);
  if (!list) return;
  const items = new Map<string, ExactRange>();
  let cursor: Node | null = list.start.nextSibling;
  const starts = new Map<string, Comment>();
  while (cursor && cursor !== list.end) {
    consumeDomWork(index.budget);
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

function replaceRange(
  range: { start: Comment; end: Comment },
  fragment: DocumentFragment | undefined,
  budget: DomWorkBudget,
  cleanupFailure: CleanupFailure
): void {
  const parent = range.end.parentNode;
  let cursor = range.start.nextSibling;
  while (cursor && cursor !== range.end) {
    consumeDomWork(budget);
    const next = cursor.nextSibling;
    if (cursor instanceof Element) {
      const element = cursor;
      attemptCleanup(cleanupFailure, () => disposeOwnedSubtree(element, true, budget));
    }
    cursor.parentNode?.removeChild(cursor);
    cursor = next;
  }
  if (fragment && parent) parent.insertBefore(fragment, range.end);
}

function replaceElementChildren(
  element: Element,
  fragment: DocumentFragment | undefined,
  budget: DomWorkBudget,
  cleanupFailure: CleanupFailure
): void {
  attemptCleanup(cleanupFailure, () => disposeOwnedSubtree(element, false, budget));
  element.replaceChildren();
  if (fragment) element.appendChild(fragment);
}

function replaceElement(
  element: Element,
  fragment: DocumentFragment | undefined,
  budget: DomWorkBudget,
  cleanupFailure: CleanupFailure
): void {
  attemptCleanup(cleanupFailure, () => disposeOwnedSubtree(element, true, budget));
  if (!fragment) {
    element.remove();
    return;
  }
  element.replaceWith(fragment);
}

function insertFragmentBefore(anchor: Node, fragment: DocumentFragment | undefined): void {
  const parent = anchor.parentNode;
  if (parent && fragment) parent.insertBefore(fragment, anchor);
}

function parseFragment(
  parent: Node,
  html: string,
  budget: DomWorkBudget
): { fragment: DocumentFragment; nodeCount: number } {
  let fragment: DocumentFragment;
  const ownerDocument = parent.nodeType === Node.DOCUMENT_NODE ? parent as Document : parent.ownerDocument;
  if (!ownerDocument) throw new Error("Cannot parse a patch fragment without an owner document");
  if (parent instanceof Element) {
    const range = ownerDocument.createRange();
    range.selectNodeContents(parent);
    fragment = range.createContextualFragment(html);
  } else {
    const template = ownerDocument.createElement("template");
    template.innerHTML = html;
    fragment = template.content;
  }
  const nodeCount = walkDomSubtree(fragment, () => undefined, { budget });
  return { fragment, nodeCount };
}

function isValidListItemFragment(fragment: DocumentFragment, key: string): boolean {
  const stack: string[] = [];
  let started = false;
  let complete = false;
  for (const node of Array.from(fragment.childNodes)) {
    if (node instanceof Comment && node.data.startsWith("exact:")) {
      if (!stack.length) {
        if (started || complete || !isExactItemStart(node, key)) return false;
        started = true;
      }
      stack.push(node.data);
      continue;
    }
    if (node instanceof Comment && node.data.startsWith("/exact:")) {
      const start = stack.pop();
      if (!start || node.data !== `/${start}`) return false;
      if (!stack.length) complete = true;
      continue;
    }
    if (!stack.length && (!(node instanceof Text) || node.data.trim())) return false;
  }
  return started && complete && stack.length === 0;
}

function moveRangeBefore(range: { start: Comment; end: Comment }, anchor: Node, budget?: DomWorkBudget): void {
  if (isNodeInsideRange(anchor, range)) return;
  const fragment = document.createDocumentFragment();
  let cursor: Node | null = range.start;
  while (cursor) {
    if (budget) consumeDomWork(budget);
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
