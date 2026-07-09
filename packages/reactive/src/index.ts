export type Reactive<T> = T;

export type ReactiveRef<T = unknown> = {
  readonly target: object;
  readonly key: PropertyKey;
  get(): T;
  set(value: T): void;
};

export type ReactiveValue<T = unknown> = {
  get(): T;
  toJSON(): T;
  toString(): string;
  valueOf(): T;
  [Symbol.toPrimitive](): T;
};

type Reaction = {
  active: boolean;
  deps: Set<Dep>;
  run(): void;
  schedule(): void;
  stop(): void;
};

type Dep = Set<Reaction>;

const proxyMarker = Symbol.for("exact.reactive.proxy");
const reactiveValueMarker = Symbol.for("exact.reactive.value");
const rawTarget = Symbol.for("exact.reactive.raw");
const reactiveValueRef = Symbol.for("exact.reactive.valueRef");
const iterateKey = Symbol.for("exact.reactive.iterate");

const proxyCache = new WeakMap<object, object>();
const readonlyProxyCache = new WeakMap<object, object>();
const objectRefs = new WeakMap<object, ReactiveRef>();
const rawObjectRefs = new WeakMap<object, ReactiveRef>();
const deps = new WeakMap<object, Map<PropertyKey, Dep>>();
const reactionStack: Reaction[] = [];
const queuedReactions = new Set<Reaction>();
const queuedComputations = new Set<() => void>();
const mutatingArrayMethods = new Set<PropertyKey>(["copyWithin", "fill", "pop", "push", "reverse", "shift", "sort", "splice", "unshift"]);
let flushScheduled = false;

export type ReactiveOptions = {
  readonly?: boolean;
  passthroughKeys?: readonly PropertyKey[];
  onReadonlyWrite?(key: PropertyKey): void;
};

export type StopHandle = () => void;

export function reactive<T extends object>(value: T, options: ReactiveOptions = {}): Reactive<T> {
  return createReactive(value, options) as Reactive<T>;
}

export function computed<T>(compute: () => T): ReactiveValue<T> {
  const target = {};
  const key = "value";
  let initialized = false;
  let current: T;
  let stop: StopHandle | undefined;
  let queued = false;

  const source: ReactiveRef<T> = {
    target,
    key,
    get() {
      if (queued) recomputeAndNotify();
      else ensure();
      track(target, key);
      return current;
    },
    set() {
      throw new TypeError("Cannot write to readonly reactive value");
    }
  };

  function ensure(): void {
    if (stop) return;

    stop = watch(
      () => {
        const computedValue = compute();
        ref(computedValue)?.get();
        const next = unwrap(computedValue) as T;
        if (!initialized) {
          current = next;
          initialized = true;
          return;
        }

        current = next;
      },
      queueRecompute
    );
  }

  function queueRecompute(): void {
    if (queued) return;
    queued = true;
    queuedComputations.add(recomputeAndNotify);
    scheduleFlush();
  }

  function recomputeAndNotify(): void {
    queued = false;
    queuedComputations.delete(recomputeAndNotify);
    stop?.();
    stop = undefined;
    const previous = initialized ? current : undefined;
    const hadValue = initialized;
    ensure();
    if (!hadValue || hasChanged(previous, current)) {
      trigger(target, key);
    }
  }

  return {
    [reactiveValueMarker]: true,
    [reactiveValueRef]: source,
    get: () => source.get(),
    toJSON: () => source.get(),
    toString: () => String(source.get()),
    valueOf: () => source.get(),
    [Symbol.toPrimitive]: () => source.get()
  } as ReactiveValue<T>;
}

export function watch(fn: () => void, scheduler?: () => void): StopHandle {
  const reaction: Reaction = {
    active: true,
    deps: new Set(),
    run() {
      if (!reaction.active) return;
      cleanupReaction(reaction);
      reactionStack.push(reaction);
      try {
        fn();
      } finally {
        reactionStack.pop();
      }
    },
    schedule() {
      if (!reaction.active) return;
      if (scheduler) {
        scheduler();
        return;
      }

      queuedReactions.add(reaction);
      scheduleFlush();
    },
    stop() {
      reaction.active = false;
      cleanupReaction(reaction);
    }
  };

  reaction.run();
  return reaction.stop;
}

export function subscribe<T>(source: ReactiveRef<T>, callback: () => void): StopHandle {
  const dep = getDep(source.target, source.key);
  const reaction: Reaction = {
    active: true,
    deps: new Set([dep]),
    run: callback,
    schedule: callback,
    stop() {
      reaction.active = false;
      dep.delete(reaction);
      reaction.deps.clear();
    }
  };

  dep.add(reaction);
  return reaction.stop;
}

export function peek<T>(fn: () => T): T {
  const previous = reactionStack.pop();
  try {
    return fn();
  } finally {
    if (previous) reactionStack.push(previous);
  }
}

export function unwrap<T>(value: T): T {
  if (isReactiveValue(value)) {
    return value.get() as T;
  }

  if (isReactive(value)) {
    return (value as { [rawTarget]: T })[rawTarget];
  }

  return value;
}

export function ref<T>(value: ReactiveValue<T>): ReactiveRef<T>;
export function ref<T>(value: T): ReactiveRef<T> | undefined;
export function ref<T>(value: T): ReactiveRef<T> | undefined {
  if (isReactiveValue(value)) {
    value.get();
    return value[reactiveValueRef] as ReactiveRef<T>;
  }

  if (value && typeof value === "object") {
    return objectRefs.get(value as object) as ReactiveRef<T> | undefined;
  }

  return undefined;
}

export function isReactive(value: unknown): boolean {
  return !!value && typeof value === "object" && Boolean((value as { [proxyMarker]?: boolean })[proxyMarker]);
}

export function snapshot<T>(value: T): T {
  const plain = unwrap(value);

  if (!plain || typeof plain !== "object") {
    return plain;
  }

  if (Array.isArray(plain)) {
    return plain.map(item => snapshot(item)) as T;
  }

  const result: Record<PropertyKey, unknown> = {};
  for (const key of Reflect.ownKeys(plain)) {
    result[key] = snapshot((plain as Record<PropertyKey, unknown>)[key]);
  }

  return result as T;
}

export function flushSync(): void {
  while (queuedComputations.size || queuedReactions.size) {
    while (queuedComputations.size) {
      const computations = [...queuedComputations];
      queuedComputations.clear();
      for (const computation of computations) {
        computation();
      }
    }

    const reactions = [...queuedReactions];
    queuedReactions.clear();
    flushScheduled = false;

    for (const reaction of reactions) {
      if (reaction.active) reaction.run();
    }
  }

  flushScheduled = false;
}

export function updateReactive<T extends object>(target: Reactive<T>, next: Partial<T>): void {
  const raw = isReactive(target) ? (target as { [rawTarget]: T })[rawTarget] : target;
  const nextRecord = next as Record<PropertyKey, unknown>;

  for (const key of Reflect.ownKeys(raw)) {
    if (!(key in nextRecord)) {
      const hadKey = Reflect.has(raw, key);
      if (hadKey) {
        Reflect.deleteProperty(raw, key);
        trigger(raw, key);
        trigger(raw, iterateKey);
      }
    }
  }

  for (const key of Reflect.ownKeys(next)) {
    const previous = Reflect.get(raw, key);
    const value = Reflect.get(next, key);
    const hadKey = Reflect.has(raw, key);
    if (canUpdateNestedReactive(previous, value)) {
      updateReactive(previous as object, unwrap(value) as Partial<object>);
      continue;
    }
    if (!reactiveValueChanged(previous, value) && !hasChanged(previous, value)) continue;
    Reflect.set(raw, key, value);
    trigger(raw, key);
    if (!hadKey || isArrayStructureKey(raw, key)) trigger(raw, iterateKey);
  }
}

function canUpdateNestedReactive(previous: unknown, next: unknown): boolean {
  const unwrappedPrevious = unwrap(previous);
  const unwrappedNext = unwrap(next);
  if (Object.is(unwrappedPrevious, unwrappedNext)) return false;
  return (isReactive(previous) || (!!unwrappedPrevious && typeof unwrappedPrevious === "object" && rawObjectRefs.has(unwrappedPrevious)))
    && isPlainObject(unwrappedPrevious)
    && isPlainObject(unwrappedNext);
}

function createReactive(value: object, options: ReactiveOptions): object {
  const cache = options.readonly ? readonlyProxyCache : proxyCache;
  const cached = cache.get(value);
  if (cached) return cached;

  const proxy = new Proxy(value, {
    get(target, key, receiver) {
      if (key === proxyMarker) return true;
      if (key === rawTarget) return target;

      objectRefs.get(receiver as object)?.get();
      const current = Reflect.get(target, key, receiver);
      if (Array.isArray(target) && mutatingArrayMethods.has(key) && typeof current === "function") {
        return (...args: unknown[]) => mutateArray(target, current, args, receiver);
      }
      if (options.passthroughKeys?.includes(key)) {
        track(target, key);
        return current;
      }

      if (isReactiveValue(current)) {
        track(target, key);
        return current.get();
      }

      if (current && typeof current === "object") {
        const proxy = createReactive(current, options);
        const source = {
          target,
          key,
          get() {
            track(target, key);
            const next = Reflect.get(target, key);
            if (isReactiveValue(next)) return next.get();
            return next && typeof next === "object" ? createReactive(next, options) : next;
          },
          set(value: unknown) {
            const previous = Reflect.get(target, key);
            const unwrapped = unwrap(value);
            if (!hasChanged(previous, unwrapped)) return;
            Reflect.set(target, key, unwrapped);
            trigger(target, key);
            if (isArrayStructureKey(target, key)) trigger(target, iterateKey);
          }
        };
        objectRefs.set(proxy, source);
        rawObjectRefs.set(current, source);
        return proxy;
      }

      track(target, key);
      return current;
    },
    set(target, key, next, receiver) {
      if (options.readonly) {
        options.onReadonlyWrite?.(key);
        return false;
      }

      const previous = Reflect.get(target, key, receiver);
      const unwrapped = unwrap(next);
      const hadKey = Reflect.has(target, key);
      const changed = hasChanged(previous, unwrapped);
      const ok = Reflect.set(target, key, unwrapped, receiver);
      if (ok && changed) {
        trigger(target, key);
        if (!hadKey || isArrayStructureKey(target, key)) trigger(target, iterateKey);
      }
      return ok;
    },
    deleteProperty(target, key) {
      if (options.readonly) {
        options.onReadonlyWrite?.(key);
        return false;
      }

      const hadKey = Reflect.has(target, key);
      const ok = Reflect.deleteProperty(target, key);
      if (ok && hadKey) {
        trigger(target, key);
        trigger(target, iterateKey);
      }
      return ok;
    },
    ownKeys(target) {
      rawObjectRefs.get(target)?.get();
      track(target, iterateKey);
      return Reflect.ownKeys(target);
    }
  });

  cache.set(value, proxy);
  return proxy;
}

function isReactiveValue(value: unknown): value is ReactiveValue & { [reactiveValueRef]: ReactiveRef } {
  return !!value && typeof value === "object" && reactiveValueMarker in value;
}

function track(target: object, key: PropertyKey): void {
  const reaction = reactionStack[reactionStack.length - 1];
  if (!reaction) return;

  const dep = getDep(target, key);
  dep.add(reaction);
  reaction.deps.add(dep);
}

function trigger(target: object, key: PropertyKey): void {
  const dep = getDep(target, key);
  for (const reaction of [...dep]) {
    reaction.schedule();
  }
}

function getDep(target: object, key: PropertyKey): Dep {
  let targetDeps = deps.get(target);
  if (!targetDeps) {
    targetDeps = new Map();
    deps.set(target, targetDeps);
  }

  let dep = targetDeps.get(key);
  if (!dep) {
    dep = new Set();
    targetDeps.set(key, dep);
  }

  return dep;
}

function cleanupReaction(reaction: Reaction): void {
  for (const dep of reaction.deps) {
    dep.delete(reaction);
  }
  reaction.deps.clear();
}

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(flushSync);
}

function hasChanged(previous: unknown, next: unknown): boolean {
  return !structurallyEqual(previous, next);
}

function reactiveValueChanged(previous: unknown, next: unknown): boolean {
  return (isReactiveValue(previous) || isReactiveValue(next)) && !Object.is(previous, next);
}

function structurallyEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;

  const unwrappedLeft = unwrap(left);
  const unwrappedRight = unwrap(right);
  if (Object.is(unwrappedLeft, unwrappedRight)) return true;

  if (Array.isArray(unwrappedLeft) && Array.isArray(unwrappedRight)) {
    if (unwrappedLeft.length !== unwrappedRight.length) return false;
    for (let index = 0; index < unwrappedLeft.length; index++) {
      if (!structurallyEqual(unwrappedLeft[index], unwrappedRight[index])) return false;
    }
    return true;
  }

  if (isPlainObject(unwrappedLeft) && isPlainObject(unwrappedRight)) {
    const leftKeys = Reflect.ownKeys(unwrappedLeft);
    const rightKeys = Reflect.ownKeys(unwrappedRight);
    if (leftKeys.length !== rightKeys.length) return false;

    for (const key of leftKeys) {
      if (!Reflect.has(unwrappedRight, key)) return false;
      if (!structurallyEqual(
        unwrappedLeft[key],
        unwrappedRight[key]
      )) {
        return false;
      }
    }

    return true;
  }

  return false;
}

function isPlainObject(value: unknown): value is Record<PropertyKey, unknown> {
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isArrayStructureKey(target: object, key: PropertyKey): boolean {
  return Array.isArray(target) && (key === "length" || isArrayIndex(key));
}

function isArrayIndex(key: PropertyKey): boolean {
  if (typeof key === "number") return Number.isInteger(key) && key >= 0;
  if (typeof key !== "string" || key === "") return false;
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && String(index) === key;
}

function mutateArray(target: unknown[], method: Function, args: unknown[], receiver: unknown): unknown {
  const previous = target.slice();
  const result = method.apply(target, args.map(arg => unwrap(arg)));
  if (!structurallyEqual(previous, target)) {
    const maxLength = Math.max(previous.length, target.length);
    trigger(target, "length");
    trigger(target, iterateKey);
    for (let index = 0; index < maxLength; index++) {
      trigger(target, String(index));
    }
  }

  return result === target ? receiver : result;
}
