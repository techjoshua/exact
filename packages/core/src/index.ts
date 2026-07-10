import {
  computed,
  reactive,
  ref as reactiveRef,
  subscribe,
  updateReactive,
  unwrap,
  watch,
  type Reactive,
  type ReactiveValue,
  type ReactiveRef,
  type StopHandle
} from "@exact/reactive";

export type { Reactive, ReactiveValue, StopHandle } from "@exact/reactive";
export { computed, unwrap, watch } from "@exact/reactive";

export const Fragment = Symbol.for("exact.fragment");
export const Text = Symbol.for("exact.text");
export const Cell = Symbol.for("exact.cell");
export const Dynamic = Symbol.for("exact.dynamic");
export const ServerBoundary = Symbol.for("exact.server-boundary");

export type VNodeType = string | typeof Fragment | typeof Text | typeof Cell | typeof Dynamic | typeof ServerBoundary | ComponentFunction<any, any>;

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
};

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

export type LogScope = {
  source: "component" | "framework";
  packageName?: string;
  category?: string;
  component?: {
    id: string;
    name: string;
    mounted: boolean;
  };
};

export type LogEvent = {
  level: LogLevel;
  message: string;
  data?: unknown;
  error?: unknown;
  scope: LogScope;
};

export type Logger = {
  isEnabled?(level: LogLevel, scope: LogScope): boolean;
  log(event: LogEvent): void;
};

type LazyLogValue<T> = T | (() => T);

export type ComponentLog = {
  trace(message: LazyLogValue<string>, data?: LazyLogValue<unknown>): void;
  debug(message: LazyLogValue<string>, data?: LazyLogValue<unknown>): void;
  info(message: LazyLogValue<string>, data?: LazyLogValue<unknown>): void;
  warn(message: LazyLogValue<string>, data?: LazyLogValue<unknown>): void;
  error(message: LazyLogValue<string>, error?: LazyLogValue<unknown>, data?: LazyLogValue<unknown>): void;
};

export type ConsoleLoggerOptions = {
  level?: LogLevel;
};

const logLevelOrder: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4
};

export function createConsoleLogger(options: ConsoleLoggerOptions = {}): Logger {
  const minimumLevel = options.level ?? "info";

  return {
    isEnabled(level) {
      return logLevelOrder[level] >= logLevelOrder[minimumLevel];
    },
    log(event) {
      const prefix = `${formatLogScope(event.scope)} ${event.message}`;
      const consoleMethod = getConsoleMethod(event.level);
      if (event.error !== undefined && event.data !== undefined) {
        consoleMethod(prefix, event.error, event.data);
      } else if (event.error !== undefined) {
        consoleMethod(prefix, event.error);
      } else if (event.data !== undefined) {
        consoleMethod(prefix, event.data);
      } else {
        consoleMethod(prefix);
      }
    }
  };
}

export const LoggerContext = createContext<Logger>("logger");
export const ErrorContext = createContext<ErrorContextValue>("error");

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
  reactive<T>(value: T): ComponentReactiveValue<T>;
  reactive(strings: TemplateStringsArray, ...values: unknown[]): ComponentReactiveValue<string>;
  reactive<T>(compute: () => T): ComponentReactiveValue<T>;
  task: ComponentTask;
  ref<T>(key: RefKey<T>): RefBinding<T>;
  refs: RefRegistry;
  map<T>(
    collection: Iterable<T>,
    key: (item: T) => string,
    render: (item: T) => VNode,
    id?: string
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

export function createVNode(type: VNodeType, props: Record<string, unknown> | null, ...children: unknown[]): VNode {
  const normalizedProps = { ...(props ?? {}) };
  const rawKey = unwrap(normalizedProps.key);
  const key = rawKey === null || rawKey === undefined ? undefined : String(rawKey);
  delete normalizedProps.key;

  return {
    type,
    props: normalizedProps,
    children: normalizeChildren(children),
    key
  };
}

export function createTextVNode(value: unknown): VNode {
  return {
    type: Text,
    props: { value },
    children: []
  };
}

export function createCellVNode(vnode: VNode): VNode<{ cell: VNodeCell }> {
  return {
    type: Cell,
    props: {
      cell: {
        id: Symbol("exact.cell"),
        vnode
      }
    },
    children: [],
    key: vnode.key
  };
}

export function createCompiledVNode(type: VNodeType, props: Record<string, unknown> | null, ...children: unknown[]): VNode {
  return createCellVNode(createVNode(type, props, ...children));
}

export function createCompiledFragment(props: Record<string, unknown> | null, ...children: unknown[]): VNode {
  return createCompiledVNode(Fragment, props, ...children);
}

export function createExpression<T>(compute: () => T): ReactiveValue<T> {
  return computed(compute);
}

export function createDynamicChild(compute: () => RenderResult): VNode {
  return createVNode(Dynamic, {
    value: computed(compute)
  });
}

export function createServerBoundary(id: string, name: string, props: Record<string, unknown> = {}): VNode {
  return createVNode(ServerBoundary, {
    id,
    name,
    props
  });
}

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

export function normalizeChildren(children: unknown[]): Child[] {
  const normalized: Child[] = [];

  for (const child of children) {
    if (Array.isArray(child)) {
      normalized.push(...normalizeChildren(child));
    } else {
      normalized.push(child as Child);
    }
  }

  return normalized;
}

export function createContext<T>(description: string): ContextToken<T> {
  return { id: Symbol(description), description };
}

export function createRef<T>(description: string): RefKey<T> {
  return { id: Symbol(description), description };
}

export function isVNode(value: unknown): value is VNode {
  return !!value && typeof value === "object" && "type" in value && "props" in value && "children" in value;
}

export function isCellVNode(value: unknown): value is VNode<{ cell: VNodeCell }> {
  return isVNode(value) && value.type === Cell;
}

export function getCellVNode(vnode: VNode<{ cell: VNodeCell }>): VNode {
  return vnode.props.cell.vnode;
}

export function createComponentInstance<State extends object, Props extends Record<string, unknown>>(
  type: ComponentFunction<State, Props>,
  rawProps: Props,
  parent?: ComponentInstance<any>
): ComponentInstance<State> {
  const refs = new Map<symbol, unknown>();
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
    get renderFunction() {
      return renderFunction;
    },
    refs: {
      get<T>(key: RefKey<T>) {
        return refs.get(key.id) as T | undefined;
      }
    },
    getContext<T>(token: ContextToken<T>): Reactive<T> {
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
    map<T>(collection: Iterable<T>, key: (item: T) => string, render: (item: T) => VNode, id?: string): VNode {
      return createVNode(Fragment, {
        key: id,
        list: {
          collection,
          source: reactiveRef(collection) as ReactiveRef<Iterable<T>> | undefined,
          key,
          render
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

export function renderInstance(instance: ComponentInstance<any>, onInvalidate: () => void): Child[] {
  let output: RenderResult = null;
  const start = performanceNow();

  instance.invalidate = onInvalidate;
  instance.renderStop?.();
  instance.renderStop = watch(
    () => {
      try {
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

export function withTaskObserver<T>(observer: TaskObserver | undefined, fn: () => T): T {
  if (!observer) return fn();
  taskObserverStack.push(observer);
  try {
    return fn();
  } finally {
    taskObserverStack.pop();
  }
}

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

export function normalizeRenderResult(result: RenderResult): Child[] {
  return Array.isArray(result) ? normalizeChildren(result) : normalizeChildren([result]);
}

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
  if (logger.isEnabled && !logger.isEnabled(level, scope)) return;
  logger.log({
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
    run() {
      task.controller?.abort("rerun");
      void task.cleanup?.();
      task.controller = new AbortController();
      const values = task.deps.map(dep => unwrap(dep));
      let result: TaskResult;
      try {
        result = task.work(...values, { signal: task.controller.signal });
      } catch (error) {
        handleComponentError(instance, createErrorReport(error, "task", instance, "run"));
        return;
      }

      if (result instanceof Promise) {
        const observed = result.then(cleanup => {
          if (typeof cleanup === "function") task.cleanup = cleanup;
        }).catch(error => {
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
      task.controller?.abort("unmount");
      try {
        void task.cleanup?.();
      } catch (error) {
        handleComponentError(instance, createErrorReport(error, "task", instance, "cleanup"));
      }
      for (const stop of task.stops) stop();
      task.stops = [];
    }
  };

  return task;
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
  if (logger.isEnabled && !logger.isEnabled(level, scope)) return;

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

  logger.log({
    level,
    message: evaluatedMessage,
    error: evaluatedError,
    data: evaluatedData,
    scope
  });
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

function formatLogScope(scope: LogScope): string {
  if (scope.source === "component" && scope.component) {
    return `[exact] [component:${scope.component.name}#${scope.component.id}]`;
  }

  const frameworkName = [
    "framework",
    scope.packageName,
    scope.category
  ].filter(Boolean).join(":");
  return `[exact] [${frameworkName}]`;
}

function getConsoleMethod(level: LogLevel): (...args: unknown[]) => void {
  if (level === "trace") return console.trace?.bind(console) ?? console.debug.bind(console);
  if (level === "debug") return console.debug.bind(console);
  if (level === "info") return console.info.bind(console);
  if (level === "warn") return console.warn.bind(console);
  return console.error.bind(console);
}
