export type Reactive<T> = T;

export type ReactiveRef<T = unknown> = {
  readonly target: object;
  readonly key: PropertyKey;
  get(): T;
  set(value: T): void;
};

type Reaction = {
  active: boolean;
  deps: Set<Dep>;
  run(): void;
  schedule(): void;
  stop(): void;
};

type Dep = Set<Reaction>;

const proxyMarker = Symbol("exact.reactive.proxy");
const wrapperMarker = Symbol("exact.reactive.wrapper");
const rawTarget = Symbol("exact.reactive.raw");
const primitiveRef = Symbol("exact.reactive.primitiveRef");

const proxyCache = new WeakMap<object, object>();
const readonlyProxyCache = new WeakMap<object, object>();
const objectRefs = new WeakMap<object, ReactiveRef>();
const deps = new WeakMap<object, Map<PropertyKey, Dep>>();
const reactionStack: Reaction[] = [];
const queuedReactions = new Set<Reaction>();
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
  if (isPrimitiveWrapper(value)) {
    return value[primitiveRef].get() as T;
  }

  if (isReactive(value)) {
    return (value as { [rawTarget]: T })[rawTarget];
  }

  return value;
}

export function ref<T>(value: T): ReactiveRef<T> | undefined {
  if (isPrimitiveWrapper(value)) {
    return value[primitiveRef] as ReactiveRef<T>;
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
  const reactions = [...queuedReactions];
  queuedReactions.clear();
  flushScheduled = false;

  for (const reaction of reactions) {
    if (reaction.active) reaction.run();
  }
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
      }
    }
  }

  for (const key of Reflect.ownKeys(next)) {
    const previous = Reflect.get(raw, key);
    const value = unwrap(Reflect.get(next, key));
    if (Object.is(previous, value)) continue;
    Reflect.set(raw, key, value);
    trigger(raw, key);
  }
}

function createReactive(value: object, options: ReactiveOptions): object {
  const cache = options.readonly ? readonlyProxyCache : proxyCache;
  const cached = cache.get(value);
  if (cached) return cached;

  const proxy = new Proxy(value, {
    get(target, key, receiver) {
      if (key === proxyMarker) return true;
      if (key === rawTarget) return target;

      const current = Reflect.get(target, key, receiver);
      if (options.passthroughKeys?.includes(key)) {
        track(target, key);
        return current;
      }

      if (isPrimitiveWrapper(current)) {
        return current;
      }

      if (current && typeof current === "object") {
        const proxy = createReactive(current, options);
        objectRefs.set(proxy, {
          target,
          key,
          get() {
            track(target, key);
            const next = Reflect.get(target, key);
            return next && typeof next === "object" ? createReactive(next, options) : next;
          },
          set(value) {
            const previous = Reflect.get(target, key);
            const unwrapped = unwrap(value);
            if (Object.is(previous, unwrapped)) return;
            Reflect.set(target, key, unwrapped);
            trigger(target, key);
          }
        });
        return proxy;
      }

      return createPrimitiveWrapper(target, key, current);
    },
    set(target, key, next, receiver) {
      if (options.readonly) {
        options.onReadonlyWrite?.(key);
        return false;
      }

      const previous = Reflect.get(target, key, receiver);
      const unwrapped = unwrap(next);
      const changed = !Object.is(previous, unwrapped);
      const ok = Reflect.set(target, key, unwrapped, receiver);
      if (ok && changed) trigger(target, key);
      return ok;
    },
    deleteProperty(target, key) {
      if (options.readonly) {
        options.onReadonlyWrite?.(key);
        return false;
      }

      const hadKey = Reflect.has(target, key);
      const ok = Reflect.deleteProperty(target, key);
      if (ok && hadKey) trigger(target, key);
      return ok;
    }
  });

  cache.set(value, proxy);
  return proxy;
}

function createPrimitiveWrapper(target: object, key: PropertyKey, initial: unknown): unknown {
  if (initial !== null && (typeof initial === "object" || typeof initial === "function")) {
    return initial;
  }

  const source: ReactiveRef = {
    target,
    key,
    get() {
      track(target, key);
      return Reflect.get(target, key);
    },
    set(value) {
      const previous = Reflect.get(target, key);
      const unwrapped = unwrap(value);
      if (Object.is(previous, unwrapped)) return;
      Reflect.set(target, key, unwrapped);
      trigger(target, key);
    }
  };

  const wrapper = {
    [wrapperMarker]: true,
    [primitiveRef]: source,
    valueOf: () => source.get(),
    toString: () => String(source.get()),
    toJSON: () => source.get(),
    [Symbol.toPrimitive]: () => source.get()
  };

  return new Proxy(wrapper, {
    get(object, property, receiver) {
      if (property in object) {
        return Reflect.get(object, property, receiver);
      }

      const value = source.get();
      const member = Reflect.get(Object(value), property);
      return typeof member === "function" ? member.bind(value) : member;
    },
    set(_object, property, value) {
      if (property === "value") {
        source.set(value);
        return true;
      }

      return false;
    }
  });
}

function isPrimitiveWrapper(value: unknown): value is { [primitiveRef]: ReactiveRef } {
  return !!value && typeof value === "object" && wrapperMarker in value;
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
