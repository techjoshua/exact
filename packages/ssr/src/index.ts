import {
  Cell,
  Dynamic,
  Fragment,
  ServerBoundary,
  ServerSlot,
  Text,
  attachSuppressedCleanupFailure,
  attemptCleanup,
  createCleanupFailure,
  createComponentInstance,
  createErrorReport,
  createTextVNode,
  getCellVNode,
  handleComponentError,
  isCellVNode,
  isVNode,
  logFrameworkEvent,
  normalizeRenderResult,
  renderInstance,
  throwCleanupFailure,
  withTaskObserver,
  type VNode
} from "@exact/core";
import { flushSync, unwrap } from "@exact/reactive";
import type { ExactPatch } from "@exact/server";
import { boundaryPatch, diffBoundaryHtml, diffKeyedListItems } from "./diff.js";
import { escapeAttr, escapeText, voidElements } from "./html.js";
import { jsonUnsafePath, renderHydrationScript, serializeHydrationPayload } from "./hydration.js";
import { decodeMarkerKey, exactMarkerId, keyedItemMarkerId, markerId, markerPair, renderAttrs, withMarker } from "./markup.js";
import { createDocumentEventStream, createHtmlStream, createProgressiveHtmlStream, progressiveHtmlResponse } from "./streams.js";
import type {
  ActionRefreshOptions,
  ActionRefreshBoundaryOptions,
  BoundaryRenderFunction,
  BoundaryRefreshOptions,
  Child,
  ComponentFunction,
  ComponentInstance,
  ExactBoundaryRenderer,
  ExactDocumentStreamEvent,
  ExactInvocationRequest,
  ExactInvocationResult,
  ExactResponseLike,
  ExactServerContext,
  ExactServerHandlerRegistry,
  ExactServerHandlerRegistryOptions,
  ExactServerRuntimeOptions,
  HydratableStringResult,
  HydrationScriptOptions,
  KeyedListRefreshOptions,
  KeyedListSnapshot,
  KeyedListSnapshotItem,
  KeyedListSnapshotOptions,
  KeyedListSnapshotParseOptions,
  Logger,
  RenderToDocumentStreamOptions,
  RenderToProgressiveHtmlResponseOptions,
  RenderToProgressiveHtmlStreamOptions,
  RenderToStringOptions,
  RenderToStringResult,
  SsrContext,
  TaskObserver
} from "./types.js";

export type * from "./types.js";
export { diffBoundaryHtml, diffKeyedListItems } from "./diff.js";
export { renderHydrationScript } from "./hydration.js";

const DEFAULT_MAX_TREE_DEPTH = 512;
const HARD_MAX_TREE_DEPTH = 1_024;
const DEFAULT_MAX_TREE_NODES = 100_000;
const DEFAULT_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_TASK_DURATION_MS = 30_000;

type SsrRenderOptions = RenderToStringOptions & { taskDeadline?: number };

class SsrTreeDepthError extends Error {
  constructor(limit: number) {
    super(`eXact SSR tree exceeds the configured maximum depth of ${limit}`);
    this.name = "SsrTreeDepthError";
  }
}

class SsrTaskDeadlineError extends Error {
  constructor() {
    super("SSR task duration limit exceeded");
    this.name = "SsrTaskDeadlineError";
  }
}

class SsrTreeNodeError extends Error {
  constructor(limit: number) {
    super(`eXact SSR tree exceeds the configured maximum of ${limit} render values`);
    this.name = "SsrTreeNodeError";
  }
}

class SsrOutputLimitError extends Error {
  constructor(limit: number) {
    super(`eXact SSR output exceeds the configured maximum of ${limit} bytes`);
    this.name = "SsrOutputLimitError";
  }
}

/** Renders a vnode tree to an HTML string without waiting for async component tasks. */
export function renderToString(vnode: VNode, options: RenderToStringOptions = {}): RenderToStringResult {
  const owner = createSsrOwner();
  let primary: unknown = noPrimaryFailure;
  try {
    return withTaskObserver(owner.observer, () => renderToStringOwned(vnode, options));
  } catch (error) {
    primary = error;
    throw error;
  } finally {
    disposePreservingPrimary(() => owner.dispose("ssr render complete"), primary);
  }
}

function renderToStringOwned(vnode: VNode, options: RenderToStringOptions): RenderToStringResult {
  const context = createSsrContext(options);
  const body = renderVNode(context, vnode, undefined);
  const html = boundedJoin(context, [...context.reactResourceHints, body]);
  assertOutputWithinLimit(context, html);
  return {
    html,
    state: options.state
  };
}

/** Renders a vnode tree plus the serialized hydration script needed by the client runtime. */
export function renderToHydratableString(vnode: VNode, options: RenderToStringOptions & HydrationScriptOptions = {}): HydratableStringResult {
  const result = renderToString(vnode, options);
  const hydrationScript = renderHydrationScript({
    endpoint: options.endpoint,
    endpoints: options.endpoints,
    state: result.state,
    stateContracts: options.stateContracts,
    actionBoundaries: options.actionBoundaries,
    scriptId: options.scriptId,
    nonce: options.nonce,
    maxHydrationDepth: options.maxHydrationDepth,
    maxHydrationNodes: options.maxHydrationNodes,
    maxHydrationBytes: options.maxHydrationBytes
  });
  return {
    ...result,
    hydrationScript,
    htmlWithHydration: `${result.html}${hydrationScript}`
  };
}

/** Renders a vnode tree lazily as demand-driven HTML chunks. */
export function renderToStream(vnode: VNode, options: RenderToStringOptions = {}): ReadableStream<Uint8Array> {
  const context = createSsrContext(options);
  const owner = createSsrOwner();
  const rendered = renderVNodeChunks(context, vnode, undefined, 1);
  const observed: Iterable<string> = {
    [Symbol.iterator]() {
      return {
        next: () => withTaskObserver(owner.observer, () => rendered.next()),
        return: () => rendered.return(undefined)
      };
    }
  };
  return createHtmlStream(observed, {
    signal: options.signal,
    maxBytes: options.maxStreamBytes,
    maxChunks: options.maxStreamChunks,
    close: () => owner.dispose(options.signal?.reason ?? "ssr stream complete")
  });
}

/** Streams document render lifecycle events for shell/final/hydration output. */
export function renderToDocumentStream(vnode: VNode, options: RenderToDocumentStreamOptions = {}): ReadableStream<Uint8Array> {
  return createDocumentEventStream(
    (signal, emit) => streamDocumentRender(vnode, { ...options, signal }, emit),
    {
      signal: options.signal,
      maxEvents: options.maxStreamEvents,
      maxBytes: options.maxStreamBytes,
      onError: error => logFrameworkEvent("error", "ssr", "stream", "document render failed", error, options.logger)
    }
  );
}

/** Streams document render events and emits hydration config when available. */
export function renderToHydratableDocumentStream(vnode: VNode, options: RenderToDocumentStreamOptions = {}): ReadableStream<Uint8Array> {
  return renderToDocumentStream(vnode, {
    ...options,
    hydration: options.hydration ?? true
  });
}

/** Streams progressive HTML assembled from document render lifecycle events. */
export function renderToProgressiveHtmlStream(vnode: VNode, options: RenderToProgressiveHtmlStreamOptions = {}): ReadableStream<Uint8Array> {
  return createProgressiveHtmlStream((streamOptions, emit) => streamDocumentRender(vnode, streamOptions, emit), options);
}

/** Streams progressive HTML with hydration config enabled by default. */
export function renderToHydratableProgressiveHtmlStream(vnode: VNode, options: RenderToProgressiveHtmlStreamOptions = {}): ReadableStream<Uint8Array> {
  return renderToProgressiveHtmlStream(vnode, {
    ...options,
    hydration: options.hydration ?? true
  });
}

/** Creates a runtime-neutral progressive HTML response. */
export function renderToProgressiveHtmlResponse(vnode: VNode, options: RenderToProgressiveHtmlResponseOptions = {}): ExactResponseLike {
  return progressiveHtmlResponse(renderToProgressiveHtmlStream(vnode, options), options);
}

/** Creates a runtime-neutral progressive HTML response with hydration config enabled by default. */
export function renderToHydratableProgressiveHtmlResponse(vnode: VNode, options: RenderToProgressiveHtmlResponseOptions = {}): ExactResponseLike {
  return progressiveHtmlResponse(renderToHydratableProgressiveHtmlStream(vnode, options), options);
}

/** Renders a vnode tree after waiting for observed async component tasks to settle. */
export async function renderToStringAsync(vnode: VNode, options: RenderToStringOptions = {}): Promise<RenderToStringResult> {
  const renderOptions = withTaskDeadline(options);
  const context = createSsrContext(renderOptions);

  const body = await renderVNodeAsync(context, vnode, undefined, renderOptions);
  const html = boundedJoin(context, [...context.reactResourceHints, body]);
  assertOutputWithinLimit(context, html);
  return {
    html,
    state: options.state
  };
}

/** Renders async SSR output plus the serialized hydration script needed by the client runtime. */
export async function renderToHydratableStringAsync(vnode: VNode, options: RenderToStringOptions & HydrationScriptOptions = {}): Promise<HydratableStringResult> {
  const result = await renderToStringAsync(vnode, options);
  const hydrationScript = renderHydrationScript({
    endpoint: options.endpoint,
    endpoints: options.endpoints,
    state: result.state,
    stateContracts: options.stateContracts,
    actionBoundaries: options.actionBoundaries,
    scriptId: options.scriptId,
    nonce: options.nonce,
    maxHydrationDepth: options.maxHydrationDepth,
    maxHydrationNodes: options.maxHydrationNodes,
    maxHydrationBytes: options.maxHydrationBytes
  });
  return {
    ...result,
    hydrationScript,
    htmlWithHydration: `${result.html}${hydrationScript}`
  };
}

async function streamDocumentRender(
  vnode: VNode,
  options: RenderToDocumentStreamOptions & { taskDeadline?: number },
  emit: (event: ExactDocumentStreamEvent) => Promise<void>
): Promise<void> {
  options = withTaskDeadline(options);
  const owner = createSsrOwner();
  let primary: unknown = noPrimaryFailure;
  try {
    await emit({ event: "start", version: 1 });
    const shell = withTaskObserver(owner.observer, () => renderToStringOwned(vnode, options));
    await emit({ event: "shell", version: 1, html: shell.html });

    let final = shell;
    if (owner.pending.size) {
      // Initial streaming sends an early shell, drains observed tasks, then emits a
      // root replacement only if the settled tree differs from the shell.
      await drainTasks(owner.pending, options.maxTaskPasses ?? 10, options.signal, options.taskDeadline);
      final = await renderToStringAsync(vnode, options);
      if (final.html !== shell.html) {
        await emit({ event: "replace", version: 1, id: options.rootId ?? "document", html: final.html });
      }
    }

    if (shouldEmitDocumentHydration(options)) {
      await emit({
        event: "hydration",
        version: 1,
        html: renderHydrationScript({
          endpoint: options.endpoint,
          endpoints: options.endpoints,
          state: final.state,
          stateContracts: options.stateContracts,
          actionBoundaries: options.actionBoundaries,
          scriptId: options.scriptId,
          nonce: options.nonce,
          maxHydrationDepth: options.maxHydrationDepth,
          maxHydrationNodes: options.maxHydrationNodes,
          maxHydrationBytes: options.maxHydrationBytes
        })
      });
    }

    await emit({ event: "complete", version: 1 });
  } catch (error) {
    primary = error;
    throw error;
  } finally {
    disposePreservingPrimary(() => owner.dispose(options.signal?.reason ?? "ssr stream complete"), primary);
  }
}

/** Creates a server handler that refreshes one boundary and returns patches plus fallback HTML. */
export function createBoundaryRefreshHandler(
  render: BoundaryRenderFunction,
  options: BoundaryRefreshOptions
): (input: ExactInvocationRequest, context: ExactServerContext) => Promise<ExactInvocationResult> {
  return async (input, context) => {
    const vnode = await render(input, context);
    const result = await renderToStringAsync(vnode, { ...options, signal: options.signal ?? context.signal });
    const previousHtml = await options.previousHtml?.(input, context) ?? input.boundaryHtml;
    return {
      patches: previousHtml === undefined
        ? [boundaryPatch(options.boundaryId, result.html, options.patchStrategy)]
        : diffBoundaryHtml(options.boundaryId, previousHtml, result.html, options.patchStrategy),
      html: result.html,
      ...(result.state === undefined ? {} : { state: result.state })
    };
  };
}

/** Creates a server action handler that runs app work and refreshes affected boundaries. */
export function createActionRefreshHandler(
  options: ActionRefreshOptions
): (input: ExactInvocationRequest, context: ExactServerContext) => Promise<ExactInvocationResult> {
  return async (input, context) => {
    const actionResult: ExactInvocationResult = await options.action(input, context) ?? {};
    const patches: ExactPatch[] = [...(actionResult.patches ?? [])];
    let state = actionResult.state;

    for (const boundary of options.boundaries) {
      const vnode = await boundary.render(input, context);
      const result = await renderToStringAsync(vnode, { ...boundary, signal: boundary.signal ?? context.signal });
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

/** Creates action and boundary handler maps from a manifest and app-provided renderers. */
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

/** Creates an eXact server context suitable for the generic endpoint handler. */
export function createExactServerRuntime(options: ExactServerRuntimeOptions): ExactServerContext {
  const registry = createExactServerHandlerRegistry(options);
  return {
    manifest: options.manifest,
    ...registry,
    authorize: options.authorize,
    validateCsrf: options.validateCsrf,
    logger: options.logger
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

/** Renders a keyed list snapshot that can later be diffed into list patches. */
export function renderKeyedListSnapshot<T>(options: KeyedListSnapshotOptions<T>): KeyedListSnapshot {
  const owner = createSsrOwner();
  let primary: unknown = noPrimaryFailure;
  try {
    return withTaskObserver(owner.observer, () => renderKeyedListSnapshotOwned(options));
  } catch (error) {
    primary = error;
    throw error;
  } finally {
    disposePreservingPrimary(() => owner.dispose("keyed snapshot render complete"), primary);
  }
}

function renderKeyedListSnapshotOwned<T>(options: KeyedListSnapshotOptions<T>): KeyedListSnapshot {
  const context = createSsrContext(options);
  const items: KeyedListSnapshotItem[] = [];
  const html: string[] = [];
  const keys = new Set<string>();
  for (const item of options.items) {
    const key = String(options.key(item));
    if (keys.has(key)) throw new Error(`Duplicate key ${JSON.stringify(key)} in keyed-list snapshot`);
    keys.add(key);
    const child = options.render(item);
    const itemHtml = markerPair(context, keyedItemMarkerId(key), () => renderVNode(context, { ...child, key }, undefined));
    items.push({ key, html: itemHtml });
    html.push(itemHtml);
  }

  const innerHtml = boundedJoin(context, html);
  const snapshotHtml = markerPair(context, exactMarkerId(options.listId), () => innerHtml);
  assertOutputWithinLimit(context, snapshotHtml);

  return {
    listId: options.listId,
    html: snapshotHtml,
    innerHtml,
    items
  };
}

/** Creates a boundary refresh handler specialized for keyed list patch generation. */
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
      ?? parseKeyedListSnapshotHtml(options.listId, input.boundaryHtml, {
        maxBytes: options.maxOutputBytes,
        maxItems: options.maxTreeNodes
      })?.items;
    return {
      patches: previous
        ? diffKeyedListItems(options.listId, previous, next.items)
        : [{ type: "replace", id: options.listId, html: next.innerHtml } as ExactPatch]
    };
  };
}

/** Parses framework-shaped keyed list HTML back into a snapshot for diffing. */
export function parseKeyedListSnapshotHtml(
  listId: string,
  html: string | undefined,
  options: KeyedListSnapshotParseOptions = {}
): KeyedListSnapshot | undefined {
  if (html === undefined) return undefined;
  const maxBytes = normalizePositiveLimit(options.maxBytes, DEFAULT_MAX_OUTPUT_BYTES);
  const maxItems = normalizePositiveLimit(options.maxItems, DEFAULT_MAX_TREE_NODES);
  const maxMarkers = normalizePositiveLimit(options.maxMarkers, DEFAULT_MAX_TREE_NODES * 2);
  if (html.length > maxBytes || new TextEncoder().encode(html).byteLength > maxBytes) return undefined;
  const items: KeyedListSnapshotItem[] = [];
  const keys = new Set<string>();
  const stack: Array<{ id: string; start: number; item: boolean; key?: string }> = [];
  let cursor = 0;
  let markers = 0;
  let activeItemMarkers = 0;
  while (cursor < html.length) {
    const start = html.indexOf("<!--", cursor);
    if (start < 0) break;
    const end = html.indexOf("-->", start + 4);
    if (end < 0) return undefined;
    cursor = end + 3;
    const comment = html.slice(start + 4, end);
    if (!comment.startsWith("exact:") && !comment.startsWith("/exact:")) continue;
    if (++markers > maxMarkers) return undefined;
    if (comment.startsWith("exact:")) {
      const id = comment.slice("exact:".length);
      if (!id) return undefined;
      const item = id.startsWith("item:");
      const topLevelItem = item && activeItemMarkers === 0;
      const key = topLevelItem ? decodeMarkerKey(id.slice("item:".length)) : undefined;
      if (item) activeItemMarkers++;
      stack.push({ id, start, item, ...(key === undefined ? {} : { key }) });
      continue;
    }
    const id = comment.slice("/exact:".length);
    const frame = stack.pop();
    if (!frame || frame.id !== id) return undefined;
    if (frame.item) activeItemMarkers--;
    if (frame.key === undefined) continue;
    if (keys.has(frame.key) || items.length >= maxItems) return undefined;
    keys.add(frame.key);
    items.push({ key: frame.key, html: html.slice(frame.start, end + 3) });
  }
  if (stack.length || !items.length) return undefined;
  const snapshotHtml = markerPair(createSsrContext({ markers: true }), exactMarkerId(listId), () => html);
  if (snapshotHtml.length > maxBytes || new TextEncoder().encode(snapshotHtml).byteLength > maxBytes) return undefined;
  return {
    listId,
    html: snapshotHtml,
    innerHtml: html,
    items
  };
}

function* renderVNodeChunks(
  context: SsrContext,
  vnode: VNode,
  parent: ComponentInstance<any> | undefined,
  depth: number
): Generator<string> {
  if (depth > context.maxTreeDepth) throw new SsrTreeDepthError(context.maxTreeDepth);
  countSsrNode(context);
  const marked = function* (id: string, content: () => Generator<string>): Generator<string> {
    if (context.markers) yield `<!--exact:${id}-->`;
    yield* content();
    if (context.markers) yield `<!--/exact:${id}-->`;
  };

  if (isCellVNode(vnode)) {
    const id = markerId(context, "cell", undefined, vnode.key);
    yield* marked(id, () => renderVNodeChunks(context, getCellVNode(vnode), parent, depth + 1));
    return;
  }
  if (vnode.type === Text) {
    yield escapeText(String(unwrap(vnode.props.value) ?? ""));
    return;
  }
  if (vnode.type === Fragment) {
    const list = vnode.props.list as { collection: Iterable<unknown>; source?: { get(): Iterable<unknown> }; key(item: unknown): string; render(item: unknown): VNode } | undefined;
    const id = list && vnode.key ? exactMarkerId(vnode.key) : markerId(context, "fragment", undefined, vnode.key);
    yield* marked(id, function* () {
      if (!list) {
        for (const child of vnode.children) yield* renderChildChunks(context, child, parent, depth + 1);
        return;
      }
      const collection = list.source ? list.source.get() : list.collection;
      for (const item of collection) {
        const key = String(list.key(item));
        const child = list.render(item);
        yield* marked(markerId(context, "item", undefined, key), () => renderVNodeChunks(context, { ...child, key }, parent, depth + 1));
      }
    });
    return;
  }
  if (vnode.type === Dynamic) {
    const id = markerId(context, "dynamic", undefined, vnode.key);
    yield* marked(id, function* () {
      for (const child of normalizeRenderResult(unwrap(vnode.props.value) as Child | Child[])) {
        yield* renderChildChunks(context, child, parent, depth + 1);
      }
    });
    return;
  }
  if (vnode.type === ServerBoundary) {
    const id = String(unwrap(vnode.props.id) ?? "");
    const name = String(unwrap(vnode.props.name) ?? "");
    const props = clientBoundaryProps(vnode);
    const unsafePath = jsonUnsafePath(props);
    if (unsafePath) throw new Error(clientBoundarySerializationMessage(name, id, unsafePath));
    const marker = markerId(context, "client-boundary", name, id);
    yield* marked(marker, function* () {
      yield `<div data-exact-client-boundary="${escapeAttr(id)}" data-exact-client-name="${escapeAttr(name)}" data-exact-client-props="${escapeAttr(serializeHydrationPayload({ props }))}">`;
      if (vnode.children.length) {
        yield `<span data-exact-server-slot="${escapeAttr(serverSlotId(id))}" style="display: contents;">`;
        for (const child of vnode.children) yield* renderChildChunks(context, child, parent, depth + 1);
        yield "</span>";
      }
      yield "</div>";
    });
    return;
  }
  if (vnode.type === ServerSlot) return;
  if (typeof vnode.type === "function") {
    const componentId = markerId(context, "component", componentName(vnode.type), vnode.key);
    let childParent = parent;
    let children: Child[];
    try {
      const instance = createComponentInstance(
        vnode.type as ComponentFunction<any, Record<string, unknown>>,
        getComponentProps(vnode),
        parent
      );
      childParent = instance;
      children = renderInstance(instance, () => undefined);
    } catch (error) {
      if (isSsrRenderLimitError(error)) throw error;
      const fallback = handleComponentError(parent, createErrorReport(error, "construct", parent, componentName(vnode.type)));
      children = fallback ? normalizeRenderResult(fallback()) : [];
    }
    // Construction is recoverable before bytes are emitted. Once a component
    // starts streaming, descendant failures fail the stream rather than
    // appending fallback HTML after an already-emitted partial boundary.
    yield* marked(componentId, function* () {
      for (const child of children) yield* renderChildChunks(context, child, childParent, depth + 1);
    });
    return;
  }

  const tag = String(vnode.type);
  const hostProps = reactHostProps(context, vnode);
  registerReactImagePreload(context, tag, hostProps);
  yield `<${tag}${renderAttrs(hostProps, context.reactMarkup, tag)}${context.reactMarkup && voidElements.has(tag) ? "/" : ""}>`;
  if (voidElements.has(tag)) return;
  const raw = reactHostContent(context, vnode);
  if (raw !== undefined) yield raw;
  else {
    const previousSelect = context.reactSelectValue;
    if (context.reactMarkup && tag === "select") context.reactSelectValue = unwrap(vnode.props.value ?? vnode.props.defaultValue);
    try { for (const child of vnode.children) yield* renderChildChunks(context, child, parent, depth + 1); }
    finally { context.reactSelectValue = previousSelect; }
  }
  yield `</${tag}>`;
}

function* renderChildChunks(
  context: SsrContext,
  child: Child,
  parent: ComponentInstance<any> | undefined,
  depth: number
): Generator<string> {
  if (isVNode(child)) yield* renderVNodeChunks(context, child, parent, depth);
  else {
    countSsrNode(context);
    if (child === null || child === undefined || child === false || child === true) return;
    yield escapeText(String(unwrap(child)));
  }
}

function renderChildren(context: SsrContext, children: readonly Child[], parent?: ComponentInstance<any>): string {
  const html: string[] = [];
  let previousWasText = false;
  for (const child of children) {
    const rendered = renderChild(context, child, parent);
    const isText = !isVNode(child) && rendered !== "";
    if (context.textSeparators && isText && previousWasText) html.push("<!-- -->");
    if (rendered !== "") html.push(rendered);
    if (isVNode(child)) previousWasText = false;
    else if (isText) previousWasText = true;
  }
  return boundedJoin(context, html);
}

function renderChild(context: SsrContext, child: Child, parent?: ComponentInstance<any>): string {
  if (isVNode(child)) return renderVNode(context, child, parent);
  countSsrNode(context);
  if (child === null || child === undefined || child === false || child === true) return "";
  return escapeText(String(unwrap(child)));
}

function renderVNode(context: SsrContext, vnode: VNode, parent?: ComponentInstance<any>): string {
  return withSsrTreeDepth(context, () => {
    countSsrNode(context);
    const html = renderVNodeInner(context, vnode, parent);
    assertOutputCharacterBound(context, html);
    return html;
  });
}

function renderVNodeInner(context: SsrContext, vnode: VNode, parent?: ComponentInstance<any>): string {
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
      const html: string[] = [];
      for (const item of collection) {
        const child = list.render(item);
        html.push(withMarker(context, "item", String(list.key(item)), () => renderVNode(context, { ...child, key: String(list.key(item)) }, parent)));
      }
      return boundedJoin(context, html);
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
  const html: string[] = [];
  let previousWasText = false;
  for (const child of children) {
    const rendered = await renderChildAsync(context, child, parent, options);
    const isText = !isVNode(child) && rendered !== "";
    if (context.textSeparators && isText && previousWasText) html.push("<!-- -->");
    if (rendered !== "") html.push(rendered);
    if (isVNode(child)) previousWasText = false;
    else if (isText) previousWasText = true;
  }
  return boundedJoin(context, html);
}

async function renderChildAsync(
  context: SsrContext,
  child: Child,
  parent: ComponentInstance<any> | undefined,
  options: RenderToStringOptions
): Promise<string> {
  if (isVNode(child)) return renderVNodeAsync(context, child, parent, options);
  countSsrNode(context);
  if (child === null || child === undefined || child === false || child === true) return "";
  return escapeText(String(unwrap(child)));
}

async function renderVNodeAsync(
  context: SsrContext,
  vnode: VNode,
  parent: ComponentInstance<any> | undefined,
  options: SsrRenderOptions
): Promise<string> {
  return withSsrTreeDepthAsync(context, async () => {
    countSsrNode(context);
    const html = await renderVNodeAsyncInner(context, vnode, parent, options);
    assertOutputCharacterBound(context, html);
    return html;
  });
}

async function renderVNodeAsyncInner(
  context: SsrContext,
  vnode: VNode,
  parent: ComponentInstance<any> | undefined,
  options: SsrRenderOptions
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
      const html: string[] = [];
      for (const item of collection) {
        const key = String(list.key(item));
        const child = list.render(item);
        html.push(await markerPair(context, markerId(context, "item", undefined, key), async () => renderVNodeAsync(context, { ...child, key }, parent, options)));
      }
      return boundedJoin(context, html);
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
  const hostProps = reactHostProps(context, vnode);
  registerReactImagePreload(context, tag, hostProps);
  const attrs = renderAttrs(hostProps, context.reactMarkup, tag);
  if (voidElements.has(tag)) return `<${tag}${attrs}${context.reactMarkup ? "/" : ""}>`;
  const raw = reactHostContent(context, vnode);
  let content: string;
  if (raw !== undefined) content = raw;
  else {
    const previousSelect = context.reactSelectValue;
    if (context.reactMarkup && tag === "select") context.reactSelectValue = unwrap(vnode.props.value ?? vnode.props.defaultValue);
    try { content = await renderChildrenAsync(context, vnode.children, parent, options); }
    finally { context.reactSelectValue = previousSelect; }
  }
  return `<${tag}${attrs}>${content}</${tag}>`;
}

function renderComponent(context: SsrContext, vnode: VNode, parent?: ComponentInstance<any>): string {
  const componentId = markerId(context, "component", componentName(vnode.type), vnode.key);
  try {
    const instance = createComponentInstance(
      vnode.type as ComponentFunction<any, Record<string, unknown>>,
      getComponentProps(vnode),
      parent
    );
    return markerPair(context, componentId, () => {
      let invalidated = false;
      for (let pass = 0; pass < 25; pass++) {
        invalidated = false;
        const children = renderInstance(instance, () => { invalidated = true; });
        const html = renderChildren(context, children, instance);
        flushSync();
        if (!invalidated) return html;
      }
      throw new Error("eXact SSR component did not stabilize after 25 render passes");
    });
  } catch (error) {
    if (isSsrRenderLimitError(error)) throw error;
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
  options: SsrRenderOptions
): Promise<string> {
  const componentId = markerId(context, "component", componentName(vnode.type), vnode.key);
  let instance: ComponentInstance<any> | undefined;
  let primary: unknown = noPrimaryFailure;
  try {
    try {
      const pending = new Set<Promise<unknown>>();
      const observer: TaskObserver = {
        register: promise => {
          let observed: Promise<unknown>;
          observed = promise.finally(() => pending.delete(observed));
          pending.add(observed);
        },
        retain() {}
      };
      instance = withTaskObserver(observer, () => createComponentInstance(
        vnode.type as ComponentFunction<any, Record<string, unknown>>,
        getComponentProps(vnode),
        parent
      ));
      await drainTasks(pending, options.maxTaskPasses ?? 10, options.signal, options.taskDeadline);
      return await markerPair(context, componentId, async () => {
        let invalidated = false;
        const maxPasses = options.maxTaskPasses ?? 10;
        for (let pass = 0; pass < maxPasses; pass++) {
          invalidated = false;
          const children = renderInstance(instance!, () => { invalidated = true; });
          const html = await renderChildrenAsync(context, children, instance, options);
          await drainTasks(pending, maxPasses, options.signal, options.taskDeadline);
          flushSync();
          if (!invalidated) return html;
        }
        throw new Error(`eXact async SSR component did not stabilize after ${maxPasses} render passes`);
      });
    } catch (error) {
      if (isSsrRenderInterruption(error, options.signal)) throw error;
      const fallback = handleComponentError(
        parent,
        createErrorReport(error, "construct", parent, componentName(vnode.type))
      );
      return await markerPair(context, componentId, async () => fallback ? renderChildrenAsync(context, normalizeRenderResult(fallback()), parent, options) : "");
    }
  } catch (error) {
    primary = error;
    throw error;
  } finally {
    if (instance) disposePreservingPrimary(() => instance!.unmount(String(options.signal?.reason ?? "ssr render complete")), primary);
  }
}

function createSsrOwner(): {
  observer: TaskObserver;
  pending: Set<Promise<unknown>>;
  dispose(reason?: unknown): void;
} {
  const pending = new Set<Promise<unknown>>();
  const instances = new Set<ComponentInstance<any>>();
  return {
    pending,
    observer: {
      register(promise) {
        let observed: Promise<unknown>;
        observed = promise.finally(() => pending.delete(observed));
        pending.add(observed);
      },
      retain(instance) {
        instances.add(instance);
      }
    },
    dispose(reason = "ssr render complete") {
      // Children are constructed after parents; dispose in reverse order so a
      // parent context stays valid throughout child teardown.
      const failure = createCleanupFailure();
      for (const instance of [...instances].reverse()) attemptCleanup(failure, () => instance.unmount(String(reason)));
      instances.clear();
      throwCleanupFailure(failure);
    }
  };
}

const noPrimaryFailure = Symbol("no primary SSR failure");

function disposePreservingPrimary(dispose: () => void, primary: unknown): void {
  try { dispose(); }
  catch (cleanup) {
    if (primary === noPrimaryFailure) throw cleanup;
    attachSuppressedCleanupFailure(primary, cleanup);
  }
}

function renderElement(context: SsrContext, vnode: VNode, parent?: ComponentInstance<any>): string {
  const tag = String(vnode.type);
  const hostProps = reactHostProps(context, vnode);
  registerReactImagePreload(context, tag, hostProps);
  const attrs = renderAttrs(hostProps, context.reactMarkup, tag);
  if (voidElements.has(tag)) return `<${tag}${attrs}${context.reactMarkup ? "/" : ""}>`;
  const raw = reactHostContent(context, vnode);
  let content: string;
  if (raw !== undefined) content = raw;
  else {
    const previousSelect = context.reactSelectValue;
    if (context.reactMarkup && tag === "select") context.reactSelectValue = unwrap(vnode.props.value ?? vnode.props.defaultValue);
    try { content = renderChildren(context, vnode.children, parent); }
    finally { context.reactSelectValue = previousSelect; }
  }
  return `<${tag}${attrs}>${content}</${tag}>`;
}

function reactHostContent(context: SsrContext, vnode: VNode): string | undefined {
  if (!context.reactMarkup) return undefined;
  const value = vnode.props.dangerouslySetInnerHTML;
  if (value && typeof value === "object" && "__html" in value) {
    if (vnode.children.length) throw new Error("Can only set one of `children` or `props.dangerouslySetInnerHTML`.");
    return String((value as { __html?: unknown }).__html ?? "");
  }
  const tag = String(vnode.type);
  if (tag === "textarea") {
    const content = unwrap(vnode.props.value ?? vnode.props.defaultValue) ?? primitiveText(vnode.children);
    return escapeText(String(content ?? ""));
  }
  if (tag === "style" || tag === "script" && context.reactMarkup === 19) return primitiveText(vnode.children);
  return undefined;
}

function primitiveText(children: readonly Child[]): string {
  let text = "";
  for (const child of children) {
    if (child === null || child === undefined || child === false || child === true) continue;
    if (isVNode(child)) throw new Error("React text-only host elements cannot contain an element child");
    text += String(unwrap(child));
  }
  return text;
}

function reactHostProps(context: SsrContext, vnode: VNode): Record<string, unknown> {
  if (!context.reactMarkup || vnode.type !== "option" || context.reactSelectValue === undefined) return vnode.props;
  const value = String(unwrap(vnode.props.value) ?? primitiveText(vnode.children));
  const selected = Array.isArray(context.reactSelectValue)
    ? context.reactSelectValue.some(item => String(unwrap(item)) === value)
    : String(unwrap(context.reactSelectValue)) === value;
  return { ...vnode.props, selected };
}

function registerReactImagePreload(context: SsrContext, tag: string, props: Record<string, unknown>): void {
  if (context.reactMarkup !== 19 || tag !== "img") return;
  const src = unwrap(props.src);
  if (typeof src !== "string" || !src || unwrap(props.loading) === "lazy" || unwrap(props.fetchPriority) === "low") return;
  const key = `image:${src}`;
  if (context.reactResourceKeys.has(key)) return;
  context.reactResourceKeys.add(key);
  const crossOrigin = unwrap(props.crossOrigin);
  const suffix = crossOrigin === undefined ? "" : ` crossorigin="${escapeAttr(String(crossOrigin))}"`;
  context.reactResourceHints.push(`<link rel="preload" as="image" href="${escapeAttr(src)}"${suffix}/>`);
}

function renderServerBoundary(context: SsrContext, vnode: VNode): string {
  const id = String(unwrap(vnode.props.id) ?? "");
  const name = String(unwrap(vnode.props.name) ?? "");
  const props = clientBoundaryProps(vnode);
  const unsafePath = jsonUnsafePath(props);
  if (unsafePath) {
    throw new Error(clientBoundarySerializationMessage(name, id, unsafePath));
  }
  const children = renderServerBoundaryChildren(context, vnode, undefined);
  // Client boundary props are serialized into an attribute, while children are
  // represented as server slots so the client bundle does not need server-only code.
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
    throw new Error(clientBoundarySerializationMessage(name, id, unsafePath));
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

function clientBoundarySerializationMessage(name: string, id: string, unsafePath: string): string {
  const label = name || id;
  const location = name && id ? `${label} (${id})` : label;
  const generatedBucket = clientBoundaryGeneratedBucket(unsafePath);
  const generatedHint = generatedBucket
    ? ` in generated ${generatedBucket} payload`
    : "";
  return `Client boundary ${location} props must be JSON-serializable; non-serializable value at ${unsafePath}${generatedHint}`;
}

function clientBoundaryGeneratedBucket(path: string): string | undefined {
  const match = /^\$\.(__exact[A-Za-z0-9_$]*)(?:\.|\[|$)/.exec(path);
  return match?.[1];
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

function shouldEmitDocumentHydration(options: RenderToDocumentStreamOptions): boolean {
  if (options.hydration === false) return false;
  if (options.hydration === true) return true;
  return options.endpoint !== undefined
    || options.endpoints !== undefined
    || options.state !== undefined
    || options.stateContracts !== undefined
    || options.actionBoundaries !== undefined
    || options.scriptId !== undefined
    || options.nonce !== undefined;
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

async function drainTasks(
  pending: Set<Promise<unknown>>,
  maxPasses: number,
  signal?: AbortSignal,
  deadline?: number
): Promise<void> {
  for (let pass = 0; pending.size && pass < maxPasses; pass++) {
    if (signal?.aborted) throw signal.reason ?? new DOMException("SSR render aborted", "AbortError");
    await awaitWithAbort(Promise.all([...pending]), signal, deadline);
  }
  if (pending.size) {
    throw new Error(`SSR task drain exceeded ${maxPasses} passes`);
  }
}

async function awaitWithAbort<T>(promise: Promise<T>, signal?: AbortSignal, deadline?: number): Promise<T> {
  if (signal?.aborted) throw signal.reason ?? new DOMException("SSR render aborted", "AbortError");
  const remaining = deadline === undefined ? undefined : deadline - Date.now();
  if (remaining !== undefined && remaining <= 0) throw new SsrTaskDeadlineError();
  let abort!: () => void;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    if (signal) {
      abort = () => reject(signal.reason ?? new DOMException("SSR render aborted", "AbortError"));
      signal.addEventListener("abort", abort, { once: true });
    }
    if (remaining !== undefined) timer = setTimeout(() => reject(new SsrTaskDeadlineError()), remaining);
  });
  try {
    return await Promise.race([promise, interrupted]);
  } finally {
    if (signal && abort) signal.removeEventListener("abort", abort);
    if (timer) clearTimeout(timer);
  }
}

function createSsrContext(options: RenderToStringOptions): SsrContext {
  return {
    markers: options.markers ?? true,
    textSeparators: options.textSeparators ?? false,
    reactMarkup: options.reactMarkup ?? false,
    nextId: 0,
    logger: options.logger,
    maxTreeDepth: normalizeTreeDepth(options.maxTreeDepth),
    traversalDepth: 0,
    maxTreeNodes: normalizePositiveLimit(options.maxTreeNodes, DEFAULT_MAX_TREE_NODES),
    traversedNodes: 0,
    maxOutputBytes: normalizePositiveLimit(options.maxOutputBytes, DEFAULT_MAX_OUTPUT_BYTES),
    reactResourceHints: [],
    reactResourceKeys: new Set()
  };
}

function normalizePositiveLimit(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && value! > 0 ? value! : fallback;
}

function countSsrNode(context: SsrContext): void {
  if (++context.traversedNodes > context.maxTreeNodes) throw new SsrTreeNodeError(context.maxTreeNodes);
}

function boundedJoin(context: SsrContext, chunks: readonly string[]): string {
  let characters = 0;
  for (const chunk of chunks) {
    characters += chunk.length;
    if (characters > context.maxOutputBytes) throw new SsrOutputLimitError(context.maxOutputBytes);
  }
  const html = chunks.join("");
  assertOutputCharacterBound(context, html);
  return html;
}

function assertOutputCharacterBound(context: SsrContext, html: string): void {
  // UTF-8 is never shorter than the UTF-16 code-unit count. This constant-time
  // subtree check prevents oversized allocation without rescanning the same
  // descendant output at every ancestor; roots receive the exact byte check.
  if (html.length > context.maxOutputBytes) throw new SsrOutputLimitError(context.maxOutputBytes);
}

function assertOutputWithinLimit(context: SsrContext, html: string): void {
  assertOutputCharacterBound(context, html);
  // ASCII is the overwhelmingly common SSR path and needs no allocation.
  if (/[^\x00-\x7f]/.test(html) && new TextEncoder().encode(html).byteLength > context.maxOutputBytes) {
    throw new SsrOutputLimitError(context.maxOutputBytes);
  }
}

function normalizeTreeDepth(value: number | undefined): number {
  return Number.isSafeInteger(value) && value! > 0
    ? Math.min(value!, HARD_MAX_TREE_DEPTH)
    : DEFAULT_MAX_TREE_DEPTH;
}

function withSsrTreeDepth<T>(context: SsrContext, run: () => T): T {
  context.traversalDepth++;
  if (context.traversalDepth > context.maxTreeDepth) {
    context.traversalDepth--;
    throw new SsrTreeDepthError(context.maxTreeDepth);
  }
  try { return run(); }
  finally { context.traversalDepth--; }
}

async function withSsrTreeDepthAsync<T>(context: SsrContext, run: () => Promise<T>): Promise<T> {
  context.traversalDepth++;
  if (context.traversalDepth > context.maxTreeDepth) {
    context.traversalDepth--;
    throw new SsrTreeDepthError(context.maxTreeDepth);
  }
  try { return await run(); }
  finally { context.traversalDepth--; }
}

function withTaskDeadline<T extends RenderToStringOptions>(options: T): T & { taskDeadline: number } {
  const existing = (options as SsrRenderOptions).taskDeadline;
  if (typeof existing === "number") return options as T & { taskDeadline: number };
  const duration = Number.isSafeInteger(options.maxTaskDurationMs) && options.maxTaskDurationMs! > 0
    ? options.maxTaskDurationMs!
    : DEFAULT_MAX_TASK_DURATION_MS;
  return { ...options, taskDeadline: Date.now() + duration };
}

function isSsrRenderLimitError(error: unknown): error is SsrTreeDepthError | SsrTreeNodeError | SsrOutputLimitError | SsrTaskDeadlineError {
  return error instanceof SsrTreeDepthError || error instanceof SsrTreeNodeError
    || error instanceof SsrOutputLimitError || error instanceof SsrTaskDeadlineError;
}

function isSsrRenderInterruption(error: unknown, signal?: AbortSignal): boolean {
  return isSsrRenderLimitError(error) || signal?.aborted === true;
}
