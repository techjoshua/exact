export type {
  EffectScope,
  Reactive,
  ReactiveOptions,
  ReactiveRef,
  ReactiveValue,
  StopHandle,
  WatchOptions
} from "./internal/types.js";

import { cleanupReaction, getDep, peek, runTracked, track, trigger } from "./internal/deps.js";
import { hasChanged as hasStructurallyChanged, structurallyEqual } from "./internal/equality.js";
import { isArrayStructureKey, isPlainObject } from "./internal/objects.js";
import { createEffectScope, currentEffectScope, withEffectScope } from "./internal/scopes.js";
import { flushSync, queueComputation, queueReaction, removeQueuedComputation } from "./internal/scheduler.js";
import { iterateKey, proxyMarker, rawTarget, reactiveValueMarker, reactiveValueRef } from "./internal/symbols.js";
import type {
  EffectScope,
  EffectScopeImpl,
  Reactive,
  ReactiveOptions,
  ReactiveRef,
  ReactiveValue,
  Reaction,
  StopHandle,
  WatchOptions
} from "./internal/types.js";

export { createEffectScope, flushSync, peek, withEffectScope };

const proxyCache = new WeakMap<object, object>();
const readonlyProxyCache = new WeakMap<object, object>();
const objectRefs = new WeakMap<object, ReactiveRef>();
const rawObjectRefs = new WeakMap<object, ReactiveRef>();
const mutatingArrayMethods = new Set<PropertyKey>(["copyWithin", "fill", "pop", "push", "reverse", "shift", "sort", "splice", "unshift"]);

/** Creates a reactive proxy that tracks reads and notifies watchers when writable state changes. */
export function reactive<T extends object>(value: T, options: ReactiveOptions = {}): Reactive<T> {
  return createReactive(value, options) as Reactive<T>;
}

/** Creates a lazy derived reactive value that recomputes when one of its tracked dependencies changes. */
export function computed<T>(compute: () => T): ReactiveValue<T> {
  const scope = currentEffectScope();
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
    if (scope && !scope.active) return;
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
      queueRecompute,
      { scope }
    );
  }

  function queueRecompute(): void {
    if (scope && !scope.active) return;
    if (queued) return;
    queued = true;
    queueComputation(recomputeAndNotify);
  }

  function recomputeAndNotify(): void {
    // A computed value tears down and rebuilds its watcher on each flush so dependency
    // sets follow the latest branch of the compute function instead of stale reads.
    queued = false;
    removeQueuedComputation(recomputeAndNotify);
    if (scope && !scope.active) return;
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

/** Runs a tracked function immediately and schedules it again whenever its dependencies change. */
export function watch(fn: () => void, scheduler?: () => void, options: WatchOptions = {}): StopHandle {
  const scope = (options.scope ?? currentEffectScope()) as EffectScopeImpl | undefined;
  const reaction: Reaction = {
    active: true,
    scope,
    deps: new Set(),
    run() {
      if (!reaction.active) return;
      if (reaction.scope && !reaction.scope.active) {
        reaction.stop();
        return;
      }
      runTracked(reaction, fn);
    },
    schedule() {
      if (!reaction.active) return;
      if (reaction.scope && !reaction.scope.active) {
        reaction.stop();
        return;
      }
      options.onSchedule?.();
      if (scheduler) {
        scheduler();
        return;
      }

      queueReaction(reaction);
    },
    stop() {
      reaction.active = false;
      cleanupReaction(reaction);
      reaction.scope?.reactions.delete(reaction);
    }
  };

  scope?.reactions.add(reaction);
  reaction.run();
  return reaction.stop;
}

/** Subscribes directly to a reactive reference without running a dependency collection pass. */
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

/** Returns the raw value behind a reactive proxy or reactive value wrapper. */
export function unwrap<T>(value: T): T {
  if (isReactiveValue(value)) {
    return value.get() as T;
  }

  if (isReactive(value)) {
    return (value as { [rawTarget]: T })[rawTarget];
  }

  return value;
}

/** Returns the reactive reference that drives a reactive value or proxied object, when available. */
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

/** Returns whether a value is an eXact reactive proxy. */
export function isReactive(value: unknown): boolean {
  return !!value && typeof value === "object" && Boolean((value as { [proxyMarker]?: boolean })[proxyMarker]);
}

/** Creates a plain recursive snapshot of reactive state for serialization or comparison. */
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

/** Mutates an existing reactive object to match a partial next value while preserving nested proxies. */
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
  const reactiveTarget = isReactive(value)
    ? (value as { [rawTarget]: object })[rawTarget]
    : value;
  const cache = options.readonly ? readonlyProxyCache : proxyCache;
  const cached = cache.get(reactiveTarget);
  if (cached) return cached;

  const proxy = new Proxy(reactiveTarget, {
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
        const currentValue = current.get();
        return currentValue && typeof currentValue === "object"
          ? createReactive(unwrap(currentValue) as object, options)
          : currentValue;
      }

      if (current && typeof current === "object") {
        const currentTarget = unwrap(current) as object;
        const proxy = createReactive(currentTarget, options);
        const source = {
          target,
          key,
          get() {
            track(target, key);
            const next = Reflect.get(target, key);
            if (isReactiveValue(next)) {
              const nextValue = next.get();
              return nextValue && typeof nextValue === "object"
                ? createReactive(unwrap(nextValue) as object, options)
                : nextValue;
            }
            return next && typeof next === "object"
              ? createReactive(unwrap(next) as object, options)
              : next;
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
        rawObjectRefs.set(currentTarget, source);
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

  cache.set(reactiveTarget, proxy);
  return proxy;
}

function isReactiveValue(value: unknown): value is ReactiveValue & { [reactiveValueRef]: ReactiveRef } {
  return !!value && typeof value === "object" && reactiveValueMarker in value;
}

function hasChanged(previous: unknown, next: unknown): boolean {
  return hasStructurallyChanged(previous, next, unwrap);
}

function reactiveValueChanged(previous: unknown, next: unknown): boolean {
  return (isReactiveValue(previous) || isReactiveValue(next)) && !Object.is(previous, next);
}

function mutateArray(target: unknown[], method: Function, args: unknown[], receiver: unknown): unknown {
  const previous = target.slice();
  const result = method.apply(target, args.map(arg => unwrap(arg)));
  if (!structurallyEqual(previous, target, unwrap)) {
    const maxLength = Math.max(previous.length, target.length);
    trigger(target, "length");
    trigger(target, iterateKey);
    for (let index = 0; index < maxLength; index++) {
      trigger(target, String(index));
    }
  }

  return result === target ? receiver : result;
}
