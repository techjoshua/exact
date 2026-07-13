export type {
  EffectScope,
  Reactive,
  ReactiveOptions,
  ReactiveRef,
  ReactiveValue,
  StopHandle,
  WatchOptions
} from "./internal/types.js";

import { batch, cleanupReaction, getDep, peek, runTracked, track, trigger } from "./internal/deps.js";
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

export { batch, createEffectScope, flushSync, peek, withEffectScope };

/**
 * Compiler runtime hook for a statically-known state assignment.  Unlike a
 * normal proxy write, plain JSON-shaped replacements are reconciled in place:
 * unchanged branches retain their identity and do not notify dependents.
 * This is deliberately exported for compiler output only.
 */
export function writeReactive(target: object, path: readonly PropertyKey[], next: unknown): unknown {
  if (!path.length) throw new TypeError("writeReactive requires a state path");
  const { parent, key } = resolveReactivePath(target, path);
  commitReactiveWrite(parent, key, next);
  return next;
}

/** Compiler hook that resolves the assignment reference before evaluating its RHS. */
export function writeReactiveLazy(target: object, path: readonly PropertyKey[], evaluate: () => unknown): unknown {
  if (!path.length) throw new TypeError("writeReactiveLazy requires a state path");
  const { parent, key } = resolveReactivePath(target, path);
  const next = evaluate();
  commitReactiveWrite(parent, key, next);
  return next;
}

function commitReactiveWrite(parent: object, key: PropertyKey, next: unknown): void {
  batch(() => {
    const previous = Reflect.get(parent, key);
    if (reconcileReactiveValue(previous, next, new WeakMap())) return;
    if (!Object.is(unwrap(previous), unwrap(next))) Reflect.set(parent, key, next);
  });
}

/** Compiler runtime hook for compound assignments and update expressions. */
export function updateReactiveValue(
  target: object,
  path: readonly PropertyKey[],
  operation: (previous: any) => unknown,
  returnPrevious = false
): unknown {
  const { parent, key } = resolveReactivePath(target, path);
  const previous = Reflect.get(parent, key);
  const next = operation(previous);
  writeReactive(target, path, next);
  return returnPrevious ? previous : next;
}

/** Compiler hook for updates whose assignment result differs from the stored value. */
export function updateReactiveValueWithResult(
  target: object,
  path: readonly PropertyKey[],
  operation: (previous: any) => readonly [next: unknown, result: unknown]
): unknown {
  const { parent, key } = resolveReactivePath(target, path);
  const previous = Reflect.get(parent, key);
  const [next, result] = operation(previous);
  commitReactiveWrite(parent, key, next);
  return result;
}

/** Compiler runtime hook for statically-known deletes. */
export function deleteReactiveValue(target: object, path: readonly PropertyKey[]): boolean {
  if (!path.length) return false;
  const { parent, key } = resolveReactivePath(target, path);
  return Reflect.deleteProperty(parent, key);
}

/** Compiler runtime hook for standard array mutators. */
export function mutateReactiveArray(
  target: object,
  path: readonly PropertyKey[],
  method: "copyWithin" | "fill" | "pop" | "push" | "reverse" | "shift" | "sort" | "splice" | "unshift",
  args: unknown[] | (() => unknown[])
): unknown {
  const { parent, key } = resolveReactivePath(target, path);
  const value = Reflect.get(parent, key);
  if (!Array.isArray(value)) throw new TypeError(`Cannot call ${method} on a non-array reactive value`);
  const mutation = value[method] as (...input: unknown[]) => unknown;
  const input = typeof args === "function" ? args() : args;
  return mutation.apply(value, input);
}

/** Records the stable identity used by a keyed list for compiler reconciliation. */
export function registerReactiveListKey(
  collection: Iterable<unknown>,
  key: (item: unknown) => string,
  site = "an unlabelled this.map() call",
  identity?: string
): void {
  if (!collection || typeof collection !== "object") return;
  const raw = unwrap(collection as object) as object;
  if (!Array.isArray(raw)) return;

  // Render functions are recreated on every component render.  Comparing their
  // source gives compiled call sites a stable identity without retaining a
  // component instance, while still detecting genuinely incompatible keys.
  const signature = identity
    ? `compiler:${identity}`
    : `runtime:${Function.prototype.toString.call(key)}`;
  const previous = listKeyExtractors.get(raw);
  if (previous && previous.signature !== signature) {
    throw new Error(`Conflicting this.map() key extractors for the same collection (${previous.site} and ${site})`);
  }
  if (!previous) listKeyExtractors.set(raw, { key, signature, site });
}

const proxyCache = new WeakMap<object, object>();
const readonlyProxyCache = new WeakMap<object, object>();
const objectRefs = new WeakMap<object, ReactiveRef>();
const rawObjectRefs = new WeakMap<object, ReactiveRef>();
interface ListKeyRegistration {
  key: (item: unknown) => string;
  signature: string;
  site: string;
}

const listKeyExtractors = new WeakMap<object, ListKeyRegistration>();
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
    scheduled: false,
    scope,
    deps: new Set(),
    run() {
      if (!reaction.active) return;
      if (reaction.scope && !reaction.scope.active) {
        reaction.stop();
        return;
      }
      reaction.scheduled = false;
      runTracked(reaction, fn);
    },
    schedule() {
      if (!reaction.active) return;
      if (reaction.scope && !reaction.scope.active) {
        reaction.stop();
        return;
      }
      if (reaction.scheduled) return;
      reaction.scheduled = true;
      options.onSchedule?.();
      if (scheduler) {
        scheduler();
        return;
      }

      queueReaction(reaction);
    },
    stop() {
      reaction.active = false;
      reaction.scheduled = false;
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
    scheduled: false,
    deps: new Set([dep]),
    run() {
      reaction.scheduled = false;
      callback();
    },
    schedule() {
      if (reaction.scheduled) return;
      reaction.scheduled = true;
      queueReaction(reaction);
    },
    stop() {
      reaction.active = false;
      reaction.scheduled = false;
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
  return snapshotValue(value, new WeakMap());
}

function snapshotValue<T>(value: T, seen: WeakMap<object, unknown>): T {
  const plain = unwrap(value);

  if (!plain || typeof plain !== "object") {
    return plain;
  }

  const prior = seen.get(plain as object);
  if (prior) return prior as T;

  if (Array.isArray(plain)) {
    const result: unknown[] = [];
    seen.set(plain, result);
    for (let index = 0; index < plain.length; index++) {
      if (Reflect.has(plain, index)) result[index] = snapshotValue(plain[index], seen);
    }
    return result as T;
  }

  const result: Record<PropertyKey, unknown> = {};
  seen.set(plain as object, result);
  for (const key of Reflect.ownKeys(plain)) {
    result[key] = snapshotValue((plain as Record<PropertyKey, unknown>)[key], seen);
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

function resolveReactivePath(target: object, path: readonly PropertyKey[]): { parent: object; key: PropertyKey } {
  let parent = target as Record<PropertyKey, unknown>;
  for (let index = 0; index < path.length - 1; index++) {
    const next = parent[path[index]!];
    if (!next || typeof next !== "object") throw new TypeError(`Cannot resolve reactive state path ${path.join(".")}`);
    parent = next as Record<PropertyKey, unknown>;
  }
  return { parent, key: path[path.length - 1]! };
}

/** Returns true when a compatible structured value was reconciled in place. */
function reconcileReactiveValue(
  previous: unknown,
  next: unknown,
  seen: WeakMap<object, WeakSet<object>>
): boolean {
  const oldValue = unwrap(previous);
  const nextValue = unwrap(next);
  if (Object.is(oldValue, nextValue)) return true;
  if (!oldValue || !nextValue || typeof oldValue !== "object" || typeof nextValue !== "object") return false;
  const compatible = Array.isArray(oldValue) && Array.isArray(nextValue)
    ? canReconcileStructure(oldValue) && canReadStructure(nextValue)
    : isPlainObject(oldValue) && isPlainObject(nextValue)
      && canReconcileStructure(oldValue) && canReadStructure(nextValue);
  if (!compatible) return false;

  let paired = seen.get(oldValue);
  if (paired?.has(nextValue)) return true;
  if (!paired) {
    paired = new WeakSet<object>();
    seen.set(oldValue, paired);
  }
  paired.add(nextValue);

  const current = previous as Record<PropertyKey, unknown>;
  if (Array.isArray(oldValue) && Array.isArray(nextValue)) {
    const registration = listKeyExtractors.get(oldValue);
    if (registration) return reconcileKeyedArray(current, oldValue, nextValue, registration.key, seen);
    const oldLength = oldValue.length;
    const previousItems = Array.from({ length: oldLength }, (_, index) => current[index]);
    const existingByIdentity = new WeakMap<object, unknown>();
    for (const item of previousItems) {
      const identity = structuredIdentity(item);
      if (identity) existingByIdentity.set(identity, item);
    }
    const retainedIdentities = new WeakSet<object>();
    for (const incoming of nextValue) {
      const identity = structuredIdentity(incoming);
      if (identity && existingByIdentity.has(identity)) retainedIdentities.add(identity);
    }
    const nextItems = nextValue.map((incoming, index) => {
      const incomingIdentity = structuredIdentity(incoming);
      const retained = incomingIdentity ? existingByIdentity.get(incomingIdentity) : undefined;
      if (retained !== undefined) return retained;
      const previousItem = previousItems[index];
      const previousIdentity = structuredIdentity(previousItem);
      if (previousIdentity && retainedIdentities.has(previousIdentity)) return incoming;
      return previousItem !== undefined && reconcileReactiveValue(previousItem, incoming, seen)
        ? previousItem
        : incoming;
    });
    reconcileArrayItems(current, oldLength, nextItems);
    return true;
  }

  const nextRecord = nextValue as Record<PropertyKey, unknown>;
  for (const key of Reflect.ownKeys(oldValue)) {
    if (!Reflect.has(nextRecord, key)) delete current[key];
  }
  for (const key of Reflect.ownKeys(nextRecord)) {
    if (!Reflect.has(oldValue, key) || !reconcileReactiveValue(current[key], nextRecord[key], seen)) current[key] = nextRecord[key];
  }
  return true;
}

function reconcileKeyedArray(
  current: Record<PropertyKey, unknown>,
  oldValue: unknown[],
  nextValue: unknown[],
  key: (item: unknown) => string,
  seen: WeakMap<object, WeakSet<object>>
): boolean {
  const existing = new Map<string, unknown>();
  for (let index = 0; index < oldValue.length; index++) {
    const id = String(key(oldValue[index]));
    if (existing.has(id)) throw new Error(`Duplicate key "${id}" in the current keyed reactive array`);
    existing.set(id, current[index]);
  }
  const incomingEntries = nextValue.map(incoming => ({ id: String(key(incoming)), incoming }));
  const keys = new Set<string>();
  for (const { id } of incomingEntries) {
    if (keys.has(id)) throw new Error(`Duplicate key "${id}" in the next keyed reactive array`);
    keys.add(id);
  }
  const nextItems: unknown[] = [];
  for (const { id, incoming } of incomingEntries) {
    const previousItem = existing.get(id);
    if (previousItem !== undefined && reconcileReactiveValue(previousItem, incoming, seen)) nextItems.push(previousItem);
    else nextItems.push(incoming);
  }
  reconcileArrayItems(current, oldValue.length, nextItems);
  return true;
}

function structuredIdentity(value: unknown): object | undefined {
  const identity = unwrap(value);
  return identity && typeof identity === "object" ? identity : undefined;
}

function reconcileArrayItems(current: Record<PropertyKey, unknown>, oldLength: number, nextItems: readonly unknown[]): void {
  const target = unwrap(current) as unknown as unknown[];
  const changedIndexes = new Set<number>();
  for (let index = 0; index < nextItems.length; index++) {
    if (!Reflect.has(nextItems, index)) {
      if (Reflect.has(target, index)) {
        Reflect.deleteProperty(target, index);
        changedIndexes.add(index);
      }
      continue;
    }
    const next = unwrap(nextItems[index]);
    if (Object.is(unwrap(target[index]), next)) continue;
    Reflect.set(target, index, next);
    changedIndexes.add(index);
  }
  if (nextItems.length < oldLength) {
    for (let index = oldLength - 1; index >= nextItems.length; index--) {
      if (Reflect.has(target, index)) changedIndexes.add(index);
      Reflect.deleteProperty(target, index);
    }
  }
  if (target.length !== nextItems.length) target.length = nextItems.length;

  // Reconciliation is one observable write. Notify only after the complete
  // array is valid so synchronous pre-patch hooks never see holes or aliases.
  for (const index of changedIndexes) trigger(target, String(index));
  if (oldLength !== nextItems.length) trigger(target, "length");
  if (changedIndexes.size || oldLength !== nextItems.length) trigger(target, iterateKey);
}

function canReconcileStructure(value: object): boolean {
  if (!Object.isExtensible(value)) return false;
  return Reflect.ownKeys(value).every(key => {
    if (Array.isArray(value) && key === "length") return true;
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    return !!descriptor && "value" in descriptor && descriptor.writable !== false && descriptor.configurable !== false;
  });
}

function canReadStructure(value: object): boolean {
  return Reflect.ownKeys(value).every(key => {
    if (Array.isArray(value) && key === "length") return true;
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    return !!descriptor && "value" in descriptor;
  });
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

      if (current && typeof current === "object" && isReactiveContainer(unwrap(current))) {
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

      const previousLength = Array.isArray(target) ? target.length : undefined;
      const removedIndexes = Array.isArray(target) && key === "length" && typeof next === "number" && next < target.length
        ? Array.from({ length: target.length - next }, (_, offset) => next + offset).filter(index => Reflect.has(target, index))
        : [];
      const previous = Reflect.get(target, key, receiver);
      const unwrapped = unwrap(next);
      const hadKey = Reflect.has(target, key);
      const changed = hasChanged(previous, unwrapped);
      const ok = Reflect.set(target, key, unwrapped, receiver);
      if (ok && changed) {
        trigger(target, key);
        for (const index of removedIndexes) trigger(target, String(index));
        if (previousLength !== undefined && Array.isArray(target) && target.length !== previousLength && key !== "length") trigger(target, "length");
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
    },
    has(target, key) {
      track(target, key);
      return Reflect.has(target, key);
    }
  });

  cache.set(reactiveTarget, proxy);
  return proxy;
}

export function isReactiveValue(value: unknown): value is ReactiveValue & { [reactiveValueRef]: ReactiveRef } {
  return !!value && typeof value === "object" && reactiveValueMarker in value;
}

function hasChanged(previous: unknown, next: unknown): boolean {
  return hasStructurallyChanged(previous, next, unwrap);
}

function isReactiveContainer(value: unknown): value is object {
  return Array.isArray(value) || isPlainObject(value);
}

function reactiveValueChanged(previous: unknown, next: unknown): boolean {
  return (isReactiveValue(previous) || isReactiveValue(next)) && !Object.is(previous, next);
}

function mutateArray(target: unknown[], method: Function, args: unknown[], receiver: unknown): unknown {
  const previous = target.slice();
  let result: unknown;
  try {
    result = method.apply(target, args.map(arg => unwrap(arg)));
  } finally {
    batch(() => {
      const maxLength = Math.max(previous.length, target.length);
      let changed = previous.length !== target.length;
      for (let index = 0; index < maxLength; index++) {
        const existed = Reflect.has(previous, index);
        const exists = Reflect.has(target, index);
        if (existed === exists && Object.is(unwrap(previous[index]), unwrap(target[index]))) continue;
        changed = true;
        trigger(target, String(index));
      }
      if (previous.length !== target.length) trigger(target, "length");
      if (changed) trigger(target, iterateKey);
    });
  }

  return result === target ? receiver : result;
}
