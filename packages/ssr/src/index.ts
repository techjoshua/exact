import {
  Cell,
  Dynamic,
  Fragment,
  ServerBoundary,
  ServerSlot,
  Text,
  createComponentInstance,
  createErrorReport,
  createTextVNode,
  getCellVNode,
  handleComponentError,
  isCellVNode,
  isVNode,
  normalizeRenderResult,
  renderInstance,
  withTaskObserver,
  type Child,
  type ComponentFunction,
  type ComponentInstance,
  type Logger,
  type TaskObserver,
  type VNode
} from "@exact/core";
import { unwrap } from "@exact/reactive";
import type { ExactInvocationRequest, ExactInvocationResult, ExactPatch, ExactServerContext, ExactServerManifest, ExactStateContract } from "@exact/server";

export type RenderToStringOptions = {
  markers?: boolean;
  logger?: Logger;
  state?: unknown;
  maxTaskPasses?: number;
};

export type RenderToStringResult = {
  html: string;
  state?: unknown;
};

export type HydrationScriptOptions = {
  endpoint?: string;
  state?: unknown;
  stateContracts?: Record<string, ExactStateContract>;
  actionBoundaries?: Record<string, readonly string[]>;
  scriptId?: string;
  nonce?: string;
};

export type HydratableStringResult = RenderToStringResult & {
  hydrationScript: string;
  htmlWithHydration: string;
};

export type BoundaryRenderFunction = (
  input: ExactInvocationRequest,
  context: ExactServerContext
) => VNode | Promise<VNode>;

export type BoundaryRefreshOptions = RenderToStringOptions & {
  boundaryId: string;
  patchStrategy?: "replace" | "text" | "element";
  previousHtml?(input: ExactInvocationRequest, context: ExactServerContext): string | Promise<string | undefined> | undefined;
};

export type ActionRefreshBoundaryOptions = BoundaryRefreshOptions & {
  render: BoundaryRenderFunction;
};

export type ActionRefreshOptions = {
  action(input: ExactInvocationRequest, context: ExactServerContext): Promise<ExactInvocationResult | void> | ExactInvocationResult | void;
  boundaries: readonly ActionRefreshBoundaryOptions[];
};

export type ExactBoundaryRenderer =
  | BoundaryRenderFunction
  | (Partial<BoundaryRefreshOptions> & { render: BoundaryRenderFunction });

export type ExactServerHandlerRegistryOptions = RenderToStringOptions & {
  manifest: ExactServerManifest;
  actions?: Record<string, (input: ExactInvocationRequest, context: ExactServerContext) => Promise<ExactInvocationResult | void> | ExactInvocationResult | void>;
  boundaries?: Record<string, ExactBoundaryRenderer>;
  patchStrategy?: BoundaryRefreshOptions["patchStrategy"];
};

export type ExactServerHandlerRegistry = {
  actions: NonNullable<ExactServerContext["actions"]>;
  refreshBoundaries: NonNullable<ExactServerContext["refreshBoundaries"]>;
};

export type KeyedListSnapshotItem = {
  key: string;
  html: string;
};

export type KeyedListSnapshot = {
  listId: string;
  html: string;
  innerHtml: string;
  items: KeyedListSnapshotItem[];
};

export type KeyedListSnapshotOptions<T> = RenderToStringOptions & {
  listId: string;
  items: Iterable<T>;
  key(item: T): string;
  render(item: T): VNode;
};

export type KeyedListRefreshOptions<T> = RenderToStringOptions & {
  listId: string;
  key(item: T): string;
  render(item: T): VNode;
  items(input: ExactInvocationRequest, context: ExactServerContext): Iterable<T> | Promise<Iterable<T>>;
  previousItems?(input: ExactInvocationRequest, context: ExactServerContext): readonly KeyedListSnapshotItem[] | Promise<readonly KeyedListSnapshotItem[] | undefined> | undefined;
};

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

type SsrContext = {
  markers: boolean;
  nextId: number;
  logger?: Logger;
};

const voidElements = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"
]);

export function renderToString(vnode: VNode, options: RenderToStringOptions = {}): RenderToStringResult {
  const context: SsrContext = {
    markers: options.markers ?? true,
    nextId: 0,
    logger: options.logger
  };

  return {
    html: renderVNode(context, vnode, undefined),
    state: options.state
  };
}

export function renderToHydratableString(vnode: VNode, options: RenderToStringOptions & HydrationScriptOptions = {}): HydratableStringResult {
  const result = renderToString(vnode, options);
  const hydrationScript = renderHydrationScript({
    endpoint: options.endpoint,
    state: result.state,
    stateContracts: options.stateContracts,
    actionBoundaries: options.actionBoundaries,
    scriptId: options.scriptId,
    nonce: options.nonce
  });
  return {
    ...result,
    hydrationScript,
    htmlWithHydration: `${result.html}${hydrationScript}`
  };
}

export function renderToStream(vnode: VNode, options: RenderToStringOptions = {}): ReadableStream<Uint8Array> {
  const result = renderToString(vnode, options);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(result.html));
      controller.close();
    }
  });
}

export async function renderToStringAsync(vnode: VNode, options: RenderToStringOptions = {}): Promise<RenderToStringResult> {
  const context: SsrContext = {
    markers: options.markers ?? true,
    nextId: 0,
    logger: options.logger
  };

  return {
    html: await renderVNodeAsync(context, vnode, undefined, options),
    state: options.state
  };
}

export async function renderToHydratableStringAsync(vnode: VNode, options: RenderToStringOptions & HydrationScriptOptions = {}): Promise<HydratableStringResult> {
  const result = await renderToStringAsync(vnode, options);
  const hydrationScript = renderHydrationScript({
    endpoint: options.endpoint,
    state: result.state,
    stateContracts: options.stateContracts,
    actionBoundaries: options.actionBoundaries,
    scriptId: options.scriptId,
    nonce: options.nonce
  });
  return {
    ...result,
    hydrationScript,
    htmlWithHydration: `${result.html}${hydrationScript}`
  };
}

export function renderHydrationScript(options: HydrationScriptOptions = {}): string {
  const payloadValue = omitUndefinedProperties({
    endpoint: options.endpoint,
    state: options.state,
    stateContracts: options.stateContracts,
    actionBoundaries: options.actionBoundaries
  });
  if (!isStrictJsonSafe(payloadValue)) {
    throw new Error("Hydration payload must be JSON-serializable");
  }
  const payload = serializeHydrationPayload(payloadValue);
  const id = options.scriptId ?? "__exact_hydration";
  const nonce = options.nonce ? ` nonce="${escapeAttr(options.nonce)}"` : "";
  return `<script type="application/json" id="${escapeAttr(id)}"${nonce}>${payload}</script>`;
}

export function createBoundaryRefreshHandler(
  render: BoundaryRenderFunction,
  options: BoundaryRefreshOptions
): (input: ExactInvocationRequest, context: ExactServerContext) => Promise<ExactInvocationResult> {
  return async (input, context) => {
    const vnode = await render(input, context);
    const result = await renderToStringAsync(vnode, options);
    const previousHtml = await options.previousHtml?.(input, context) ?? input.boundaryHtml;
    return {
      patches: previousHtml === undefined
        ? [boundaryPatch(options.boundaryId, result.html, options.patchStrategy)]
        : diffBoundaryHtml(options.boundaryId, previousHtml, result.html, options.patchStrategy),
      html: result.html,
      state: result.state
    };
  };
}

export function createActionRefreshHandler(
  options: ActionRefreshOptions
): (input: ExactInvocationRequest, context: ExactServerContext) => Promise<ExactInvocationResult> {
  return async (input, context) => {
    const actionResult: ExactInvocationResult = await options.action(input, context) ?? {};
    const patches: ExactPatch[] = [...(actionResult.patches ?? [])];
    let state = actionResult.state;

    for (const boundary of options.boundaries) {
      const vnode = await boundary.render(input, context);
      const result = await renderToStringAsync(vnode, boundary);
      const previousHtml = await boundary.previousHtml?.(input, context) ?? input.boundaryHtmls?.[boundary.boundaryId];
      patches.push(...(
        previousHtml === undefined
          ? [boundaryPatch(boundary.boundaryId, result.html, boundary.patchStrategy)]
          : diffBoundaryHtml(boundary.boundaryId, previousHtml, result.html, boundary.patchStrategy)
      ));
      if (state === undefined && result.state !== undefined) state = result.state;
    }

    return {
      ...actionResult,
      patches,
      ...(state === undefined ? {} : { state })
    };
  };
}

export function createExactServerHandlerRegistry(
  options: ExactServerHandlerRegistryOptions
): ExactServerHandlerRegistry {
  const refreshBoundaries: NonNullable<ExactServerContext["refreshBoundaries"]> = {};
  const actionHandlers: NonNullable<ExactServerContext["actions"]> = {};

  for (const id of Object.keys(options.manifest.boundaries ?? {}).sort()) {
    const renderer = options.boundaries?.[id];
    if (!renderer) continue;
    refreshBoundaries[id] = createBoundaryRefreshHandler(
      boundaryRenderFunction(renderer),
      boundaryRefreshOptions(id, renderer, options)
    );
  }

  for (const id of Object.keys(options.manifest.actions ?? {}).sort()) {
    const action = options.actions?.[id];
    if (!action) continue;
    const boundaries = (options.manifest.actionBoundaries?.[id] ?? [])
      .map(boundaryId => {
        const renderer = options.boundaries?.[boundaryId];
        return renderer
          ? {
            ...boundaryRefreshOptions(boundaryId, renderer, options),
            render: boundaryRenderFunction(renderer)
          }
          : undefined;
      })
      .filter((boundary): boundary is ActionRefreshBoundaryOptions => boundary !== undefined);
    actionHandlers[id] = boundaries.length
      ? createActionRefreshHandler({ action, boundaries })
      : async (input, context) => await action(input, context) ?? {};
  }

  return {
    actions: actionHandlers,
    refreshBoundaries
  };
}

function boundaryRenderFunction(renderer: ExactBoundaryRenderer): BoundaryRenderFunction {
  return typeof renderer === "function" ? renderer : renderer.render;
}

function boundaryRefreshOptions(
  boundaryId: string,
  renderer: ExactBoundaryRenderer,
  defaults: RenderToStringOptions & { patchStrategy?: BoundaryRefreshOptions["patchStrategy"] }
): BoundaryRefreshOptions {
  if (typeof renderer === "function") {
    return {
      ...defaults,
      boundaryId,
      patchStrategy: defaults.patchStrategy
    };
  }
  return {
    ...defaults,
    ...renderer,
    boundaryId,
    patchStrategy: renderer.patchStrategy ?? defaults.patchStrategy
  };
}

export function renderKeyedListSnapshot<T>(options: KeyedListSnapshotOptions<T>): KeyedListSnapshot {
  const context: SsrContext = {
    markers: options.markers ?? true,
    nextId: 0,
    logger: options.logger
  };
  const items: KeyedListSnapshotItem[] = [];
  let html = "";
  for (const item of options.items) {
    const key = String(options.key(item));
    const child = options.render(item);
    const itemHtml = markerPair(context, keyedItemMarkerId(key), () => renderVNode(context, { ...child, key }, undefined));
    items.push({ key, html: itemHtml });
    html += itemHtml;
  }

  return {
    listId: options.listId,
    html: markerPair(context, exactMarkerId(options.listId), () => html),
    innerHtml: html,
    items
  };
}

export function createKeyedListRefreshHandler<T>(
  options: KeyedListRefreshOptions<T>
): (input: ExactInvocationRequest, context: ExactServerContext) => Promise<ExactInvocationResult> {
  return async (input, context) => {
    const nextItems = await options.items(input, context);
    const next = renderKeyedListSnapshot({
      ...options,
      items: nextItems
    });
    const previous = await options.previousItems?.(input, context)
      ?? parseKeyedListSnapshotHtml(options.listId, input.boundaryHtml)?.items;
    return {
      patches: previous
        ? diffKeyedListItems(options.listId, previous, next.items)
        : [{ type: "replace", id: options.listId, html: next.innerHtml } as ExactPatch]
    };
  };
}

export function parseKeyedListSnapshotHtml(listId: string, html: string | undefined): KeyedListSnapshot | undefined {
  if (html === undefined) return undefined;
  const items: KeyedListSnapshotItem[] = [];
  const pattern = /<!--exact:(item:[^>]*)-->([\s\S]*?)<!--\/exact:\1-->/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const marker = match[1]!;
    if (!marker.startsWith("item:")) continue;
    items.push({
      key: marker.slice("item:".length),
      html: match[0]
    });
  }
  if (!items.length) return undefined;
  return {
    listId,
    html: markerPair({ markers: true, nextId: 0 }, exactMarkerId(listId), () => html),
    innerHtml: html,
    items
  };
}

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
  const previousTree = parseHtmlNodes(previousHtml);
  const nextTree = parseHtmlNodes(nextHtml);
  if (!previousTree || !nextTree) return undefined;

  const previousById = collectExactElements(previousTree);
  const nextById = collectExactElements(nextTree);
  if (!previousById.size && !nextById.size) return undefined;
  if (!sameKeys(previousById, nextById)) return undefined;

  const patches: ExactPatch[] = [];
  for (const [id, next] of nextById) {
    const previous = previousById.get(id);
    if (!previous || previous.tagName !== next.tagName) return undefined;

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
      if (previousText === undefined || nextText === undefined) return undefined;
      if (previousText !== nextText) patches.push({ type: "text", id, value: nextText });
    }
  }

  return normalizedHtmlShape(previousTree) === normalizedHtmlShape(nextTree) ? patches : undefined;
}

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

function boundaryPatch(boundaryId: string, html: string, strategy: BoundaryRefreshOptions["patchStrategy"]): ExactPatch {
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

function renderChildren(context: SsrContext, children: readonly Child[], parent?: ComponentInstance<any>): string {
  let html = "";
  for (const child of children) {
    html += renderChild(context, child, parent);
  }
  return html;
}

function renderChild(context: SsrContext, child: Child, parent?: ComponentInstance<any>): string {
  if (child === null || child === undefined || child === false || child === true) return "";
  if (isVNode(child)) return renderVNode(context, child, parent);
  return escapeText(String(unwrap(child)));
}

function renderVNode(context: SsrContext, vnode: VNode, parent?: ComponentInstance<any>): string {
  if (isCellVNode(vnode)) {
    return withMarker(context, "cell", vnode.key, () => renderVNode(context, getCellVNode(vnode), parent));
  }

  if (vnode.type === Text) {
    return escapeText(String(unwrap(vnode.props.value) ?? ""));
  }

  if (vnode.type === Fragment) {
    const list = vnode.props.list as { collection: Iterable<unknown>; source?: { get(): Iterable<unknown> }; key(item: unknown): string; render(item: unknown): VNode } | undefined;
    const marker = list && vnode.key ? exactMarkerId(vnode.key) : markerId(context, "fragment", undefined, vnode.key);
    return markerPair(context, marker, () => {
      if (!list) return renderChildren(context, vnode.children, parent);
      const collection = list.source ? list.source.get() : list.collection;
      let html = "";
      for (const item of collection) {
        const child = list.render(item);
        html += withMarker(context, "item", String(list.key(item)), () => renderVNode(context, { ...child, key: String(list.key(item)) }, parent));
      }
      return html;
    });
  }

  if (vnode.type === Dynamic) {
    return withMarker(context, "dynamic", vnode.key, () => {
      return renderChildren(context, normalizeRenderResult(unwrap(vnode.props.value) as Child | Child[]), parent);
    });
  }

  if (vnode.type === ServerBoundary) {
    return renderServerBoundary(context, vnode);
  }

  if (vnode.type === ServerSlot) {
    return "";
  }

  if (typeof vnode.type === "function") {
    return renderComponent(context, vnode, parent);
  }

  return renderElement(context, vnode, parent);
}

async function renderChildrenAsync(
  context: SsrContext,
  children: readonly Child[],
  parent: ComponentInstance<any> | undefined,
  options: RenderToStringOptions
): Promise<string> {
  let html = "";
  for (const child of children) {
    html += await renderChildAsync(context, child, parent, options);
  }
  return html;
}

async function renderChildAsync(
  context: SsrContext,
  child: Child,
  parent: ComponentInstance<any> | undefined,
  options: RenderToStringOptions
): Promise<string> {
  if (child === null || child === undefined || child === false || child === true) return "";
  if (isVNode(child)) return renderVNodeAsync(context, child, parent, options);
  return escapeText(String(unwrap(child)));
}

async function renderVNodeAsync(
  context: SsrContext,
  vnode: VNode,
  parent: ComponentInstance<any> | undefined,
  options: RenderToStringOptions
): Promise<string> {
  if (isCellVNode(vnode)) {
    return markerPair(context, markerId(context, "cell", undefined, vnode.key), async () => renderVNodeAsync(context, getCellVNode(vnode), parent, options));
  }

  if (vnode.type === Text) {
    return escapeText(String(unwrap(vnode.props.value) ?? ""));
  }

  if (vnode.type === Fragment) {
    const list = vnode.props.list as { collection: Iterable<unknown>; source?: { get(): Iterable<unknown> }; key(item: unknown): string; render(item: unknown): VNode } | undefined;
    const marker = list && vnode.key ? exactMarkerId(vnode.key) : markerId(context, "fragment", undefined, vnode.key);
    return markerPair(context, marker, async () => {
      if (!list) return renderChildrenAsync(context, vnode.children, parent, options);
      const collection = list.source ? list.source.get() : list.collection;
      let html = "";
      for (const item of collection) {
        const key = String(list.key(item));
        const child = list.render(item);
        html += await markerPair(context, markerId(context, "item", undefined, key), async () => renderVNodeAsync(context, { ...child, key }, parent, options));
      }
      return html;
    });
  }

  if (vnode.type === Dynamic) {
    return markerPair(context, markerId(context, "dynamic", undefined, vnode.key), async () => {
      return renderChildrenAsync(context, normalizeRenderResult(unwrap(vnode.props.value) as Child | Child[]), parent, options);
    });
  }

  if (vnode.type === ServerBoundary) {
    return renderServerBoundaryAsync(context, vnode, parent, options);
  }

  if (vnode.type === ServerSlot) {
    return "";
  }

  if (typeof vnode.type === "function") {
    return renderComponentAsync(context, vnode, parent, options);
  }

  const tag = String(vnode.type);
  const attrs = renderAttrs(vnode.props);
  if (voidElements.has(tag)) return `<${tag}${attrs}>`;
  return `<${tag}${attrs}>${await renderChildrenAsync(context, vnode.children, parent, options)}</${tag}>`;
}

function renderComponent(context: SsrContext, vnode: VNode, parent?: ComponentInstance<any>): string {
  const componentId = markerId(context, "component", componentName(vnode.type), vnode.key);
  try {
    const instance = createComponentInstance(
      vnode.type as ComponentFunction<any, Record<string, unknown>>,
      getComponentProps(vnode),
      parent
    );
    const children = renderInstance(instance, () => undefined);
    return markerPair(context, componentId, () => renderChildren(context, children, instance));
  } catch (error) {
    const fallback = handleComponentError(
      parent,
      createErrorReport(error, "construct", parent, componentName(vnode.type))
    );
    return markerPair(context, componentId, () => fallback ? renderChildren(context, normalizeRenderResult(fallback()), parent) : "");
  }
}

async function renderComponentAsync(
  context: SsrContext,
  vnode: VNode,
  parent: ComponentInstance<any> | undefined,
  options: RenderToStringOptions
): Promise<string> {
  const componentId = markerId(context, "component", componentName(vnode.type), vnode.key);
  try {
    const pending = new Set<Promise<unknown>>();
    const observer: TaskObserver = {
      register: promise => {
        let observed: Promise<unknown>;
        observed = promise.finally(() => pending.delete(observed));
        pending.add(observed);
      }
    };
    const instance = withTaskObserver(observer, () => createComponentInstance(
      vnode.type as ComponentFunction<any, Record<string, unknown>>,
      getComponentProps(vnode),
      parent
    ));
    await drainTasks(pending, options.maxTaskPasses ?? 10);
    const children = renderInstance(instance, () => undefined);
    return markerPair(context, componentId, async () => renderChildrenAsync(context, children, instance, options));
  } catch (error) {
    const fallback = handleComponentError(
      parent,
      createErrorReport(error, "construct", parent, componentName(vnode.type))
    );
    return markerPair(context, componentId, async () => fallback ? renderChildrenAsync(context, normalizeRenderResult(fallback()), parent, options) : "");
  }
}

function renderElement(context: SsrContext, vnode: VNode, parent?: ComponentInstance<any>): string {
  const tag = String(vnode.type);
  const attrs = renderAttrs(vnode.props);
  if (voidElements.has(tag)) return `<${tag}${attrs}>`;
  return `<${tag}${attrs}>${renderChildren(context, vnode.children, parent)}</${tag}>`;
}

function renderServerBoundary(context: SsrContext, vnode: VNode): string {
  const id = String(unwrap(vnode.props.id) ?? "");
  const name = String(unwrap(vnode.props.name) ?? "");
  const props = clientBoundaryProps(vnode);
  const unsafePath = jsonUnsafePath(props);
  if (unsafePath) {
    throw new Error(`Client boundary ${name || id} props must be JSON-serializable; non-serializable value at ${unsafePath}`);
  }
  const children = renderServerBoundaryChildren(context, vnode, undefined);
  const html = `<div data-exact-client-boundary="${escapeAttr(id)}" data-exact-client-name="${escapeAttr(name)}" data-exact-client-props="${escapeAttr(serializeHydrationPayload({ props }))}">${children}</div>`;
  return markerPair(context, markerId(context, "client-boundary", name, id), () => html);
}

async function renderServerBoundaryAsync(
  context: SsrContext,
  vnode: VNode,
  parent: ComponentInstance<any> | undefined,
  options: RenderToStringOptions
): Promise<string> {
  const id = String(unwrap(vnode.props.id) ?? "");
  const name = String(unwrap(vnode.props.name) ?? "");
  const props = clientBoundaryProps(vnode);
  const unsafePath = jsonUnsafePath(props);
  if (unsafePath) {
    throw new Error(`Client boundary ${name || id} props must be JSON-serializable; non-serializable value at ${unsafePath}`);
  }
  const slotId = serverSlotId(id);
  const children = vnode.children.length
    ? `<span data-exact-server-slot="${escapeAttr(slotId)}" style="display: contents;">${await renderChildrenAsync(context, vnode.children, parent, options)}</span>`
    : "";
  const html = `<div data-exact-client-boundary="${escapeAttr(id)}" data-exact-client-name="${escapeAttr(name)}" data-exact-client-props="${escapeAttr(serializeHydrationPayload({ props }))}">${children}</div>`;
  return markerPair(context, markerId(context, "client-boundary", name, id), () => html);
}

function clientBoundaryProps(vnode: VNode): Record<string, unknown> {
  const id = String(unwrap(vnode.props.id) ?? "");
  const rawProps = unwrap(vnode.props.props) ?? {};
  const props = rawProps && typeof rawProps === "object" && !Array.isArray(rawProps)
    ? { ...(rawProps as Record<string, unknown>) }
    : rawProps;
  if (vnode.children.length && props && typeof props === "object" && !Array.isArray(props) && !("children" in props)) {
    (props as Record<string, unknown>).children = serverSlotPayload(serverSlotId(id));
  }
  return props as Record<string, unknown>;
}

function renderServerBoundaryChildren(context: SsrContext, vnode: VNode, parent: ComponentInstance<any> | undefined): string {
  if (!vnode.children.length) return "";
  const slotId = serverSlotId(String(unwrap(vnode.props.id) ?? ""));
  return `<span data-exact-server-slot="${escapeAttr(slotId)}" style="display: contents;">${renderChildren(context, vnode.children, parent)}</span>`;
}

function serverSlotId(boundaryId: string): string {
  return `${boundaryId}:children`;
}

function serverSlotPayload(id: string): Record<string, string> {
  return { __exactServerSlot: id };
}

function renderAttrs(props: Record<string, unknown>): string {
  let attrs = "";
  for (const [name, rawValue] of Object.entries(props)) {
    if (name === "children" || name === "key" || name === "ref" || /^on[A-Z]/.test(name)) continue;
    const value = unwrap(rawValue);
    if (value === false || value === null || value === undefined) continue;
    const attrName = name === "className" ? "class" : name;
    if (attrName === "style") {
      const style = renderStyle(value);
      if (style) attrs += ` style="${escapeAttr(style)}"`;
      continue;
    }
    if (value === true) {
      attrs += ` ${escapeAttrName(attrName)}`;
      continue;
    }
    attrs += ` ${escapeAttrName(attrName)}="${escapeAttr(String(value))}"`;
  }
  return attrs;
}

function renderStyle(value: unknown): string {
  const actual = unwrap(value);
  if (!actual || actual === false) return "";
  if (typeof actual === "string") return actual;
  if (typeof actual !== "object") return "";
  const chunks: string[] = [];
  for (const [name, raw] of Object.entries(actual)) {
    const styleValue = unwrap(raw);
    if (styleValue === null || styleValue === undefined || styleValue === false) continue;
    chunks.push(`${toCssProperty(name)}: ${String(styleValue)};`);
  }
  return chunks.join(" ");
}

function withMarker(context: SsrContext, kind: string, key: string | undefined, render: () => string): string {
  return markerPair(context, markerId(context, kind, undefined, key), render);
}

function markerPair(context: SsrContext, id: string, render: () => string): string;
function markerPair(context: SsrContext, id: string, render: () => Promise<string>): Promise<string>;
function markerPair(context: SsrContext, id: string, render: () => string | Promise<string>): string | Promise<string> {
  if (!context.markers) return render();
  const rendered = render();
  if (rendered instanceof Promise) {
    return rendered.then(html => `<!--exact:${id}-->${html}<!--/exact:${id}-->`);
  }
  return `<!--exact:${id}-->${rendered}<!--/exact:${id}-->`;
}

function markerId(context: SsrContext, kind: string, name?: string, key?: string): string {
  const id = `${kind}:${context.nextId++}${name ? `:${name}` : ""}${key ? `:${key}` : ""}`;
  return id.replace(/--/g, "");
}

function exactMarkerId(id: string): string {
  return id.startsWith("exact:") ? id.slice("exact:".length) : id;
}

function keyedItemMarkerId(key: string): string {
  return `item:${key}`.replace(/--/g, "");
}

function getComponentProps(vnode: VNode): Record<string, unknown> {
  const props = { ...vnode.props };
  if (vnode.children.length === 1) props.children = vnode.children[0];
  else if (vnode.children.length > 1) props.children = vnode.children;
  return props;
}

function componentName(type: VNode["type"]): string {
  return typeof type === "function" ? type.name || "anonymous" : String(type);
}

function serializeHydrationPayload(payload: Record<string, unknown>): string {
  return JSON.stringify(payload)
    .replace(/</g, "\\u003C")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function omitUndefinedProperties(value: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) output[key] = item;
  }
  return output;
}

function isStrictJsonSafe(value: unknown, seen = new Set<object>()): boolean {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.every(item => isStrictJsonSafe(item, seen));
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.values(value as Record<string, unknown>).every(item => isStrictJsonSafe(item, seen));
}

function isJsonSafe(value: unknown, seen = new Set<object>()): boolean {
  return jsonUnsafePath(value, "$", seen) === undefined;
}

function jsonUnsafePath(value: unknown, path = "$", seen = new Set<object>()): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" || typeof value === "boolean") return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? undefined : path;
  if (typeof value !== "object") return path;
  if (seen.has(value)) return path;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      const unsafe = jsonUnsafePath(value[index], `${path}[${index}]`, seen);
      if (unsafe) return unsafe;
    }
    return undefined;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) return path;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const unsafe = jsonUnsafePath(item, `${path}.${key}`, seen);
    if (unsafe) return unsafe;
  }
  return undefined;
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

function escapeAttrName(value: string): string {
  return /^[A-Za-z_:][A-Za-z0-9_:.-]*$/.test(value) ? value : "data-exact-invalid-attr";
}

function toCssProperty(name: string): string {
  return name.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
}

async function drainTasks(pending: Set<Promise<unknown>>, maxPasses: number): Promise<void> {
  for (let pass = 0; pending.size && pass < maxPasses; pass++) {
    await Promise.all([...pending]);
  }
  if (pending.size) {
    throw new Error(`SSR task drain exceeded ${maxPasses} passes`);
  }
}
