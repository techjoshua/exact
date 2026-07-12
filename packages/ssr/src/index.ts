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
  type VNode
} from "@exact/core";
import { unwrap } from "@exact/reactive";
import type { ExactPatch } from "@exact/server";
import { boundaryPatch, diffBoundaryHtml, diffKeyedListItems } from "./diff.js";
import { escapeAttr, escapeAttrName, escapeText, voidElements } from "./html.js";
import { jsonUnsafePath, renderHydrationScript, serializeHydrationPayload } from "./hydration.js";
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
    endpoints: options.endpoints,
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

export function renderToDocumentStream(vnode: VNode, options: RenderToDocumentStreamOptions = {}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: ExactDocumentStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      void streamDocumentRender(vnode, options, emit)
        .then(() => controller.close())
        .catch(error => {
          emit({ event: "error", version: 1, message: error instanceof Error ? error.message : String(error) });
          controller.close();
        });
    }
  });
}

export function renderToHydratableDocumentStream(vnode: VNode, options: RenderToDocumentStreamOptions = {}): ReadableStream<Uint8Array> {
  return renderToDocumentStream(vnode, {
    ...options,
    hydration: options.hydration ?? true
  });
}

export function renderToProgressiveHtmlStream(vnode: VNode, options: RenderToProgressiveHtmlStreamOptions = {}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const streamOptions: RenderToProgressiveHtmlStreamOptions = {
    ...options,
    rootId: progressiveRootId(options)
  };
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (chunk: string) => {
        controller.enqueue(encoder.encode(chunk));
      };
      void streamDocumentRender(vnode, streamOptions, event => {
        const chunk = progressiveHtmlChunk(event, streamOptions);
        if (chunk) emit(chunk);
      })
        .then(() => controller.close())
        .catch(error => {
          emit(progressiveErrorScript(error, streamOptions));
          controller.close();
        });
    }
  });
}

export function renderToHydratableProgressiveHtmlStream(vnode: VNode, options: RenderToProgressiveHtmlStreamOptions = {}): ReadableStream<Uint8Array> {
  return renderToProgressiveHtmlStream(vnode, {
    ...options,
    hydration: options.hydration ?? true
  });
}

export function renderToProgressiveHtmlResponse(vnode: VNode, options: RenderToProgressiveHtmlResponseOptions = {}): ExactResponseLike {
  return progressiveHtmlResponse(renderToProgressiveHtmlStream(vnode, options), options);
}

export function renderToHydratableProgressiveHtmlResponse(vnode: VNode, options: RenderToProgressiveHtmlResponseOptions = {}): ExactResponseLike {
  return progressiveHtmlResponse(renderToHydratableProgressiveHtmlStream(vnode, options), options);
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
    endpoints: options.endpoints,
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

async function streamDocumentRender(
  vnode: VNode,
  options: RenderToDocumentStreamOptions,
  emit: (event: ExactDocumentStreamEvent) => void
): Promise<void> {
  const pending = new Set<Promise<unknown>>();
  const observer: TaskObserver = {
    register: promise => {
      let observed: Promise<unknown>;
      observed = promise.finally(() => pending.delete(observed));
      pending.add(observed);
    }
  };

  emit({ event: "start", version: 1 });
  const shell = withTaskObserver(observer, () => renderToString(vnode, options));
  emit({ event: "shell", version: 1, html: shell.html });

  let final = shell;
  if (pending.size) {
    await drainTasks(pending, options.maxTaskPasses ?? 10);
    final = await renderToStringAsync(vnode, options);
    if (final.html !== shell.html) {
      emit({ event: "replace", version: 1, id: options.rootId ?? "document", html: final.html });
    }
  }

  if (shouldEmitDocumentHydration(options)) {
    emit({
      event: "hydration",
      version: 1,
      html: renderHydrationScript({
        endpoint: options.endpoint,
        endpoints: options.endpoints,
        state: final.state,
        stateContracts: options.stateContracts,
        actionBoundaries: options.actionBoundaries,
        scriptId: options.scriptId,
        nonce: options.nonce
      })
    });
  }

  emit({ event: "complete", version: 1 });
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
      ...(result.state === undefined ? {} : { state: result.state })
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
    throw new Error(clientBoundarySerializationMessage(name, id, unsafePath));
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

function progressiveHtmlChunk(event: ExactDocumentStreamEvent, options: RenderToProgressiveHtmlStreamOptions): string {
  switch (event.event) {
    case "start":
    case "complete":
      return "";
    case "shell":
      return `<div id="${escapeAttr(progressiveRootId(options))}">${event.html}</div>`;
    case "replace":
      return inlineScript(`var e=document.getElementById(${inlineJsonString(event.id)});if(e)e.innerHTML=${inlineJsonString(event.html)};`, options);
    case "hydration":
      return event.html;
    case "error":
      return inlineScript(`console.error(${inlineJsonString(`eXact document stream failed: ${event.message}`)});`, options);
  }
}

function progressiveRootId(options: RenderToProgressiveHtmlStreamOptions): string {
  return options.rootId ?? "exact-root";
}

function progressiveHtmlResponse(stream: ReadableStream<Uint8Array>, options: RenderToProgressiveHtmlResponseOptions): ExactResponseLike {
  const headers = {
    ...options.headers
  };
  if (options.contentType !== undefined || !hasHeader(headers, "content-type")) {
    setHeader(headers, "content-type", options.contentType ?? "text/html; charset=utf-8");
  }
  return {
    status: options.status ?? 200,
    headers,
    body: "",
    stream
  };
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some(header => header.toLowerCase() === name);
}

function setHeader(headers: Record<string, string>, name: string, value: string): void {
  const existing = Object.keys(headers).find(header => header.toLowerCase() === name);
  if (existing) {
    headers[existing] = value;
  } else {
    headers[name] = value;
  }
}

function progressiveErrorScript(error: unknown, options: RenderToProgressiveHtmlStreamOptions): string {
  const message = error instanceof Error ? error.message : String(error);
  return inlineScript(`console.error(${inlineJsonString(`eXact document stream failed: ${message}`)});`, options);
}

function inlineScript(body: string, options: RenderToProgressiveHtmlStreamOptions): string {
  const nonce = options.nonce === undefined ? "" : ` nonce="${escapeAttr(options.nonce)}"`;
  return `<script${nonce}>${body}</script>`;
}

function inlineJsonString(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003C").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
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
