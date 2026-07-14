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
  logFrameworkEvent,
  normalizeRenderResult,
  renderInstance,
  withTaskObserver,
  type VNode
} from "@exact/core";
import { unwrap } from "@exact/reactive";
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

/** Renders a vnode tree to an HTML string without waiting for async component tasks. */
export function renderToString(vnode: VNode, options: RenderToStringOptions = {}): RenderToStringResult {
  const owner = createSsrOwner();
  try {
    return withTaskObserver(owner.observer, () => renderToStringOwned(vnode, options));
  } finally {
    owner.dispose("ssr render complete");
  }
}

function renderToStringOwned(vnode: VNode, options: RenderToStringOptions): RenderToStringResult {
  const context = createSsrContext(options);

  return {
    html: [...renderVNodeChunks(context, vnode, undefined, 1)].join(""),
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

  return {
    html: await renderVNodeAsync(context, vnode, undefined, renderOptions),
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
  } finally {
    owner.dispose(options.signal?.reason ?? "ssr stream complete");
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
  const context = createSsrContext(options);
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
      ?? parseKeyedListSnapshotHtml(options.listId, input.boundaryHtml)?.items;
    return {
      patches: previous
        ? diffKeyedListItems(options.listId, previous, next.items)
        : [{ type: "replace", id: options.listId, html: next.innerHtml } as ExactPatch]
    };
  };
}

/** Parses framework-shaped keyed list HTML back into a snapshot for diffing. */
export function parseKeyedListSnapshotHtml(listId: string, html: string | undefined): KeyedListSnapshot | undefined {
  if (html === undefined) return undefined;
  const items: KeyedListSnapshotItem[] = [];
  const pattern = /<!--exact:(item:[^>]*)-->([\s\S]*?)<!--\/exact:\1-->/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const marker = match[1]!;
    if (!marker.startsWith("item:")) continue;
    items.push({
      key: decodeMarkerKey(marker.slice("item:".length)),
      html: match[0]
    });
  }
  if (!items.length) return undefined;
  return {
    listId,
    html: markerPair(createSsrContext({ markers: true }), exactMarkerId(listId), () => html),
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
      if (error instanceof SsrTreeDepthError) throw error;
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
  yield `<${tag}${renderAttrs(vnode.props)}>`;
  if (voidElements.has(tag)) return;
  for (const child of vnode.children) yield* renderChildChunks(context, child, parent, depth + 1);
  yield `</${tag}>`;
}

function* renderChildChunks(
  context: SsrContext,
  child: Child,
  parent: ComponentInstance<any> | undefined,
  depth: number
): Generator<string> {
  if (child === null || child === undefined || child === false || child === true) return;
  if (isVNode(child)) yield* renderVNodeChunks(context, child, parent, depth);
  else yield escapeText(String(unwrap(child)));
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
  return withSsrTreeDepth(context, () => renderVNodeInner(context, vnode, parent));
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
  options: SsrRenderOptions
): Promise<string> {
  return withSsrTreeDepthAsync(context, () => renderVNodeAsyncInner(context, vnode, parent, options));
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
  try {
    const pending = new Set<Promise<unknown>>();
    const observer: TaskObserver = {
      register: promise => {
        let observed: Promise<unknown>;
        observed = promise.finally(() => pending.delete(observed));
        pending.add(observed);
      }
    };
    instance = withTaskObserver(observer, () => createComponentInstance(
      vnode.type as ComponentFunction<any, Record<string, unknown>>,
      getComponentProps(vnode),
      parent
    ));
    await drainTasks(pending, options.maxTaskPasses ?? 10, options.signal, options.taskDeadline);
    const children = renderInstance(instance, () => undefined);
    return markerPair(context, componentId, async () => renderChildrenAsync(context, children, instance, options));
  } catch (error) {
    if (isSsrRenderLimitError(error)) throw error;
    const fallback = handleComponentError(
      parent,
      createErrorReport(error, "construct", parent, componentName(vnode.type))
    );
    return markerPair(context, componentId, async () => fallback ? renderChildrenAsync(context, normalizeRenderResult(fallback()), parent, options) : "");
  } finally {
    instance?.unmount(String(options.signal?.reason ?? "ssr render complete"));
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
      for (const instance of [...instances].reverse()) instance.unmount(String(reason));
      instances.clear();
    }
  };
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
    nextId: 0,
    logger: options.logger,
    maxTreeDepth: normalizeTreeDepth(options.maxTreeDepth),
    traversalDepth: 0
  };
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

function isSsrRenderLimitError(error: unknown): error is SsrTreeDepthError | SsrTaskDeadlineError {
  return error instanceof SsrTreeDepthError || error instanceof SsrTaskDeadlineError;
}
