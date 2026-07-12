import type { ExactPatch } from "@exact/server";
import { escapeAttr, escapeText, voidElements } from "./html.js";
import type { BoundaryRefreshOptions, KeyedListSnapshotItem } from "./types.js";

type ParsedHtmlNode = ParsedHtmlElement | ParsedHtmlText;

type ParsedHtmlElement = {
  kind: "element";
  tagName: string;
  attributes: Map<string, string>;
  children: ParsedHtmlNode[];
};

type ParsedHtmlText = {
  kind: "text";
  value: string;
};

/** Diffs two framework-shaped boundary HTML strings into patches or a replacement fallback. */
export function diffBoundaryHtml(
  boundaryId: string,
  previousHtml: string,
  nextHtml: string,
  strategy: BoundaryRefreshOptions["patchStrategy"] = "replace"
): ExactPatch[] {
  if (previousHtml === nextHtml) return [];
  if (strategy === "text" && isTextOnlyHtml(previousHtml) && isTextOnlyHtml(nextHtml)) {
    return [boundaryPatch(boundaryId, nextHtml, "text")];
  }
  if (strategy === "element") {
    const exactPatches = diffExactElementHtml(previousHtml, nextHtml);
    if (exactPatches) return exactPatches;

    const previous = parseSimpleElement(previousHtml);
    const next = parseSimpleElement(nextHtml);
    if (previous && next && previous.tagName === next.tagName) {
      const targetId = next.attributes.get("data-exact-id") ?? previous.attributes.get("data-exact-id") ?? boundaryId;
      const patches: ExactPatch[] = [];
      for (const [name, value] of next.attributes) {
        if (name === "data-exact-id") continue;
        if (previous.attributes.get(name) !== value) {
          patches.push({ type: "prop", id: targetId, name, value });
        }
      }
      for (const name of previous.attributes.keys()) {
        if (name === "data-exact-id") continue;
        if (!next.attributes.has(name)) {
          patches.push({ type: "prop", id: targetId, name, value: null });
        }
      }
      if (previous.text !== next.text) {
        patches.push({ type: "text", id: targetId, value: decodeEscapedText(next.text) });
      }
      return patches.length ? patches : [];
    }
  }
  return [boundaryPatch(boundaryId, nextHtml, "replace")];
}

function diffExactElementHtml(previousHtml: string, nextHtml: string): ExactPatch[] | undefined {
  // This parser intentionally handles eXact-generated HTML, not arbitrary browser HTML.
  // Returning undefined is the signal to fall back to a boundary replacement.
  const previousTree = parseHtmlNodes(previousHtml);
  const nextTree = parseHtmlNodes(nextHtml);
  if (!previousTree || !nextTree) return undefined;

  const previousById = collectExactElements(previousTree);
  const nextById = collectExactElements(nextTree);
  if (!previousById.size && !nextById.size) return undefined;
  if (!sameKeys(previousById, nextById)) return rootExactElementReplace(previousTree, nextTree, nextHtml);

  const patches: ExactPatch[] = [];
  for (const [id, next] of nextById) {
    const previous = previousById.get(id);
    if (!previous) return undefined;
    if (previous.tagName !== next.tagName) {
      const nestedReplacements = nestedExactElementReplace(previousTree, nextTree);
      if (nestedReplacements) return [...patches, ...nestedReplacements];
      return rootExactElementReplace(previousTree, nextTree, nextHtml);
    }

    for (const [name, value] of next.attributes) {
      if (name === "data-exact-id") continue;
      if (previous.attributes.get(name) !== value) {
        if (name === "style") {
          const stylePatches = diffStyleAttribute(id, previous.attributes.get(name), value);
          if (!stylePatches) return undefined;
          patches.push(...stylePatches);
        } else {
          patches.push({ type: "prop", id, name, value });
        }
      }
    }
    for (const name of previous.attributes.keys()) {
      if (name === "data-exact-id") continue;
      if (!next.attributes.has(name)) {
        if (name === "style") {
          const stylePatches = diffStyleAttribute(id, previous.attributes.get(name), undefined);
          if (!stylePatches) return undefined;
          patches.push(...stylePatches);
        } else {
          patches.push({ type: "prop", id, name, value: null });
        }
      }
    }

    const previousText = textOnlyContent(previous);
    const nextText = textOnlyContent(next);
    if (previousText !== undefined || nextText !== undefined) {
      if (previousText === undefined || nextText === undefined) {
        const nestedReplacements = nestedExactElementReplace(previousTree, nextTree);
        if (nestedReplacements) return [...patches, ...nestedReplacements];
        return rootExactElementReplace(previousTree, nextTree, nextHtml);
      }
      if (previousText !== nextText) patches.push({ type: "text", id, value: nextText });
    }
  }

  if (normalizedHtmlShape(previousTree) === normalizedHtmlShape(nextTree)) return patches;
  const nestedReplacements = nestedExactElementReplace(previousTree, nextTree);
  if (nestedReplacements) return [...patches, ...nestedReplacements];
  return rootExactElementReplace(previousTree, nextTree, nextHtml);
}

function nestedExactElementReplace(
  previousTree: readonly ParsedHtmlNode[],
  nextTree: readonly ParsedHtmlNode[]
): ExactPatch[] | undefined {
  const previousById = collectExactElements(previousTree);
  const nextEntries = collectExactElementEntries(nextTree).sort((left, right) => right.depth - left.depth);
  const selectedIds = new Set<string>();
  const patches: ExactPatch[] = [];

  for (const { id, element: next } of nextEntries) {
    const previous = previousById.get(id);
    if (!previous) continue;
    if ([...selectedIds].some(selectedId => containsExactElement(next, selectedId))) continue;
    if (normalizedHtmlShape([previous]) === normalizedHtmlShape([next])) continue;
    selectedIds.add(id);
    patches.push({ type: "replace", id, html: serializeParsedHtmlElement(next) });
  }

  return patches.length ? patches : undefined;
}

function containsExactElement(element: ParsedHtmlElement, id: string): boolean {
  for (const child of element.children) {
    if (child.kind !== "element") continue;
    if (child.attributes.get("data-exact-id") === id || containsExactElement(child, id)) return true;
  }
  return false;
}

function rootExactElementReplace(
  previousTree: readonly ParsedHtmlNode[],
  nextTree: readonly ParsedHtmlNode[],
  nextHtml: string
): ExactPatch[] | undefined {
  if (previousTree.length !== 1 || nextTree.length !== 1) return undefined;
  const previous = previousTree[0];
  const next = nextTree[0];
  if (previous?.kind !== "element" || next?.kind !== "element") return undefined;
  const id = previous.attributes.get("data-exact-id");
  if (!id || next.attributes.get("data-exact-id") !== id || previous.tagName !== next.tagName) return undefined;
  return [{ type: "replace", id, html: nextHtml }];
}

/** Diffs keyed list snapshots into remove, insert, and move patches. */
export function diffKeyedListItems(
  listId: string,
  previousItems: readonly KeyedListSnapshotItem[],
  nextItems: readonly KeyedListSnapshotItem[]
): ExactPatch[] {
  const patches: ExactPatch[] = [];
  const previousKeys = previousItems.map(item => item.key);
  const nextKeys = nextItems.map(item => item.key);
  const previousByKey = new Map(previousItems.map(item => [item.key, item]));
  const nextByKey = new Map(nextItems.map(item => [item.key, item]));

  for (const key of previousKeys) {
    if (!nextByKey.has(key)) {
      patches.push({ type: "list", id: listId, op: "remove", key });
    }
  }

  const working = previousKeys.filter(key => nextByKey.has(key));
  for (let index = 0; index < nextKeys.length; index++) {
    const key = nextKeys[index]!;
    const before = nextKeys[index + 1];
    const previous = previousByKey.get(key);
    const next = nextByKey.get(key)!;
    const currentIndex = working.indexOf(key);
    if (!previous) {
      patches.push({ type: "list", id: listId, op: "insert", key, before, html: next.html });
      working.splice(index, 0, key);
      continue;
    }
    if (previous.html !== next.html) {
      patches.push({ type: "list", id: listId, op: "remove", key });
      patches.push({ type: "list", id: listId, op: "insert", key, before, html: next.html });
      if (currentIndex >= 0) working.splice(currentIndex, 1);
      working.splice(index, 0, key);
      continue;
    }
    if (currentIndex !== index) {
      patches.push({ type: "list", id: listId, op: "move", key, before });
      if (currentIndex >= 0) working.splice(currentIndex, 1);
      working.splice(index, 0, key);
    }
  }

  return patches;
}

function parseHtmlNodes(html: string): ParsedHtmlNode[] | undefined {
  const root: ParsedHtmlElement = { kind: "element", tagName: "", attributes: new Map(), children: [] };
  const stack: ParsedHtmlElement[] = [root];
  const tokenPattern = /<!--[\s\S]*?-->|<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s+[^<>]*)?>|[^<]+/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(html))) {
    if (match.index !== lastIndex) return undefined;
    const token = match[0];
    lastIndex = tokenPattern.lastIndex;
    if (token.startsWith("<!--")) continue;

    const parent = stack[stack.length - 1]!;
    if (token.startsWith("</")) {
      const tagName = token.slice(2, -1).trim().toLowerCase();
      const current = stack.pop();
      if (!current || current === root || current.tagName !== tagName) return undefined;
      continue;
    }

    if (token.startsWith("<")) {
      const start = /^<([A-Za-z][A-Za-z0-9:-]*)([^<>]*?)(\/?)>$/.exec(token);
      if (!start) return undefined;
      const tagName = start[1]!.toLowerCase();
      const attributes = parseSimpleAttributes(start[2] ?? "");
      if (!attributes) return undefined;
      const element: ParsedHtmlElement = { kind: "element", tagName, attributes, children: [] };
      parent.children.push(element);
      if (!start[3] && !voidElements.has(tagName)) stack.push(element);
      continue;
    }

    parent.children.push({ kind: "text", value: decodeEscapedText(token) });
  }

  if (lastIndex !== html.length || stack.length !== 1) return undefined;
  return root.children;
}

function collectExactElements(nodes: readonly ParsedHtmlNode[], output = new Map<string, ParsedHtmlElement>()): Map<string, ParsedHtmlElement> {
  for (const node of nodes) {
    if (node.kind !== "element") continue;
    const id = node.attributes.get("data-exact-id");
    if (id) output.set(id, node);
    collectExactElements(node.children, output);
  }
  return output;
}

function collectExactElementEntries(
  nodes: readonly ParsedHtmlNode[],
  output: { id: string; element: ParsedHtmlElement; depth: number }[] = [],
  depth = 0
): { id: string; element: ParsedHtmlElement; depth: number }[] {
  for (const node of nodes) {
    if (node.kind !== "element") continue;
    const id = node.attributes.get("data-exact-id");
    if (id) output.push({ id, element: node, depth });
    collectExactElementEntries(node.children, output, depth + 1);
  }
  return output;
}

function sameKeys<T>(left: Map<string, T>, right: Map<string, T>): boolean {
  if (left.size !== right.size) return false;
  for (const key of left.keys()) {
    if (!right.has(key)) return false;
  }
  return true;
}

function textOnlyContent(element: ParsedHtmlElement): string | undefined {
  let text = "";
  for (const child of element.children) {
    if (child.kind !== "text") return undefined;
    text += child.value;
  }
  return text;
}

function diffStyleAttribute(id: string, previous: string | undefined, next: string | undefined): ExactPatch[] | undefined {
  const previousStyle = parseStyleAttribute(previous ?? "");
  const nextStyle = parseStyleAttribute(next ?? "");
  if (!previousStyle || !nextStyle) return undefined;
  const patches: ExactPatch[] = [];
  for (const [name, value] of nextStyle) {
    if (previousStyle.get(name) !== value) {
      patches.push({ type: "style", id, name, value });
    }
  }
  for (const name of previousStyle.keys()) {
    if (!nextStyle.has(name)) {
      patches.push({ type: "style", id, name, value: null });
    }
  }
  return patches;
}

function parseStyleAttribute(value: string): Map<string, string> | undefined {
  const styles = new Map<string, string>();
  const trimmed = value.trim();
  if (!trimmed) return styles;
  for (const declaration of trimmed.split(";")) {
    const part = declaration.trim();
    if (!part) continue;
    const separator = part.indexOf(":");
    if (separator <= 0) return undefined;
    const name = part.slice(0, separator).trim();
    const styleValue = part.slice(separator + 1).trim();
    if (!name || !styleValue) return undefined;
    styles.set(name, styleValue);
  }
  return styles;
}

function normalizedHtmlShape(nodes: readonly ParsedHtmlNode[]): string {
  return nodes.map(node => {
    if (node.kind === "text") return `t:${node.value}`;
    const id = node.attributes.get("data-exact-id");
    const attrs = id ? `#${id}` : Array.from(node.attributes)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => `${name}=${value}`)
      .join(",");
    const childShape = id && textOnlyContent(node) !== undefined
      ? "text"
      : normalizedHtmlShape(node.children);
    return `e:${node.tagName}[${attrs}](${childShape})`;
  }).join("");
}

function serializeParsedHtmlElement(element: ParsedHtmlElement): string {
  const attributes = Array.from(element.attributes)
    .map(([name, value]) => value === "true" ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`)
    .join("");
  if (voidElements.has(element.tagName)) return `<${element.tagName}${attributes}>`;
  return `<${element.tagName}${attributes}>${element.children.map(serializeParsedHtmlNode).join("")}</${element.tagName}>`;
}

function serializeParsedHtmlNode(node: ParsedHtmlNode): string {
  return node.kind === "text"
    ? escapeText(node.value)
    : serializeParsedHtmlElement(node);
}

/** Creates the fallback patch for a refreshed boundary according to the selected strategy. */
export function boundaryPatch(boundaryId: string, html: string, strategy: BoundaryRefreshOptions["patchStrategy"]): ExactPatch {
  if (strategy === "text" && isTextOnlyHtml(html)) {
    return {
      type: "text",
      id: boundaryId,
      value: decodeEscapedText(html)
    };
  }
  return {
    type: "replace",
    id: boundaryId,
    html
  };
}

function isTextOnlyHtml(html: string): boolean {
  return !/[<>]/.test(html);
}

function decodeEscapedText(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseSimpleElement(html: string): { tagName: string; attributes: Map<string, string>; text: string } | undefined {
  const match = /^<([A-Za-z][A-Za-z0-9:-]*)([^>]*)>([^<>]*)<\/\1>$/.exec(html);
  if (!match) return undefined;
  const [, tagName, rawAttributes, text] = match;
  const attributes = parseSimpleAttributes(rawAttributes ?? "");
  if (!attributes) return undefined;
  return { tagName: tagName!.toLowerCase(), attributes, text: text ?? "" };
}

function parseSimpleAttributes(raw: string): Map<string, string> | undefined {
  const attributes = new Map<string, string>();
  let rest = raw.trim();
  while (rest) {
    const match = /^([A-Za-z_:][A-Za-z0-9_:.-]*)(?:="([^"]*)")?/.exec(rest);
    if (!match) return undefined;
    attributes.set(match[1]!, decodeEscapedText(match[2] ?? "true"));
    rest = rest.slice(match[0].length).trim();
  }
  return attributes;
}
