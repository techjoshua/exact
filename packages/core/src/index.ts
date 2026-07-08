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

export type VNodeType = string | typeof Fragment | typeof Text | typeof Cell | typeof Dynamic | ComponentFunction<any, any>;

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

export type ContextToken<T> = {
  readonly id: symbol;
  readonly description: string;
};

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

export type Cleanup = void | (() => void | Promise<void>);
export type TaskResult = Cleanup | Promise<Cleanup>;
export type Unwrapped<Deps extends readonly unknown[]> = {
  [K in keyof Deps]: Deps[K] extends ReactiveValue<infer T> ? T : Deps[K] extends Reactive<infer T> ? T : Deps[K];
};

export type LifecycleHandler = (ctx: { signal: AbortSignal; reason?: string }) => void;
export type RenderEventHandler = (event: { duration: number; dependencies?: unknown[] }) => void;

export interface Component<State extends object> {
  state: Reactive<State>;
  getContext<T>(token: ContextToken<T>): Reactive<T>;
  setContext<T>(token: ContextToken<T>, value: T): void;
  reactive(strings: TemplateStringsArray, ...values: unknown[]): ReactiveValue<string>;
  reactive<T>(compute: () => T): ReactiveValue<T>;
  task(work: (ctx: TaskContext) => TaskResult): void;
  task<Deps extends readonly unknown[]>(
    ...args: [...deps: Deps, work: (...args: [...Unwrapped<Deps>, TaskContext]) => TaskResult]
  ): void;
  ref<T>(key: RefKey<T>): RefBinding<T>;
  refs: RefRegistry;
  map<T>(
    collection: Iterable<T>,
    key: (item: T) => string,
    render: (item: T) => VNode
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
  readonly mounted: boolean;
  readonly renderFunction: RenderFunction;
  renderStop?: StopHandle;
  mountController?: AbortController;
  tasks: TaskRegistration[];
  mountHandlers: LifecycleHandler[];
  unmountHandlers: LifecycleHandler[];
  renderHandlers: RenderEventHandler[];
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

  const instance: ComponentInstance<State> = {
    type,
    parent,
    state,
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

      throw new Error(`Context "${token.description}" was not provided`);
    },
    setContext<T>(token: ContextToken<T>, value: T): void {
      instance.contexts.set(token.id, reactiveValue(value));
    },
    reactive<T>(input: TemplateStringsArray | (() => T), ...values: unknown[]): ReactiveValue<string> | ReactiveValue<T> {
      if (typeof input === "function") {
        return computed(input);
      }

      return computed(() => {
        let result = "";
        for (let index = 0; index < input.length; index++) {
          result += input[index];
          if (index < values.length) result += String(unwrap(values[index]) ?? "");
        }
        return result;
      });
    },
    task(...args: unknown[]): void {
      const work = args[args.length - 1];
      if (typeof work !== "function") {
        throw new TypeError("this.task() requires a work callback");
      }

      const deps = args.slice(0, -1);
      const task = createTask(deps, work as (...args: any[]) => TaskResult);
      instance.tasks.push(task);
      task.run();
    },
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
    map<T>(collection: Iterable<T>, key: (item: T) => string, render: (item: T) => VNode): VNode {
      return createVNode(Fragment, {
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
        handler({ signal: instance.mountController.signal });
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
        handler({ signal: AbortSignal.abort(reason), reason });
      }
    }
  };

  const result = type.call(instance, props as Props);
  renderFunction = typeof result === "function" ? result as RenderFunction : () => result;

  return instance;
}

export function renderInstance(instance: ComponentInstance<any>, onInvalidate: () => void): Child[] {
  let output: RenderResult = null;
  const start = performanceNow();

  instance.renderStop?.();
  instance.renderStop = watch(
    () => {
      output = instance.renderFunction();
    },
    onInvalidate
  );

  const duration = performanceNow() - start;
  for (const handler of instance.renderHandlers) {
    handler({ duration });
  }

  return normalizeRenderResult(output);
}

export function normalizeRenderResult(result: RenderResult): Child[] {
  return Array.isArray(result) ? normalizeChildren(result) : normalizeChildren([result]);
}

function createTask(deps: unknown[], work: (...args: any[]) => TaskResult): TaskRegistration {
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
      const result = task.work(...values, { signal: task.controller.signal });

      if (result instanceof Promise) {
        void result.then(cleanup => {
          if (typeof cleanup === "function") task.cleanup = cleanup;
        });
      } else if (typeof result === "function") {
        task.cleanup = result;
      }

      if (!task.stops.length) {
        task.stops = task.sources.map(source => subscribe(source, () => task.run()));
      }
    },
    stop() {
      task.controller?.abort("unmount");
      void task.cleanup?.();
      for (const stop of task.stops) stop();
      task.stops = [];
    }
  };

  return task;
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
