import {
  Cell,
  Dynamic,
  Fragment,
  ServerBoundary,
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
import type { ExactInvocationRequest, ExactInvocationResult, ExactPatch, ExactServerContext, ExactStateContract } from "@exact/server";

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
  patchStrategy?: "replace" | "text";
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
    stateContracts: options.stateContracts
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
    return {
      patches: [boundaryPatch(options.boundaryId, result.html, options.patchStrategy)],
      state: result.state
    };
  };
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
    return withMarker(context, "fragment", vnode.key, () => {
      const list = vnode.props.list as { collection: Iterable<unknown>; source?: { get(): Iterable<unknown> }; key(item: unknown): string; render(item: unknown): VNode } | undefined;
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
    return markerPair(context, markerId(context, "fragment", undefined, vnode.key), async () => {
      const list = vnode.props.list as { collection: Iterable<unknown>; source?: { get(): Iterable<unknown> }; key(item: unknown): string; render(item: unknown): VNode } | undefined;
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
    return renderServerBoundary(context, vnode);
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
  const props = unwrap(vnode.props.props) ?? {};
  if (!isJsonSafe(props)) {
    throw new Error(`Client boundary ${name || id} props must be JSON-serializable`);
  }
  const html = `<div data-exact-client-boundary="${escapeAttr(id)}" data-exact-client-name="${escapeAttr(name)}" data-exact-client-props="${escapeAttr(serializeHydrationPayload({ props }))}"></div>`;
  return markerPair(context, markerId(context, "client-boundary", name, id), () => html);
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
  if (value === undefined || value === null) return true;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.every(item => isJsonSafe(item, seen));
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.values(value as Record<string, unknown>).every(item => isJsonSafe(item, seen));
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
