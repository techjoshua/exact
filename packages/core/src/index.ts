import {
  batch,
  computed,
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
  type Reactive,
  type ReactiveValue,
  type ReactiveRef,
  type StopHandle
} from "@exact/reactive";
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
import { Cell, Dynamic, Fragment, ServerBoundary, ServerSlot, Text } from "./symbols.js";
import {
  createCellVNode,
  createCompiledFragment,
  createCompiledVNode,
  createDynamicChild,
  createExpression,
  createServerBoundary,
  createServerSlot,
  createTextVNode,
  createVNode,
  getCellVNode,
  isCellVNode,
  isVNode,
  normalizeChildren
} from "./vnode.js";

export type { Reactive, ReactiveValue, StopHandle } from "@exact/reactive";
export { batch, computed, peek, unwrap, watch } from "@exact/reactive";
// Compiler-only helpers. They remain available here because generated JSX
// already imports all framework helpers from @exact/core.
export { writeReactive, writeReactiveLazy, updateReactiveValue, updateReactiveValueWithResult, deleteReactiveValue, mutateReactiveArray } from "@exact/reactive";
export { createContext, createRef } from "./keys.js";
export {
  createConsoleLogger,
  type ComponentLog,
  type ConsoleLoggerOptions,
  type Logger,
  type LogEvent,
  type LogLevel,
  type LogScope
} from "./logging.js";
export { Cell, Dynamic, Fragment, ServerBoundary, ServerSlot, Text } from "./symbols.js";
export {
  createCellVNode,
  createCompiledFragment,
  createCompiledVNode,
  createDynamicChild,
  createExpression,
  createServerBoundary,
  createServerSlot,
  createTextVNode,
  createVNode,
  getCellVNode,
  isCellVNode,
  isVNode,
  normalizeChildren
} from "./vnode.js";

export type VNodeType = string | typeof Fragment | typeof Text | typeof Cell | typeof Dynamic | typeof ServerBoundary | typeof ServerSlot | ComponentFunction<any, any>;

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
  report(error: unknown, options?: ErrorReportOptions): ErrorReport;
  clear(error: ErrorReport | string): void;
  clearAll(): void;
};

export type ContextToken<T> = {
  readonly id: symbol;
  readonly description: string;
  readonly global: boolean;
};

export const LoggerContext = createContext<Logger>("exact.logger", true);
export const ErrorContext = createContext<ErrorContextValue>("exact.error", true);

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

/** Compiler helpers for resources whose lifetime is owned by a task generation. */
export function taskTimeout(signal: AbortSignal, handler: (...args: any[]) => void, delay?: number, ...args: any[]): ReturnType<typeof setTimeout> {
  let timeout: ReturnType<typeof setTimeout>;
  const abort = () => clearTimeout(timeout);
  timeout = setTimeout((...values: any[]) => {
    signal.removeEventListener("abort", abort);
    handler(...values);
  }, delay, ...args);
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
  return timeout;
}

export function taskInterval(signal: AbortSignal, handler: (...args: any[]) => void, delay?: number, ...args: any[]): ReturnType<typeof setInterval> {
  const interval = setInterval(handler, delay, ...args);
  if (signal.aborted) clearInterval(interval);
  else signal.addEventListener("abort", () => clearInterval(interval), { once: true });
  return interval;
}

export function taskAnimationFrame(signal: AbortSignal, handler: (time: number) => void): number {
  const platform = globalThis as typeof globalThis & {
    requestAnimationFrame(callback: (time: number) => void): number;
    cancelAnimationFrame(id: number): void;
  };
  const frame = platform.requestAnimationFrame(handler);
  if (signal.aborted) platform.cancelAnimationFrame(frame);
  else signal.addEventListener("abort", () => platform.cancelAnimationFrame(frame), { once: true });
  return frame;
}

export function taskObserver<T extends { disconnect(): void }>(signal: AbortSignal, observer: T): T {
  if (signal.aborted) observer.disconnect();
  else signal.addEventListener("abort", () => observer.disconnect(), { once: true });
  return observer;
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
  return Promise.resolve(value).then(result => {
    if (signal.aborted) throw createAbortError(signal.reason);
    return result;
  });
}

function createAbortError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  const error = new Error(reason === undefined ? "Task aborted" : String(reason));
  error.name = "AbortError";
  return error;
}

export type TaskObserver = {
  register(promise: Promise<unknown>, instance: ComponentInstance<any>): void;
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

export type LifecycleHandler = (ctx: { signal: AbortSignal; reason?: string }) => void;
export type RenderEventHandler = (event: { duration: number; dependencies?: unknown[] }) => void;

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
    collection: ComponentReactiveValue<Collection>,
    key: (item: IterableItem<Collection>) => string,
    render: (item: IterableItem<Collection>) => VNode,
    id?: string,
    provenance?: Iterable<IterableItem<Collection>>
  ): VNode;
  map<T>(
    collection: Iterable<T>,
    key: (item: T) => string,
    render: (item: T) => VNode,
    id?: string,
    provenance?: Iterable<T>
  ): VNode;
  onMount(handler: LifecycleHandler): void;
  onUnmount(handler: LifecycleHandler): void;
  onRender?(handler: RenderEventHandler): void;
}

export type ComponentInstance<State extends object> = Component<State> & {
  readonly type: ComponentFunction<State, any>;
  readonly parent?: ComponentInstance<any>;
  readonly props: Reactive<Record<string, unknown>>;
  readonly contexts: Map<symbol, unknown>;
  readonly id: string;
  readonly mounted: boolean;
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
  parent?: ComponentInstance<any>
): ComponentInstance<State> {
  const refs = new Map<symbol, unknown>();
  const listCaches = new Map<string, { render: unknown; cache: Map<string, { item: unknown; vnode: VNode }> }>();
  let mapCallIndex = 0;
  const state = reactive({} as State);
  const props = reactive(rawProps, {
    readonly: true,
    passthroughKeys: ["children"],
    onReadonlyWrite(key) {
      throw new TypeError(`Cannot write to readonly props.${String(key)}`);
    }
  }) as Reactive<Record<string, unknown>>;

  let mounted = false;
  let renderFunction: RenderFunction = () => null;
  const id = `c${nextComponentId++}`;

  const instance: ComponentInstance<State> = {
    type,
    parent,
    id,
    state,
    log: createNoopComponentLog(),
    props,
    contexts: new Map(),
    tasks: [],
    mountHandlers: [],
    unmountHandlers: [],
    renderHandlers: [],
    get mounted() {
      return mounted;
    },
    beginRender(): void {
      mapCallIndex = 0;
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

      if (defaultContexts.has(token.id)) {
        return reactiveValue(defaultContexts.get(token.id) as T);
      }

      throw new Error(`Context "${token.description}" was not provided`);
    },
    setContext<T>(token: ContextToken<T>, value: T): void {
      instance.contexts.set(token.id, reactiveValue(value));
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
    map<T>(collection: Iterable<T> | ComponentReactiveValue<Iterable<T>>, key: (item: T) => string, render: (item: T) => VNode, id?: string, provenance?: Iterable<T>): VNode {
      const source = peek(() => reactiveRef(collection)) as ReactiveRef<Iterable<T>> | undefined;
      const current = isReactiveValue(collection) && source
        ? peek(() => source.get())
        : collection as Iterable<T>;
      registerReactiveListKey(provenance ?? current, key as (item: unknown) => string);
      // A render pass gives every map call a stable slot. Reuse only when the
      // renderer itself is stable; inline render callbacks are recreated on a
      // parent render and may capture a different parent value.
      const cacheId = id ?? `map:${mapCallIndex++}`;
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
      if (mounted) return;
      mounted = true;
      instance.mountController = new AbortController();
      for (const handler of instance.mountHandlers) {
        try {
          handler({ signal: instance.mountController.signal });
        } catch (error) {
          handleComponentError(instance, createErrorReport(error, "lifecycle", instance, "mount"));
        }
      }
    },
    updateProps(nextProps): void {
      updateReactive(props, nextProps);
    },
    unmount(reason = "unmount"): void {
      if (!mounted) return;
      mounted = false;
      instance.renderStop?.();
      instance.mountController?.abort(reason);
      for (const task of instance.tasks) task.stop();
      for (const handler of instance.unmountHandlers) {
        try {
          handler({ signal: AbortSignal.abort(reason), reason });
        } catch (error) {
          handleComponentError(instance, createErrorReport(error, "lifecycle", instance, "unmount"));
        }
      }
    }
  };

  applyInternalPlugins(instance);

  let result: RenderFunction | RenderResult;
  try {
    result = type.call(instance, props as Props);
  } catch (error) {
    cleanupFailedConstruction(instance);
    throw error;
  }
  renderFunction = typeof result === "function" ? result as RenderFunction : () => result;

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
        const fallback = handleComponentError(instance, createErrorReport(error, "render", instance));
        if (!fallback) {
          output = null;
          return;
        }
        instance.errorFallback = fallback;
        output = fallback();
      }
    },
    onInvalidate
  );

  const duration = performanceNow() - start;
  for (const handler of instance.renderHandlers) {
    handler({ duration });
  }

  return normalizeRenderResult(output);
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
    run() {
      // A task rerun invalidates its previous abort signal and cleanup before starting
      // fresh work, so async callbacks can reliably observe cancellation.
      const generation = ++task.generation;
      task.controller?.abort("rerun");
      runTaskCleanup(task, instance);
      const controller = new AbortController();
      task.controller = controller;
      const values = task.deps.map(dep => unwrap(dep));
      let result: TaskResult;
      try {
        result = batch(() => task.work(...values, { signal: controller.signal }));
      } catch (error) {
        handleComponentError(instance, createErrorReport(error, "task", instance, "run"));
        return;
      }

      if (result instanceof Promise) {
        const observed = result.then(cleanup => {
          if (typeof cleanup !== "function") return;
          if (task.generation === generation && task.controller === controller && !controller.signal.aborted) {
            task.cleanup = cleanup;
          } else {
            void Promise.resolve(cleanup()).catch(error => {
              handleComponentError(instance, createErrorReport(error, "task", instance, "stale-cleanup"));
            });
          }
        }).catch(error => {
          if (task.generation !== generation || controller.signal.aborted && isAbortError(error)) return;
          handleComponentError(instance, createErrorReport(error, "task", instance, "promise"));
        });
        taskObserverStack[taskObserverStack.length - 1]?.register(observed, instance);
      } else if (typeof result === "function") {
        task.cleanup = result;
      }

      if (!task.stops.length) {
        task.stops = task.sources.map(source => subscribe(source, () => task.run()));
      }
    },
    stop() {
      task.generation++;
      task.controller?.abort("unmount");
      runTaskCleanup(task, instance);
      for (const stop of task.stops) stop();
      task.stops = [];
    }
  };

  return task;
}

function runTaskCleanup(task: TaskRegistration, instance: ComponentInstance<any>): void {
  const cleanup = task.cleanup;
  task.cleanup = undefined;
  if (!cleanup) return;
  try {
    void Promise.resolve(cleanup()).catch(error => {
      handleComponentError(instance, createErrorReport(error, "task", instance, "cleanup"));
    });
  } catch (error) {
    handleComponentError(instance, createErrorReport(error, "task", instance, "cleanup"));
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
