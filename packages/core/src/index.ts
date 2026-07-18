import {
  batch,
  computed,
  createEffectScope,
  reactive,
  ref as reactiveRef,
  writeReactive,
  writeReactiveLazy,
  updateReactiveValue,
  updateReactiveValueWithResult,
  deleteReactiveValue,
  mutateReactiveArray,
  peek,
  isReactiveValue,
  registerReactiveListKey,
  subscribe,
  updateReactive,
  unwrap,
  watch,
  withEffectScope,
  type EffectScope,
  type Reactive,
  type ReactiveValue,
  type ReactiveRef,
  type StopHandle
} from "@exact/reactive";

/** Mutable collector used to make multi-resource cleanup failure-complete. */
export type CleanupFailure = { failed: boolean; error: unknown };

export function createCleanupFailure(): CleanupFailure {
  return { failed: false, error: undefined };
}

export function recordCleanupFailure(failure: CleanupFailure, error: unknown): void {
  if (!failure.failed) failure.error = error;
  failure.failed = true;
}

export function attemptCleanup(failure: CleanupFailure, cleanup: () => void): void {
  try { cleanup(); }
  catch (error) { recordCleanupFailure(failure, error); }
}

export function throwCleanupFailure(failure: CleanupFailure): void {
  if (failure.failed) throw failure.error;
}

/** Preserves an active primary failure while retaining cleanup diagnostics. */
export function attachSuppressedCleanupFailure(primary: unknown, cleanup: unknown): void {
  if (!primary || (typeof primary !== "object" && typeof primary !== "function")) return;
  try {
    const target = primary as { suppressed?: unknown[] };
    const suppressed = Array.isArray(target.suppressed) ? target.suppressed : [];
    suppressed.push(cleanup);
    if (target.suppressed !== suppressed) Object.defineProperty(target, "suppressed", { configurable: true, value: suppressed });
  } catch { /* preserving the primary failure takes precedence */ }
}
import { createContext, createRef } from "./keys.js";
import {
  createConsoleLogger,
  type ComponentLog,
  type LazyLogValue,
  type Logger,
  type LogEvent,
  type LogLevel,
  type LogScope
} from "./logging.js";
import { Cell, Dynamic, Fragment, Portal, ServerBoundary, ServerSlot, Text, UnsafeHtml } from "./symbols.js";
export { decodeExactMarkerPart, encodeExactMarkerPart, exactMarkerEnd, exactMarkerStart } from "./protocol.js";
export { sameJsonData, type JsonComparisonOptions } from "./json.js";
export { BLOCKED_JAVASCRIPT_URL, isUrlAttribute, sanitizeUrlAttribute } from "./url.js";
import {
  createCellVNode,
  createCompiledFragment,
  createCompiledVNode,
  createDynamicChild,
  createExpression,
  createPortal,
  createServerBoundary,
  createServerSlot,
  createTextVNode,
  createVNode,
  getCellVNode,
  isCellVNode,
  isVNode,
  normalizeChildren,
  normalizeDocumentVNode,
  unsafeHtml
} from "./vnode.js";

export type { Reactive, ReactiveValue, StopHandle } from "@exact/reactive";
export { batch, computed, peek, unwrap, watch } from "@exact/reactive";
export { decodeReactiveProtocolValue, encodeReactiveProtocolValue } from "@exact/reactive";
// Compiler-only helpers. They remain available here because generated JSX
// already imports all framework helpers from @exact/core.
export { writeReactive, writeReactiveLazy, updateReactiveValue, updateReactiveValueWithResult, deleteReactiveValue, mutateReactiveArray } from "@exact/reactive";
export { createContext, createRef, type ContextOptions } from "./keys.js";
export {
  createConsoleLogger,
  type ComponentLog,
  type ConsoleLoggerOptions,
  type Logger,
  type LogEvent,
  type LogLevel,
  type LogScope
} from "./logging.js";
export { Cell, Dynamic, Fragment, Portal, ServerBoundary, ServerSlot, Text, UnsafeHtml } from "./symbols.js";
export {
  createCellVNode,
  createCompiledFragment,
  createCompiledVNode,
  createDynamicChild,
  createExpression,
  createPortal,
  createServerBoundary,
  createServerSlot,
  createTextVNode,
  createVNode,
  getCellVNode,
  isCellVNode,
  isVNode,
  normalizeChildren,
  normalizeDocumentVNode,
  unsafeHtml
} from "./vnode.js";

export type VNodeType = string | typeof Fragment | typeof Text | typeof Cell | typeof Dynamic | typeof Portal | typeof ServerBoundary | typeof ServerSlot | typeof UnsafeHtml | ComponentFunction<any, any>;

export type VNode<Props = Record<string, unknown>> = {
  type: VNodeType;
  props: Props;
  children: Child[];
  key?: string;
};

export type VNodeCell = {
  readonly id: symbol;
  readonly vnode: VNode;
};

export type ListBinding<T = unknown> = {
  collection: Iterable<T>;
  source?: ReactiveRef<Iterable<T>>;
  key: (item: T) => string;
  render: (item: T) => VNode;
  cache?: Map<string, { item: T; vnode: VNode }>;
};

export type Child = VNode | string | number | boolean | null | undefined | object;

export type RenderResult = Child | Child[];
export type RenderFunction = () => RenderResult;
export type UnsafeHtmlAuditEvent = {
  /** UTF-16 code units accepted by the raw range; the content is never included. */
  characters: number;
};
export type ComponentFunction<State extends object = Record<string, unknown>, Props = any> = (
  this: Component<State>,
  props: Props
) => RenderFunction | RenderResult;

export type ErrorSource =
  | "component"
  | "construct"
  | "render"
  | "task"
  | "event"
  | "lifecycle"
  | "reactive"
  | "dom";

export type ErrorReport = {
  /** @exact key */
  id: string;
  error: unknown;
  source: ErrorSource;
  component?: {
    id: string;
    name: string;
    mounted: boolean;
  };
  phase?: string;
};

export type ErrorReportOptions = {
  source?: ErrorSource;
  phase?: string;
  component?: ErrorReport["component"];
};

export type ErrorContextValue = {
  errors: ErrorReport[];
  /** Optional owning boundary; errors thrown by that boundary itself skip this context. */
  boundary?: ComponentInstance<any>;
  report(error: unknown, options?: ErrorReportOptions): ErrorReport;
  clear(error: ErrorReport | string): void;
  clearAll(): void;
};

export type SuspensionContextValue = {
  suspend(promise: PromiseLike<unknown>): void;
};

export type ContextToken<T> = {
  readonly id: symbol;
  readonly description: string;
  readonly global: boolean;
  readonly reactive: boolean;
  readonly scope: "component" | "application" | "request";
};

export type ComponentContextValues = ReadonlyMap<symbol, unknown>;

export const LoggerContext = createContext<Logger>("exact.logger", true);
export const ErrorContext = createContext<ErrorContextValue>("exact.error", true);
export const SuspensionContext = createContext<SuspensionContextValue>("exact.suspension");

export type RefKey<T> = {
  readonly id: symbol;
  readonly description: string;
};

export type RefBinding<T> = {
  readonly key: RefKey<T>;
  readonly owner: ComponentInstance<any>;
  fulfill(value: T | undefined): void;
};

export type RefRegistry = {
  get<T>(key: RefKey<T>): T | undefined;
};

export type TaskContext = {
  signal: AbortSignal;
};

type ManagedEventListenerOptions = EventListenerOptions & {
  once?: boolean;
  passive?: boolean;
  signal?: AbortSignal;
};

export type TaskResourceDisposal = string;
export type TaskCleanup = (reason?: unknown) => void | Promise<void>;
export type TaskIdleDeadline = { readonly didTimeout: boolean; timeRemaining(): number };
export type TaskIdleOptions = { timeout?: number };

const taskOwners = new WeakMap<AbortSignal, ComponentInstance<any>>();
const taskCleanupPromises = new WeakMap<AbortSignal, Set<Promise<void>>>();

/** Compiler helper that attaches framework ownership without discarding author event options. */
export function withAbortSignal(
  options: boolean | ManagedEventListenerOptions | undefined,
  owner: AbortSignal
): ManagedEventListenerOptions {
  const normalized: ManagedEventListenerOptions = typeof options === "boolean"
    ? { capture: options }
    : options ? { ...options } : {};
  const existing = normalized.signal;
  if (!existing || existing === owner) return { ...normalized, signal: owner };
  return { ...normalized, signal: combineAbortSignals(existing, owner) };
}

/** Compiler helper that adds task cancellation to an API options object. */
export function withTaskSignal<T extends object | undefined>(options: T, owner: AbortSignal): T & { signal: AbortSignal } {
  const normalized = options ? { ...options } : {};
  const existing = "signal" in normalized && isAbortSignal(normalized.signal) ? normalized.signal : undefined;
  return { ...normalized, signal: combineTaskSignal(owner, existing) } as T & { signal: AbortSignal };
}

/** Compiler helper that combines an explicit signal with the owning task generation. */
export function combineTaskSignal(owner: AbortSignal, existing?: AbortSignal): AbortSignal {
  if (!existing || existing === owner) return owner;
  return combineAbortSignals(existing, owner);
}

/** Registers once-only task cleanup and reports asynchronous disposal failures. */
export function registerTaskCleanup(signal: AbortSignal, cleanup: TaskCleanup): void {
  let active = true;
  const run = (): void => {
    if (!active) return;
    active = false;
    signal.removeEventListener("abort", run);
    try {
      const result = cleanup(signal.reason);
      if (isPromiseLike(result)) {
        trackTaskCleanupPromise(signal, Promise.resolve(result).catch(error => {
          reportTaskResourceError(signal, error);
        }));
      }
    } catch (error) {
      reportTaskResourceError(signal, error);
    }
  };
  if (signal.aborted) run();
  else signal.addEventListener("abort", run, { once: true });
}

function trackTaskCleanupPromise(signal: AbortSignal, promise: Promise<void>): void {
  let pending = taskCleanupPromises.get(signal);
  if (!pending) {
    pending = new Set();
    taskCleanupPromises.set(signal, pending);
  }
  pending.add(promise);
  void promise.finally(() => {
    pending!.delete(promise);
    if (!pending!.size) taskCleanupPromises.delete(signal);
  });
}

function drainTaskCleanupPromises(signal: AbortSignal | undefined): Promise<void> | undefined {
  if (!signal) return undefined;
  const pending = taskCleanupPromises.get(signal);
  if (!pending?.size) return undefined;
  return Promise.all([...pending]).then(() => undefined);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return !!value && (typeof value === "object" || typeof value === "function")
    && typeof (value as PromiseLike<void>).then === "function";
}

/** Owns a disposable value while preserving the value and expression result. */
export function ownTaskResource<T>(
  signal: AbortSignal,
  resource: T,
  disposal?: TaskResourceDisposal | ((resource: T, reason?: unknown) => void | Promise<void>)
): T {
  registerTaskCleanup(signal, reason => disposeTaskResource(resource, disposal, reason));
  return resource;
}

/** Compiler helper for idle callbacks owned by one task generation. */
export function taskIdleCallback(
  signal: AbortSignal,
  callback: (deadline: TaskIdleDeadline) => void,
  options?: TaskIdleOptions
): number {
  const platform = globalThis as typeof globalThis & {
    requestIdleCallback(callback: (deadline: TaskIdleDeadline) => void, options?: TaskIdleOptions): number;
    cancelIdleCallback(handle: number): void;
  };
  let handle = 0;
  const cancel = () => platform.cancelIdleCallback(handle);
  handle = platform.requestIdleCallback(deadline => {
    signal.removeEventListener("abort", cancel);
    if (!signal.aborted) runTaskCallback(signal, "idle-callback", () => callback(deadline));
  }, options);
  if (signal.aborted) cancel();
  else signal.addEventListener("abort", cancel, { once: true });
  return handle;
}

function combineAbortSignals(left: AbortSignal, right: AbortSignal): AbortSignal {
  const nativeAny = (AbortSignal as typeof AbortSignal & { any?(signals: AbortSignal[]): AbortSignal }).any;
  if (nativeAny) return nativeAny.call(AbortSignal, [left, right]);
  const controller = new AbortController();
  const abort = (event: Event) => {
    left.removeEventListener("abort", abort);
    right.removeEventListener("abort", abort);
    controller.abort((event.currentTarget as AbortSignal | null)?.reason);
  };
  if (left.aborted) controller.abort(left.reason);
  else if (right.aborted) controller.abort(right.reason);
  else {
    left.addEventListener("abort", abort, { once: true });
    right.addEventListener("abort", abort, { once: true });
  }
  return controller.signal;
}

function disposeTaskResource<T>(
  resource: T,
  disposal: TaskResourceDisposal | ((resource: T, reason?: unknown) => void | Promise<void>) | undefined,
  reason: unknown
): void | Promise<void> {
  if (typeof disposal === "function") return disposal(resource, reason);
  const value = resource as any;
  if (disposal === "call") return value();
  if (disposal === "cancel") return value?.cancel?.(reason);
  if (disposal) return value?.[disposal]?.();
  const asyncDispose = (Symbol as any).asyncDispose;
  if (asyncDispose && typeof value?.[asyncDispose] === "function") return value[asyncDispose]();
  const dispose = (Symbol as any).dispose;
  if (dispose && typeof value?.[dispose] === "function") return value[dispose]();
}

function reportTaskResourceError(signal: AbortSignal, error: unknown): void {
  const instance = taskOwners.get(signal);
  if (instance) {
    handleComponentError(instance, createErrorReport(error, "task", instance, "resource-cleanup"));
    return;
  }
  logFrameworkEvent("error", "core", "task", "task resource cleanup failed", error);
}

/** Compiler helpers for resources whose lifetime is owned by a task generation. */
export function taskTimeout(signal: AbortSignal, handler: (...args: any[]) => void, delay?: number, ...args: any[]): ReturnType<typeof setTimeout> {
  let timeout: ReturnType<typeof setTimeout>;
  const abort = () => clearTimeout(timeout);
  timeout = setTimeout((...values: any[]) => {
    signal.removeEventListener("abort", abort);
    if (!signal.aborted) runTaskCallback(signal, "timeout", () => handler(...values));
  }, delay, ...args);
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
  return timeout;
}

export function taskInterval(signal: AbortSignal, handler: (...args: any[]) => void, delay?: number, ...args: any[]): ReturnType<typeof setInterval> {
  const interval = setInterval((...values: any[]) => {
    if (!signal.aborted) runTaskCallback(signal, "interval", () => handler(...values));
  }, delay, ...args);
  if (signal.aborted) clearInterval(interval);
  else signal.addEventListener("abort", () => clearInterval(interval), { once: true });
  return interval;
}

export function taskAnimationFrame(signal: AbortSignal, handler: (time: number) => void): number {
  const platform = globalThis as typeof globalThis & {
    requestAnimationFrame(callback: (time: number) => void): number;
    cancelAnimationFrame(id: number): void;
  };
  let frame = 0;
  const cancel = () => platform.cancelAnimationFrame(frame);
  frame = platform.requestAnimationFrame(time => {
    signal.removeEventListener("abort", cancel);
    if (!signal.aborted) runTaskCallback(signal, "animation-frame", () => handler(time));
  });
  if (signal.aborted) cancel();
  else signal.addEventListener("abort", cancel, { once: true });
  return frame;
}

export function taskObserver<T extends { disconnect(): void }>(signal: AbortSignal, observer: T): T {
  registerTaskCleanup(signal, () => observer.disconnect());
  return observer;
}

function runTaskCallback(signal: AbortSignal, phase: string, callback: () => void): void {
  try {
    callback();
  } catch (error) {
    const instance = taskOwners.get(signal);
    if (instance) handleComponentError(instance, createErrorReport(error, "task", instance, phase));
    else reportTaskResourceError(signal, error);
  }
}

export function taskFetch<T>(signal: AbortSignal, fetcher: (...args: any[]) => T, input: unknown, init?: Record<string, unknown>): T {
  const options = init ? { ...init } : {};
  const existing = options.signal;
  options.signal = isAbortSignal(existing) ? combineAbortSignals(existing, signal) : signal;
  return fetcher(input, options);
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return !!value && typeof value === "object"
    && typeof (value as AbortSignal).addEventListener === "function"
    && typeof (value as AbortSignal).aborted === "boolean";
}

export function taskAwait<T>(signal: AbortSignal, value: T | PromiseLike<T>): Promise<T> {
  if (signal.aborted) return Promise.reject(createAbortError(signal.reason));
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const abort = () => {
      if (settled) return;
      settled = true;
      reject(createAbortError(signal.reason));
    };
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(value).then(result => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      resolve(result);
    }, error => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      reject(error);
    });
  });
}

/** Compiler runtime hook for a shared, lazily evaluated derived component value. */
export function createDerived<T>(compute: () => T): ReactiveValue<T> {
  return computed(compute);
}

function createAbortError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  const error = new Error(reason === undefined ? "Task aborted" : String(reason));
  error.name = "AbortError";
  return error;
}

export type TaskObserver = {
  register(promise: Promise<unknown>, instance: ComponentInstance<any>): void;
  /** Retains a constructed component for the lifetime of an owning renderer. */
  retain?(instance: ComponentInstance<any>): void;
};

export type Cleanup = void | (() => void | Promise<void>);
export type TaskResult = Cleanup | Promise<Cleanup>;
export type Unwrapped<Deps extends readonly unknown[]> = {
  [K in keyof Deps]: Deps[K] extends ReactiveValue<infer T> ? T : Deps[K] extends Reactive<infer T> ? T : Deps[K];
};
export type ComponentReactiveValue<T> = ReactiveValue<T> & {
  task(work: (value: T, ctx: TaskContext) => TaskResult): void;
};
export type IterableItem<T> = T extends Iterable<infer Item> ? Item : never;

export type ComponentTask = {
  (work: (ctx: TaskContext) => TaskResult): void;
  <Deps extends readonly unknown[]>(
    ...args: [...deps: Deps, work: (...args: [...Unwrapped<Deps>, TaskContext]) => TaskResult]
  ): void;
  server: ComponentTaskRegistration;
  client: ComponentTaskRegistration;
};

export type ComponentTaskRegistration = {
  (work: (ctx: TaskContext) => TaskResult): void;
  <Deps extends readonly unknown[]>(
    ...args: [...deps: Deps, work: (...args: [...Unwrapped<Deps>, TaskContext]) => TaskResult]
  ): void;
};

// Callback return values are intentionally permissive: concise callbacks often
// return values such as Array#push's number. Promise-like values are observed at
// runtime, while all other results are ignored.
export type LifecycleHandler = (ctx: { signal: AbortSignal; reason?: string }) => unknown;
export type RenderEventHandler = (event: { duration: number; dependencies?: unknown[] }) => unknown;

export interface Component<State extends object> {
  state: Reactive<State>;
  log: ComponentLog;
  getContext<T>(token: ContextToken<T>): Reactive<T>;
  setContext<T>(token: ContextToken<T>, value: T): void;
  reactive(strings: TemplateStringsArray, ...values: unknown[]): ComponentReactiveValue<string>;
  reactive<T>(compute: () => T): ComponentReactiveValue<T>;
  reactive<T>(value: T): ComponentReactiveValue<T>;
  task: ComponentTask;
  ref<T>(key: RefKey<T>): RefBinding<T>;
  refs: RefRegistry;
  map<Collection extends Iterable<unknown>>(
    collection: ReactiveValue<Collection>,
    key: (item: IterableItem<Collection>) => string,
    render: (item: IterableItem<Collection>) => VNode,
    id?: string,
    provenance?: Iterable<IterableItem<Collection>>,
    keyIdentity?: string
  ): VNode;
  map<T>(
    collection: Iterable<T>,
    key: (item: T) => string,
    render: (item: T) => VNode,
    id?: string,
    provenance?: Iterable<T>,
    keyIdentity?: string
  ): VNode;
  onMount(handler: LifecycleHandler): void;
  onUnmount(handler: LifecycleHandler): void;
  onRender(handler: RenderEventHandler): void;
}

export type ComponentInstance<State extends object> = Component<State> & {
  readonly type: ComponentFunction<State, any>;
  readonly parent?: ComponentInstance<any>;
  readonly props: Reactive<Record<string, unknown>>;
  readonly contexts: Map<symbol, unknown>;
  /** Server-owned values inherited by the whole component root. */
  readonly ambientContexts?: ComponentContextValues;
  readonly id: string;
  readonly mounted: boolean;
  readonly scope: EffectScope;
  readonly renderFunction: RenderFunction;
  renderStop?: StopHandle;
  mountController?: AbortController;
  tasks: TaskRegistration[];
  mountHandlers: LifecycleHandler[];
  unmountHandlers: LifecycleHandler[];
  renderHandlers: RenderEventHandler[];
  invalidate?: () => void;
  errorFallback?: RenderFunction;
  beginRender(): void;
  endRender(): void;
  markMounted(): void;
  updateProps(props: Record<string, unknown>): void;
  unmount(reason?: string): void;
};

type TaskRegistration = {
  deps: unknown[];
  sources: ReactiveRef[];
  work: (...args: any[]) => TaskResult;
  stops: StopHandle[];
  controller?: AbortController;
  cleanup?: () => void | Promise<void>;
  settlement?: Promise<void>;
  queuedGeneration?: number;
  stopped: boolean;
  generation: number;
  run(): void;
  stop(): void;
};

type InternalPlugin = {
  readonly name: string;
  readonly defaultContexts?: readonly DefaultContextProvider[];
  augmentComponent?(instance: ComponentInstance<any>): void;
};

type DefaultContextProvider = {
  readonly token: ContextToken<unknown>;
  readonly value: unknown;
};

const defaultConsoleLogger = createConsoleLogger();
const defaultErrorContext = createErrorContext();
const defaultContexts = new Map<symbol, unknown>();
const internalPlugins: InternalPlugin[] = [
  {
    name: "exact.logging",
    defaultContexts: [
      {
        token: LoggerContext as ContextToken<unknown>,
        value: defaultConsoleLogger
      },
      {
        token: ErrorContext as ContextToken<unknown>,
        value: defaultErrorContext
      }
    ],
    augmentComponent(instance) {
      instance.log = createComponentLog(instance);
    }
  }
];

let nextComponentId = 1;
let nextErrorId = 1;
const taskObserverStack: TaskObserver[] = [];
const retainedTaskObservers = new WeakMap<ComponentInstance<any>, TaskObserver>();

for (const plugin of internalPlugins) {
  for (const provider of plugin.defaultContexts ?? []) {
    defaultContexts.set(provider.token.id, provider.value);
  }
}

/** Creates the default reactive error context used by app and framework error boundaries. */
export function createErrorContext(errors: ErrorReport[] = []): ErrorContextValue {
  const reactiveErrors = reactive(errors);

  return {
    errors: reactiveErrors,
    report(error, options) {
      const report = isErrorReport(error)
        ? error
        : createErrorReportFromOptions(error, options);
      reactiveErrors.push(report);
      return report;
    },
    clear(error) {
      const id = typeof error === "string" ? error : error.id;
      const index = reactiveErrors.findIndex(item => item.id === id);
      if (index >= 0) reactiveErrors.splice(index, 1);
    },
    clearAll() {
      reactiveErrors.splice(0, reactiveErrors.length);
    }
  };
}

function createDefaultErrorView(errors: Iterable<ErrorReport>): VNode {
  return createVNode(
    "section",
    { role: "alert", className: "exact-error-boundary" },
    createVNode("h1", null, "Application error"),
    ...Array.from(errors).map(error => createVNode(
      "article",
      { key: error.id, className: "exact-error" },
      createVNode("h2", null, error.component?.name ?? "Framework"),
      createVNode("p", null, `${error.source}${error.phase ? `:${error.phase}` : ""}`),
      createVNode("pre", null, formatError(error.error))
    ))
  );
}

/** Creates a component instance, binds its component API, and runs the component constructor. */
export function createComponentInstance<State extends object, Props extends Record<string, unknown>>(
  type: ComponentFunction<State, Props>,
  rawProps: Props,
  parent?: ComponentInstance<any>,
  ambientContexts: ComponentContextValues | undefined = parent?.ambientContexts
): ComponentInstance<State> {
  const refs = new Map<symbol, unknown>();
  const listCaches = new Map<string, { render: unknown; cache: Map<string, { item: unknown; vnode: VNode }> }>();
  const listKeyRegistrations = new Map<string, { collection: object; identity: string; stop: StopHandle }>();
  const activeListSlots = new Set<string>();
  let mapCallIndex = 0;
  let instance!: ComponentInstance<State>;
  const scope = createEffectScope(undefined, error => {
    handleComponentError(instance, createErrorReport(error, "reactive", instance, "watch"));
  });
  const state = reactive({} as State);
  const props = reactive(rawProps, {
    readonly: true,
    passthroughKeys: ["children"],
    onReadonlyWrite(key) {
      throw new TypeError(`Cannot write to readonly props.${String(key)}`);
    }
  }) as Reactive<Record<string, unknown>>;

  let mounted = false;
  let disposed = false;
  let acceptingTaskRegistrations = true;
  let renderFunction: RenderFunction = () => null;
  const id = `c${nextComponentId++}`;

  instance = {
    type,
    parent,
    id,
    scope,
    state,
    log: createNoopComponentLog(),
    props,
    contexts: new Map(),
    ambientContexts,
    tasks: [],
    mountHandlers: [],
    unmountHandlers: [],
    renderHandlers: [],
    get mounted() {
      return mounted;
    },
    beginRender(): void {
      mapCallIndex = 0;
      activeListSlots.clear();
    },
    endRender(): void {
      for (const [slot, registration] of listKeyRegistrations) {
        if (activeListSlots.has(slot)) continue;
        registration.stop();
        listKeyRegistrations.delete(slot);
        listCaches.delete(slot);
      }
    },
    get renderFunction() {
      return renderFunction;
    },
    refs: {
      get<T>(key: RefKey<T>) {
        return refs.get(key.id) as T | undefined;
      }
    },
    getContext<T>(token: ContextToken<T>): Reactive<T> {
      // Context lookup walks parents first, then falls back to framework defaults.
      // Values are stored reactive so consumers can keep using normal state reads.
      let cursor = parent;
      while (cursor) {
        if (cursor.contexts.has(token.id)) {
          return cursor.contexts.get(token.id) as Reactive<T>;
        }
        cursor = cursor.parent;
      }

      if (ambientContexts?.has(token.id)) {
        const value = ambientContexts.get(token.id) as T;
        return (token.reactive ? reactiveValue(value) : value) as Reactive<T>;
      }

      if (defaultContexts.has(token.id)) {
        const value = defaultContexts.get(token.id) as T;
        return (token.reactive ? reactiveValue(value) : value) as Reactive<T>;
      }

      throw new Error(`Context "${token.description}" was not provided`);
    },
    setContext<T>(token: ContextToken<T>, value: T): void {
      instance.contexts.set(token.id, token.reactive ? reactiveValue(value) : value as Reactive<T>);
    },
    reactive<T>(input: TemplateStringsArray | (() => T) | T, ...values: unknown[]): ComponentReactiveValue<string> | ComponentReactiveValue<T> {
      if (typeof input === "function") {
        return createComponentReactiveValue(instance, computed(input as () => T));
      }

      if (!isTemplateStringsArray(input)) {
        return createComponentReactiveValue(instance, computed(() => input));
      }

      return createComponentReactiveValue(instance, computed(() => {
        let result = "";
        for (let index = 0; index < input.length; index++) {
          result += input[index];
          if (index < values.length) result += String(unwrap(values[index]) ?? "");
        }
        return result;
      }));
    },
    task: Object.assign(function task(...args: unknown[]): void {
      if (!acceptingTaskRegistrations) {
        throw new Error("this.task() must be registered during component setup");
      }
      const work = args[args.length - 1];
      if (typeof work !== "function") {
        throw new TypeError("this.task() requires a work callback");
      }

      const deps = args.slice(0, -1);
      const task = createTask(instance, deps, work as (...args: any[]) => TaskResult);
      instance.tasks.push(task);
      task.run();
    }, {
      server(...args: unknown[]): void {
        (instance.task as (...args: unknown[]) => void)(...args);
      },
      client(...args: unknown[]): void {
        (instance.task as (...args: unknown[]) => void)(...args);
      }
    }) as ComponentTask,
    ref<T>(key: RefKey<T>): RefBinding<T> {
      return {
        key,
        owner: instance,
        fulfill(value) {
          if (value === undefined) {
            refs.delete(key.id);
          } else {
            refs.set(key.id, value);
          }
        }
      };
    },
    map<T>(collection: Iterable<T> | ReactiveValue<Iterable<T>>, key: (item: T) => string, render: (item: T) => VNode, id?: string, provenance?: Iterable<T>, keyIdentity?: string): VNode {
      const source = peek(() => reactiveRef(collection)) as ReactiveRef<Iterable<T>> | undefined;
      const current = isReactiveValue(collection) && source
        ? peek(() => source.get())
        : collection as Iterable<T>;
      // A render pass gives every map call a stable slot. Reuse only when the
      // renderer itself is stable; inline render callbacks are recreated on a
      // parent render and may capture a different parent value.
      const cacheId = id ?? `map:${mapCallIndex++}`;
      activeListSlots.add(cacheId);
      const registrationCollection = unwrap(provenance ?? current) as object;
      const registrationIdentity = keyIdentity ?? Function.prototype.toString.call(key);
      const registered = listKeyRegistrations.get(cacheId);
      if (!registered || registered.collection !== registrationCollection || registered.identity !== registrationIdentity) {
        registered?.stop();
        const stop = registerReactiveListKey(
          provenance ?? current,
          key as (item: unknown) => string,
          id ?? "an unlabelled this.map() call",
          keyIdentity
        );
        listKeyRegistrations.set(cacheId, { collection: registrationCollection, identity: registrationIdentity, stop });
      }
      const previous = listCaches.get(cacheId);
      const cache = previous?.render === render
        ? previous.cache
        : new Map<string, { item: unknown; vnode: VNode }>();
      if (!previous || previous.render !== render) listCaches.set(cacheId, { render, cache });
      return createVNode(Fragment, {
        key: id,
        list: {
          collection: current,
          source,
          key,
          render,
          cache: cache as Map<string, { item: T; vnode: VNode }>
        } satisfies ListBinding<T>
      });
    },
    onMount(handler: LifecycleHandler): void {
      instance.mountHandlers.push(handler);
    },
    onUnmount(handler: LifecycleHandler): void {
      instance.unmountHandlers.push(handler);
    },
    onRender(handler: RenderEventHandler): void {
      instance.renderHandlers.push(handler);
    },
    markMounted(): void {
      if (mounted || disposed) return;
      mounted = true;
      instance.mountController = new AbortController();
      for (const handler of instance.mountHandlers) {
        if (disposed || !mounted) break;
        try {
          const result = handler({ signal: instance.mountController.signal });
          if (isPromiseLike(result)) observeLifecyclePromise(instance, Promise.resolve(result), "mount");
        } catch (error) {
          handleComponentError(instance, createErrorReport(error, "lifecycle", instance, "mount"));
        }
      }
    },
    updateProps(nextProps): void {
      updateReactive(props, nextProps);
    },
    unmount(reason = "unmount"): void {
      if (disposed) return;
      disposed = true;
      mounted = false;
      let failed = false;
      let firstError: unknown;
      const teardown = (run: () => void) => {
        try { run(); }
        catch (error) {
          if (!failed) firstError = error;
          failed = true;
        }
      };
      if (instance.renderStop) teardown(instance.renderStop);
      teardown(() => instance.scope.stop());
      for (const registration of listKeyRegistrations.values()) teardown(registration.stop);
      listKeyRegistrations.clear();
      if (instance.mountController) teardown(() => instance.mountController!.abort(reason));
      for (const task of instance.tasks) teardown(() => task.stop());
      for (const handler of instance.unmountHandlers) {
        try {
          const result = handler({ signal: AbortSignal.abort(reason), reason });
          if (isPromiseLike(result)) observeLifecyclePromise(instance, Promise.resolve(result), "unmount");
        } catch (error) {
          teardown(() => { handleComponentError(instance, createErrorReport(error, "lifecycle", instance, "unmount")); });
        }
      }
      retainedTaskObservers.delete(instance);
      if (failed) throw firstError;
    }
  };

  // Framework fallback errors belong to one application root. A user-provided
  // ErrorContext installed during construction replaces this seed for its tree.
  if (!parent) instance.contexts.set(ErrorContext.id, reactiveValue(createErrorContext()));

  applyInternalPlugins(instance);

  let result: RenderFunction | RenderResult;
  try {
    result = withEffectScope(scope, () => type.call(instance, props as Props));
  } catch (error) {
    acceptingTaskRegistrations = false;
    cleanupFailedConstruction(instance);
    throw error;
  }
  acceptingTaskRegistrations = false;
  renderFunction = typeof result === "function" ? result as RenderFunction : () => result;

  const taskObserver = taskObserverStack[taskObserverStack.length - 1];
  taskObserver?.retain?.(instance);
  if (taskObserver?.retain) retainedTaskObservers.set(instance, taskObserver);

  return instance;
}

/** Renders a component instance inside a watcher and returns normalized child output. */
export function renderInstance(instance: ComponentInstance<any>, onInvalidate: () => void): Child[] {
  let output: RenderResult = null;
  const start = performanceNow();

  instance.invalidate = onInvalidate;
  instance.renderStop?.();
  instance.renderStop = watch(
    () => {
      try {
        instance.beginRender();
        output = (instance.errorFallback ?? instance.renderFunction)();
      } catch (error) {
        if (isPromiseLike(error) && handleComponentSuspension(instance, error)) {
          output = null;
          return;
        }
        const fallback = handleComponentError(instance, createErrorReport(error, "render", instance));
        if (!fallback) {
          output = null;
          return;
        }
        instance.errorFallback = fallback;
        output = fallback();
      } finally {
        instance.endRender();
      }
    },
    onInvalidate,
    { scope: instance.scope }
  );

  const duration = performanceNow() - start;
  for (const handler of instance.renderHandlers) {
    try {
      const result = handler({ duration });
      if (isPromiseLike(result)) observeLifecyclePromise(instance, Promise.resolve(result), "render");
    } catch (error) {
      handleComponentError(instance, createErrorReport(error, "lifecycle", instance, "render"));
    }
  }

  return normalizeRenderResult(output);
}

function observeLifecyclePromise(instance: ComponentInstance<any>, promise: PromiseLike<unknown>, phase: string): void {
  const observed = Promise.resolve(promise).catch(error => {
    handleComponentError(instance, createErrorReport(error, "lifecycle", instance, phase));
  });
  observeTaskPromise(observed, instance);
}

/** Observes asynchronous component work so renderers and test harnesses can await it and route failures. */
export function observeComponentAsync(
  instance: ComponentInstance<any> | undefined,
  value: unknown,
  source: ErrorSource,
  phase: string
): void {
  if (!isPromiseLike(value)) return;
  const observed = Promise.resolve(value).catch(error => {
    handleComponentError(instance, createErrorReport(error, source, instance, phase));
  });
  if (instance) observeTaskPromise(observed, instance);
  else void observed;
}

/** Tracks promise settlement as renderer-owned work without converting rejection into a component error. */
export function trackComponentAsync(instance: ComponentInstance<any>, value: PromiseLike<unknown>): void {
  const settlement = Promise.resolve(value).then(() => undefined, () => undefined);
  observeTaskPromise(settlement, instance);
}

/** Runs a function with a task observer that can await async component task work. */
export function withTaskObserver<T>(observer: TaskObserver | undefined, fn: () => T): T {
  if (!observer) return fn();
  taskObserverStack.push(observer);
  try {
    return fn();
  } finally {
    taskObserverStack.pop();
  }
}

/** Creates a structured error report for component or framework failures. */
export function createErrorReport(
  error: unknown,
  source: ErrorSource,
  component?: ComponentInstance<any>,
  phase?: string
): ErrorReport {
  return {
    id: `e${nextErrorId++}`,
    error,
    source,
    component: component ? componentLogScope(component).component : undefined,
    phase
  };
}

function createErrorReportFromOptions(error: unknown, options: ErrorReportOptions = {}): ErrorReport {
  return {
    id: `e${nextErrorId++}`,
    error,
    source: options.source ?? "component",
    component: options.component,
    phase: options.phase
  };
}

/** Routes a component error to the nearest error context or installs the default fallback view. */
export function handleComponentError(
  instance: ComponentInstance<any> | undefined,
  event: ErrorReport
): RenderFunction | undefined {
  let cursor = instance;
  while (cursor) {
    if (cursor.contexts.has(ErrorContext.id)) {
      const context = unwrap(cursor.contexts.get(ErrorContext.id)) as ErrorContextValue;
      if (context.boundary === instance) {
        cursor = cursor.parent;
        continue;
      }
      context.report(event);
      cursor.invalidate?.();
      return undefined;
    }
    cursor = cursor.parent;
  }

  const context = defaultContexts.get(ErrorContext.id) as ErrorContextValue;
  context.report(event);
  const fallback = () => createDefaultErrorView(context.errors);
  if (instance) {
    instance.errorFallback = fallback;
    instance.invalidate?.();
    instance.log.error("root error context handled failure", event.error, {
      source: event.source,
      phase: event.phase,
      component: event.component
    });
  } else {
    logFrameworkEvent("error", "core", event.source, "root error context handled failure", {
      phase: event.phase,
      component: event.component
    });
  }
  return fallback;
}

/** Routes a thrown promise to the nearest async rendering boundary. */
export function handleComponentSuspension(
  instance: ComponentInstance<any> | undefined,
  promise: PromiseLike<unknown>
): boolean {
  let cursor = instance;
  while (cursor) {
    if (cursor.contexts.has(SuspensionContext.id)) {
      const context = unwrap(cursor.contexts.get(SuspensionContext.id)) as SuspensionContextValue;
      context.suspend(promise);
      return true;
    }
    cursor = cursor.parent;
  }
  return false;
}

/** Normalizes any component render result into a flat child array. */
export function normalizeRenderResult(result: RenderResult): Child[] {
  return Array.isArray(result) ? normalizeChildren(result) : normalizeChildren([result]);
}

/** Emits a framework-scoped log event through the supplied or default logger. */
export function logFrameworkEvent(
  level: LogLevel,
  packageName: string,
  category: string,
  message: LazyLogValue<string>,
  data?: LazyLogValue<unknown>,
  logger: Logger = defaultConsoleLogger
): void {
  const scope: LogScope = {
    source: "framework",
    packageName,
    category
  };
  if (!isLogEnabled(logger, level, scope)) return;
  emitLogEvent(logger, {
    level,
    message: evaluateLogValue(message),
    data: data === undefined ? undefined : evaluateLogValue(data),
    scope
  });
}

function createTask(instance: ComponentInstance<any>, deps: unknown[], work: (...args: any[]) => TaskResult): TaskRegistration {
  const sources = deps.map(dep => reactiveRef(dep)).filter((source): source is ReactiveRef => !!source);
  const task: TaskRegistration = {
    deps,
    sources,
    work,
    stops: [],
    generation: 0,
    stopped: false,
    run() {
      const generation = ++task.generation;
      task.queuedGeneration = generation;
      task.stopped = false;
      const previousSignal = task.controller?.signal;
      task.controller?.abort("rerun");
      const cleanupSettlement = runTaskCleanup(task, instance);
      const resourceSettlement = drainTaskCleanupPromises(previousSignal);
      if (!task.stops.length) {
        task.stops = task.sources.map(source => subscribe(source, () => task.run(), { scope: instance.scope }));
      }
      // Compiler-rewritten awaits use taskAwait(), which actively rejects on
      // abort, so the prior generation settles even when its input promise does
      // not. Waiting here preserves generation and cleanup serialization.
      const priorSettlement = task.settlement && previousSignal
        ? settleWhenAborted(task.settlement, previousSignal)
        : task.settlement;
      const pending = [priorSettlement, cleanupSettlement, resourceSettlement]
        .filter((value): value is Promise<void> => !!value);
      if (pending.length) {
        const barrier = Promise.all(pending).then(() => undefined);
        task.settlement = barrier;
        observeTaskPromise(barrier, instance);
        void barrier.then(() => {
          if (task.settlement !== barrier) return;
          task.settlement = undefined;
          if (!task.stopped && task.queuedGeneration === generation) startTaskGeneration(task, instance, generation);
        });
        return;
      }
      startTaskGeneration(task, instance, generation);

    },
    stop() {
      task.stopped = true;
      task.queuedGeneration = undefined;
      task.generation++;
      const signal = task.controller?.signal;
      task.controller?.abort("unmount");
      const cleanupSettlement = runTaskCleanup(task, instance);
      const resourceSettlement = drainTaskCleanupPromises(signal);
      for (const promise of [task.settlement, cleanupSettlement, resourceSettlement]) {
        if (promise) observeTaskPromise(promise, instance);
      }
      for (const stop of task.stops) stop();
      task.stops = [];
    }
  };

  return task;
}

function settleWhenAborted(settlement: Promise<void>, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return Promise.race([
    settlement,
    new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), { once: true }))
  ]);
}

function startTaskGeneration(task: TaskRegistration, instance: ComponentInstance<any>, generation: number): void {
  if (task.stopped || task.queuedGeneration !== generation || task.generation !== generation) return;
  task.queuedGeneration = undefined;
  const controller = new AbortController();
  task.controller = controller;
  taskOwners.set(controller.signal, instance);
  const values = task.deps.map(dep => unwrap(dep));
  let result: TaskResult;
  try {
    result = batch(() => task.work(...values, { signal: controller.signal }));
  } catch (error) {
    handleComponentError(instance, createErrorReport(error, "task", instance, "run"));
    return;
  }

  if (isPromiseLike(result)) {
    const observed = Promise.resolve(result).then(cleanup => {
      if (typeof cleanup !== "function") return;
      if (task.generation === generation && task.controller === controller && !controller.signal.aborted) {
        task.cleanup = cleanup;
      } else {
        return Promise.resolve(cleanup()).catch(error => {
          handleComponentError(instance, createErrorReport(error, "task", instance, "stale-cleanup"));
        });
      }
    }).catch(error => {
      if (task.generation !== generation || controller.signal.aborted && isAbortError(error)) return;
      handleComponentError(instance, createErrorReport(error, "task", instance, "promise"));
    });
    const settlement = observed.then(() => undefined);
    task.settlement = settlement;
    observeTaskPromise(settlement, instance);
    void settlement.then(() => {
      if (task.settlement === settlement) task.settlement = undefined;
    });
  } else if (typeof result === "function") {
    task.cleanup = result;
  }
}

function observeTaskPromise(promise: Promise<unknown>, instance: ComponentInstance<any>): void {
  (taskObserverStack[taskObserverStack.length - 1] ?? retainedTaskObservers.get(instance))?.register(promise, instance);
}

function runTaskCleanup(task: TaskRegistration, instance: ComponentInstance<any>): Promise<void> | undefined {
  const cleanup = task.cleanup;
  task.cleanup = undefined;
  if (!cleanup) return undefined;
  try {
    const result = cleanup();
    if (!isPromiseLike(result)) return undefined;
    return Promise.resolve(result).catch(error => {
      handleComponentError(instance, createErrorReport(error, "task", instance, "cleanup"));
    });
  } catch (error) {
    handleComponentError(instance, createErrorReport(error, "task", instance, "cleanup"));
    return undefined;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
    || !!error && typeof error === "object" && (error as { name?: unknown }).name === "AbortError";
}

function createComponentReactiveValue<T>(instance: ComponentInstance<any>, value: ReactiveValue<T>): ComponentReactiveValue<T> {
  return Object.assign(value, {
    task(work: (value: T, ctx: TaskContext) => TaskResult): void {
      const task = createTask(instance, [value], work as (...args: any[]) => TaskResult);
      instance.tasks.push(task);
      task.run();
    }
  });
}

function cleanupFailedConstruction(instance: ComponentInstance<any>): void {
  instance.renderStop?.();
  instance.scope.stop();
  instance.mountController?.abort("construct-failed");
  for (const task of instance.tasks) task.stop();
}

function applyInternalPlugins(instance: ComponentInstance<any>): void {
  for (const plugin of internalPlugins) {
    plugin.augmentComponent?.(instance);
  }
}

function createNoopComponentLog(): ComponentLog {
  const noop = () => undefined;
  return {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop
  };
}

function createComponentLog(instance: ComponentInstance<any>): ComponentLog {
  return {
    trace(message, data) {
      emitComponentLog(instance, "trace", message, data);
    },
    debug(message, data) {
      emitComponentLog(instance, "debug", message, data);
    },
    info(message, data) {
      emitComponentLog(instance, "info", message, data);
    },
    warn(message, data) {
      emitComponentLog(instance, "warn", message, data);
    },
    error(message, errorOrData, data) {
      emitComponentLog(instance, "error", message, errorOrData, data);
    }
  };
}

function emitComponentLog(
  instance: ComponentInstance<any>,
  level: LogLevel,
  message: LazyLogValue<string>,
  errorOrData?: LazyLogValue<unknown>,
  data?: LazyLogValue<unknown>
): void {
  const scope = componentLogScope(instance);
  const logger = resolveLogger(instance);
  if (!isLogEnabled(logger, level, scope)) return;

  const evaluatedMessage = evaluateLogValue(message);
  let evaluatedError: unknown;
  let evaluatedData: unknown;

  if (level === "error" && data !== undefined) {
    evaluatedError = evaluateLogValue(errorOrData);
    evaluatedData = evaluateLogValue(data);
  } else if (level === "error" && errorOrData !== undefined) {
    const value = evaluateLogValue(errorOrData);
    if (isErrorLike(value)) {
      evaluatedError = value;
    } else {
      evaluatedData = value;
    }
  } else if (errorOrData !== undefined) {
    evaluatedData = evaluateLogValue(errorOrData);
  }

  emitLogEvent(logger, {
    level,
    message: evaluatedMessage,
    error: evaluatedError,
    data: evaluatedData,
    scope
  });
}

function isLogEnabled(logger: Logger, level: LogLevel, scope: LogScope): boolean {
  try {
    return !logger.isEnabled || logger.isEnabled(level, scope);
  } catch (error) {
    reportLoggerFailure(error);
    return false;
  }
}

function emitLogEvent(logger: Logger, event: LogEvent): void {
  try {
    logger.log(event);
  } catch (error) {
    reportLoggerFailure(error);
  }
}

function reportLoggerFailure(error: unknown): void {
  try {
    defaultConsoleLogger.log({
      level: "error",
      message: "logger failed while handling eXact log event",
      error,
      scope: {
        source: "framework",
        packageName: "core",
        category: "logger"
      }
    });
  } catch {
    // Logging failures must not become application failures.
  }
}

function resolveLogger(instance: ComponentInstance<any>): Logger {
  let cursor: ComponentInstance<any> | undefined = instance.parent;
  while (cursor) {
    if (cursor.contexts.has(LoggerContext.id)) {
      return unwrap(cursor.contexts.get(LoggerContext.id)) as Logger;
    }
    cursor = cursor.parent;
  }

  return defaultContexts.get(LoggerContext.id) as Logger;
}

function componentLogScope(instance: ComponentInstance<any>): LogScope {
  return {
    source: "component",
    component: {
      id: instance.id,
      name: instance.type.name || "anonymous",
      mounted: instance.mounted
    }
  };
}

function evaluateLogValue<T>(value: LazyLogValue<T>): T {
  return typeof value === "function" ? (value as () => T)() : value;
}

function isErrorLike(value: unknown): boolean {
  return value instanceof Error;
}

function isErrorReport(value: unknown): value is ErrorReport {
  return !!value
    && typeof value === "object"
    && "id" in value
    && "error" in value
    && "source" in value;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
}

function reactiveValue<T>(value: T): Reactive<T> {
  if (reactiveRef(value)) {
    return value as Reactive<T>;
  }

  if (value && typeof value === "object") {
    return reactive(value as object) as Reactive<T>;
  }

  return value as Reactive<T>;
}

function performanceNow(): number {
  return typeof globalThis.performance?.now === "function" ? globalThis.performance.now() : Date.now();
}

function isTemplateStringsArray(value: unknown): value is TemplateStringsArray {
  return Array.isArray(value) && Array.isArray((value as { raw?: unknown }).raw);
}
