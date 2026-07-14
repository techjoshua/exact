export type {
  EffectScope,
  Reactive,
  ReactiveOptions,
  ReactiveRef,
  ReactiveValue,
  StopHandle,
  WatchOptions
} from "./internal/types.js";

import { batch, cleanupReaction, getDep, hasActiveTransaction, peek, recordTransactionUndo, runTracked, track, trigger } from "./internal/deps.js";
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
    if (reconcileReactiveValue(previous, next, createReconcilePairs())) return;
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
  commitReactiveWrite(parent, key, next);
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
): StopHandle {
  if (!collection || typeof collection !== "object") return () => undefined;
  const raw = unwrap(collection as object) as object;
  if (!Array.isArray(raw)) return () => undefined;

  // Render functions are recreated on every component render.  Comparing their
  // source gives compiled call sites a stable identity without retaining a
  // component instance, while still detecting genuinely incompatible keys.
  const signature = identity
    ? `compiler:${identity}`
    : `runtime:${Function.prototype.toString.call(key)}`;
  const previous = listKeyExtractors.get(raw);
  if (previous && previous.signature !== signature) {
    throw conflictingListKeyError(previous.site, site);
  }
  // Compiler identities are a checked semantic contract and keep registration
  // constant-time for large lists. Dynamic extractors have only source text as
  // identity, so verify recreated closures against current records to catch
  // captured values that changed their meaning.
  if (previous && !identity) {
    for (const item of raw) {
      if (String(previous.key(item)) !== String(key(item))) throw conflictingListKeyError(previous.site, site);
    }
  }
  if (previous) {
    previous.references++;
  } else {
    listKeyExtractors.set(raw, { key, signature, site, references: 1 });
  }
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    const registration = listKeyExtractors.get(raw);
    if (!registration || registration.signature !== signature) return;
    if (--registration.references === 0) listKeyExtractors.delete(raw);
  };
}

function conflictingListKeyError(left: string, right: string): Error {
  const sites = [left, right].sort();
  return new Error(`Conflicting this.map() key extractors for the same collection (${sites[0]} and ${sites[1]}). A reactive collection must have one stable key contract.`);
}

const defaultReactiveOptions: ReactiveOptions = Object.freeze({});
const readonlyReactiveOptionsKey = Object.freeze({ readonly: true });
const rootProxyCache = new WeakMap<object, WeakMap<object, object>>();
const sourcedProxyCache = new WeakMap<object, WeakMap<object, Map<ReactiveRef, object>>>();
const parentSourceCache = new WeakMap<object, Map<PropertyKey, WeakMap<object, ReactiveRef>>>();
const proxyRefs = new WeakMap<object, ReactiveRef>();
const proxySources = new WeakMap<object, Set<ReactiveRef>>();
const reactiveRawObjects = new WeakSet<object>();
interface ListKeyRegistration {
  key: (item: unknown) => string;
  signature: string;
  site: string;
  references: number;
}

const listKeyExtractors = new WeakMap<object, ListKeyRegistration>();
const mutatingArrayMethods = new Set<PropertyKey>(["copyWithin", "fill", "pop", "push", "reverse", "shift", "sort", "splice", "unshift"]);

/** Creates a reactive proxy that tracks reads and notifies watchers when writable state changes. */
export function reactive<T extends object>(value: T, options: ReactiveOptions = defaultReactiveOptions): Reactive<T> {
  if (!isReactiveContainer(unwrap(value))) return value as Reactive<T>;
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
  let computeFailed = false;

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

    computeFailed = false;
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

        if (hasChanged(current, next)) current = next;
      },
      queueRecompute,
      {
        scope,
        onError(error) {
          computeFailed = true;
          if (scope?.onError) scope.onError(error);
          else throw error;
        }
      }
    );
  }

  function queueRecompute(): void {
    if (scope && !scope.active) return;
    if (queued) return;
    queued = true;
    queueComputation(recomputeAndNotify, scope?.onError);
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
    if (computeFailed) return;
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
  const handleError = (error: unknown): void => {
    const onError = options.onError ?? scope?.onError;
    if (!onError) throw error;
    onError(error);
  };
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
      try {
        runTracked(reaction, fn);
      } catch (error) {
        handleError(error);
      }
    },
    schedule() {
      if (!reaction.active) return;
      if (reaction.scope && !reaction.scope.active) {
        reaction.stop();
        return;
      }
      if (reaction.scheduled) return;
      reaction.scheduled = true;
      try {
        options.onSchedule?.();
        if (scheduler) {
          scheduler();
          return;
        }
        queueReaction(reaction);
      } catch (error) {
        // A failed scheduler did not arrange for run() to clear this bit. Reset it
        // so a later dependency change can retry rather than wedging the watcher.
        reaction.scheduled = false;
        handleError(error);
      }
    },
    stop() {
      reaction.active = false;
      reaction.scheduled = false;
      cleanupReaction(reaction);
      reaction.scope?.reactions.delete(reaction);
    }
  };

  scope?.reactions.add(reaction);
  try {
    reaction.run();
  } catch (error) {
    // A caller cannot stop a watcher whose initial run failed before the stop
    // handle was returned. Tear it down here so dependencies and scope
    // ownership cannot leak.
    reaction.stop();
    throw error;
  }
  return reaction.stop;
}

/** Subscribes directly to a reactive reference without running a dependency collection pass. */
export function subscribe<T>(source: ReactiveRef<T>, callback: () => void, options: WatchOptions = {}): StopHandle {
  const scope = (options.scope ?? currentEffectScope()) as EffectScopeImpl | undefined;
  const handleError = (error: unknown): void => {
    const onError = options.onError ?? scope?.onError;
    if (!onError) throw error;
    onError(error);
  };
  const dep = getDep(source.target, source.key);
  const reaction: Reaction = {
    active: true,
    scheduled: false,
    deps: new Set([dep]),
    run() {
      reaction.scheduled = false;
      if (!reaction.active || scope && !scope.active) {
        reaction.stop();
        return;
      }
      try { callback(); } catch (error) { handleError(error); }
    },
    schedule() {
      if (!reaction.active || scope && !scope.active) {
        reaction.stop();
        return;
      }
      if (reaction.scheduled) return;
      reaction.scheduled = true;
      queueReaction(reaction);
    },
    stop() {
      reaction.active = false;
      reaction.scheduled = false;
      cleanupReaction(reaction);
      scope?.reactions.delete(reaction);
    }
  };

  dep.add(reaction);
  scope?.reactions.add(reaction);
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
    return proxyRefs.get(value as object) as ReactiveRef<T> | undefined;
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

  if (!isPlainObject(plain)) return plain;
  const result: Record<PropertyKey, unknown> = Object.create(Object.getPrototypeOf(plain));
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

  batch(() => {
  for (const key of Reflect.ownKeys(raw)) {
    if (!Object.prototype.hasOwnProperty.call(nextRecord, key)) {
      const hadKey = Object.prototype.hasOwnProperty.call(raw, key);
      if (hadKey) {
        recordPropertyUndo(raw, key);
        Reflect.deleteProperty(raw, key);
        trigger(raw, key);
        trigger(raw, iterateKey);
      }
    }
  }

  for (const key of Reflect.ownKeys(next)) {
    const previous = Reflect.get(raw, key);
    const value = Reflect.get(next, key);
    const hadKey = Object.prototype.hasOwnProperty.call(raw, key);
    if (canUpdateNestedReactive(previous, value)) {
      updateReactive(previous as object, unwrap(value) as Partial<object>);
      continue;
    }
    if (!reactiveValueChanged(previous, value) && !hasChanged(previous, value)) continue;
    recordPropertyUndo(raw, key);
    Reflect.set(raw, key, value);
    trigger(raw, key);
    if (!hadKey || isArrayStructureKey(raw, key)) trigger(raw, iterateKey);
  }
  });
}

function canUpdateNestedReactive(previous: unknown, next: unknown): boolean {
  const unwrappedPrevious = unwrap(previous);
  const unwrappedNext = unwrap(next);
  if (Object.is(unwrappedPrevious, unwrappedNext)) return false;
  return (isReactive(previous) || (!!unwrappedPrevious && typeof unwrappedPrevious === "object" && reactiveRawObjects.has(unwrappedPrevious)))
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
  seen: ReconcilePairs
): boolean {
  const oldValue = unwrap(previous);
  const nextValue = unwrap(next);
  if (Object.is(oldValue, nextValue)) return true;
  if (!oldValue || !nextValue || typeof oldValue !== "object" || typeof nextValue !== "object") return false;
  const compatible = Array.isArray(oldValue) && Array.isArray(nextValue)
    ? Object.getPrototypeOf(oldValue) === Object.getPrototypeOf(nextValue)
      && canReconcileStructure(oldValue) && canReadStructure(nextValue)
    : isPlainObject(oldValue) && isPlainObject(nextValue)
      && Object.getPrototypeOf(oldValue) === Object.getPrototypeOf(nextValue)
      && canReconcileStructure(oldValue) && canReadStructure(nextValue);
  if (!compatible) return false;

  const priorNext = seen.oldToNext.get(oldValue);
  const priorOld = seen.nextToOld.get(nextValue);
  if (priorNext || priorOld) return priorNext === nextValue && priorOld === oldValue;
  seen.oldToNext.set(oldValue, nextValue);
  seen.nextToOld.set(nextValue, oldValue);

  const current = previous as Record<PropertyKey, unknown>;
  if (Array.isArray(oldValue) && Array.isArray(nextValue)) {
    const registration = listKeyExtractors.get(oldValue);
    if (registration) return reconcileKeyedArray(current, oldValue, nextValue, registration.key, seen);
    const oldLength = oldValue.length;
    const previousItems = Array.from({ length: oldLength }, (_, index) =>
      Object.prototype.hasOwnProperty.call(current, index) ? current[index] : arrayHole);
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
      if (previousItem === arrayHole) return incoming;
      const previousIdentity = structuredIdentity(previousItem);
      if (previousIdentity && retainedIdentities.has(previousIdentity)) return incoming;
      return previousItem !== undefined && reconcileReactiveValue(previousItem, incoming, seen)
        ? previousItem
        : incoming;
    });
    reconcileArrayItems(current, oldLength, nextItems);
    reconcileArrayProperties(current, oldValue, nextValue, seen);
    return true;
  }

  const nextRecord = nextValue as Record<PropertyKey, unknown>;
  for (const key of Reflect.ownKeys(oldValue)) {
    if (!Object.prototype.hasOwnProperty.call(nextRecord, key)) Reflect.deleteProperty(current, key);
  }
  for (const key of Reflect.ownKeys(nextRecord)) {
    const nextDescriptor = Reflect.getOwnPropertyDescriptor(nextRecord, key)!;
    const oldDescriptor = Reflect.getOwnPropertyDescriptor(oldValue, key);
    if (!("value" in nextDescriptor)) return false;
    if (!oldDescriptor || !("value" in oldDescriptor)
      || !reconcileReactiveValue(current[key], nextDescriptor.value, seen)) {
      // defineProperty treats __proto__ as an ordinary key and preserves the
      // incoming descriptor shape without prototype mutation.
      Reflect.defineProperty(current, key, { ...nextDescriptor, value: unwrap(nextDescriptor.value) });
    }
  }
  return true;
}

type ReconcilePairs = {
  oldToNext: WeakMap<object, object>;
  nextToOld: WeakMap<object, object>;
};
const arrayHole = Symbol("exact.array-hole");

function createReconcilePairs(): ReconcilePairs {
  return { oldToNext: new WeakMap(), nextToOld: new WeakMap() };
}

function reconcileArrayProperties(
  current: Record<PropertyKey, unknown>,
  oldValue: unknown[],
  nextValue: unknown[],
  seen: ReconcilePairs
): void {
  const isExtra = (key: PropertyKey) => key !== "length" && !(typeof key === "string" && /^(0|[1-9]\d*)$/.test(key));
  for (const key of Reflect.ownKeys(oldValue)) {
    if (isExtra(key) && !Object.prototype.hasOwnProperty.call(nextValue, key)) Reflect.deleteProperty(current, key);
  }
  for (const key of Reflect.ownKeys(nextValue)) {
    if (!isExtra(key)) continue;
    const nextDescriptor = Reflect.getOwnPropertyDescriptor(nextValue, key)!;
    const oldDescriptor = Reflect.getOwnPropertyDescriptor(oldValue, key);
    if (!("value" in nextDescriptor)) continue;
    if (!oldDescriptor || !("value" in oldDescriptor)
      || !reconcileReactiveValue(current[key], nextDescriptor.value, seen)) {
      Reflect.defineProperty(current, key, { ...nextDescriptor, value: unwrap(nextDescriptor.value) });
    }
  }
}

function reconcileKeyedArray(
  current: Record<PropertyKey, unknown>,
  oldValue: unknown[],
  nextValue: unknown[],
  key: (item: unknown) => string,
  seen: ReconcilePairs
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
  recordArrayUndo(target);
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

function createReactive(value: object, options: ReactiveOptions, parentSource?: ReactiveRef): object {
  const reactiveTarget = isReactive(value)
    ? (value as { [rawTarget]: object })[rawTarget]
    : value;
  const cached = getCachedProxy(reactiveTarget, options, parentSource);
  if (cached) {
    if (parentSource) registerProxySource(cached, parentSource);
    return cached;
  }

  let forwardingSet = false;

  const proxy = new Proxy(reactiveTarget, {
    get(target, key, receiver) {
      if (key === proxyMarker) return true;
      if (key === rawTarget) return target;

      trackProxySources(proxy);
      const current = Reflect.get(target, key, receiver);
      if (Array.isArray(target) && mutatingArrayMethods.has(key) && typeof current === "function") {
        return (...args: unknown[]) => mutateArray(target, String(key), current, args, receiver);
      }
      if (options.passthroughKeys?.includes(key)) {
        track(target, key);
        return current;
      }

      if (isReactiveValue(current)) {
        track(target, key);
        const currentValue = current.get();
        return currentValue && typeof currentValue === "object"
          ? createReactive(unwrap(currentValue) as object, options, createParentSource(target, key, options))
          : currentValue;
      }

      if (current && typeof current === "object" && isReactiveContainer(unwrap(current))) {
        const currentTarget = unwrap(current) as object;
        if (currentTarget === target) {
          track(target, key);
          return receiver;
        }
        const source = createParentSource(target, key, options);
        const proxy = createReactive(currentTarget, options, source);
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
      const hadKey = Object.prototype.hasOwnProperty.call(target, key);
      const changed = hasChanged(previous, unwrapped);
      // If structural equality suppresses notification it must also suppress
      // replacement. Otherwise direct reads observe a new identity while
      // existing computed values legitimately retain the old one.
      const ownDescriptor = Reflect.getOwnPropertyDescriptor(target, key);
      if (!changed && ownDescriptor && "value" in ownDescriptor) return true;
      const undo = hasActiveTransaction() ? createPropertyUndo(target, key) : undefined;
      forwardingSet = true;
      let ok: boolean;
      try {
        ok = Reflect.set(target, key, unwrapped, receiver);
      } finally {
        forwardingSet = false;
      }
      if (ok && undo && (!hadKey || !Object.is(previous, Reflect.get(target, key, receiver)))) recordTransactionUndo(undo);
      if (ok && changed) {
        trigger(target, key);
        for (const index of removedIndexes) trigger(target, String(index));
        if (previousLength !== undefined && Array.isArray(target) && target.length !== previousLength && key !== "length") trigger(target, "length");
        if (!hadKey || isArrayStructureKey(target, key)) trigger(target, iterateKey);
      }
      return ok;
    },
    defineProperty(target, key, descriptor) {
      if (forwardingSet) return Reflect.defineProperty(target, key, descriptor);
      if (options.readonly) {
        options.onReadonlyWrite?.(key);
        return false;
      }
      const previous = Reflect.getOwnPropertyDescriptor(target, key);
      if (samePropertyDescriptor(previous, descriptor)) return true;
      const undo = hasActiveTransaction() ? createPropertyUndo(target, key) : undefined;
      const oldLength = Array.isArray(target) ? target.length : undefined;
      const ok = Reflect.defineProperty(target, key, normalizeDescriptor(descriptor));
      if (!ok) return false;
      if (undo) recordTransactionUndo(undo);
      trigger(target, key);
      if (!previous || isArrayStructureKey(target, key)) trigger(target, iterateKey);
      if (oldLength !== undefined && (target as unknown[]).length !== oldLength && key !== "length") trigger(target, "length");
      return true;
    },
    deleteProperty(target, key) {
      if (options.readonly) {
        options.onReadonlyWrite?.(key);
        return false;
      }

      const hadKey = Object.prototype.hasOwnProperty.call(target, key);
      const descriptor = hadKey && hasActiveTransaction() ? Reflect.getOwnPropertyDescriptor(target, key) : undefined;
      const ok = Reflect.deleteProperty(target, key);
      if (ok && hadKey) {
        if (descriptor) recordTransactionUndo(() => { Reflect.defineProperty(target, key, descriptor); });
        trigger(target, key);
        trigger(target, iterateKey);
      }
      return ok;
    },
    ownKeys(target) {
      trackProxySources(proxy);
      track(target, iterateKey);
      return Reflect.ownKeys(target);
    },
    has(target, key) {
      track(target, key);
      return Reflect.has(target, key);
    }
  });

  cacheProxy(reactiveTarget, options, parentSource, proxy);
  if (parentSource) {
    reactiveRawObjects.add(reactiveTarget);
    registerProxySource(proxy, parentSource);
  }
  return proxy;
}

function createParentSource(target: object, key: PropertyKey, options: ReactiveOptions): ReactiveRef {
  const optionKey = reactiveOptionsKey(options);
  let byKey = parentSourceCache.get(target);
  if (!byKey) parentSourceCache.set(target, byKey = new Map());
  let byOptions = byKey.get(key);
  if (!byOptions) byKey.set(key, byOptions = new WeakMap());
  const cached = byOptions.get(optionKey);
  if (cached) return cached;
  const source: ReactiveRef = {
          target,
          key,
          get() {
            track(target, key);
            const next = Reflect.get(target, key);
            if (isReactiveValue(next)) {
              const nextValue = next.get();
              return nextValue && typeof nextValue === "object"
                ? createReactive(unwrap(nextValue) as object, options, source)
                : nextValue;
            }
            return next && typeof next === "object"
              ? createReactive(unwrap(next) as object, options, source)
              : next;
          },
          set(value: unknown) {
            const previous = Reflect.get(target, key);
            const unwrapped = unwrap(value);
            if (!hasChanged(previous, unwrapped)) return;
            recordPropertyUndo(target, key);
            Reflect.set(target, key, unwrapped);
            trigger(target, key);
            if (isArrayStructureKey(target, key)) trigger(target, iterateKey);
          }
  };
  byOptions.set(optionKey, source);
  return source;
}

function getCachedProxy(raw: object, options: ReactiveOptions, source?: ReactiveRef): object | undefined {
  const optionKey = reactiveOptionsKey(options);
  if (!source) return rootProxyCache.get(raw)?.get(optionKey);
  const bySource = sourcedProxyCache.get(raw)?.get(optionKey);
  const exact = bySource?.get(source);
  if (exact) return exact;
  // Preserve item identity across keyed moves. A proxy may change paths only
  // after its old path no longer contains this raw value; simultaneous aliases
  // retain distinct path-specific proxies and therefore precise dependencies.
  if (bySource) {
    for (const [oldSource, proxy] of bySource) {
      if (unwrap(Reflect.get(oldSource.target, oldSource.key)) === raw) continue;
      bySource.delete(oldSource);
      bySource.set(source, proxy);
      proxySources.set(proxy, new Set([source]));
      proxyRefs.set(proxy, source);
      return proxy;
    }
  }
  return undefined;
}

function cacheProxy(raw: object, options: ReactiveOptions, source: ReactiveRef | undefined, proxy: object): void {
  const optionKey = reactiveOptionsKey(options);
  if (source) {
    let byOptions = sourcedProxyCache.get(raw);
    if (!byOptions) sourcedProxyCache.set(raw, byOptions = new WeakMap());
    let bySource = byOptions.get(optionKey);
    if (!bySource) byOptions.set(optionKey, bySource = new Map());
    bySource.set(source, proxy);
    return;
  }
  let byOptions = rootProxyCache.get(raw);
  if (!byOptions) rootProxyCache.set(raw, byOptions = new WeakMap());
  byOptions.set(optionKey, proxy);
}

function registerProxySource(proxy: object, source: ReactiveRef): void {
  proxySources.set(proxy, new Set([source]));
  // ref(value) is primarily used immediately after obtaining value from its
  // parent. Keep that exact path while property reads subscribe to every known
  // alias, preventing retained aliases from silently losing updates.
  proxyRefs.set(proxy, source);
}

function trackProxySources(proxy: object): void {
  for (const source of proxySources.get(proxy) ?? []) track(source.target, source.key);
}

function normalizeDescriptor(descriptor: PropertyDescriptor): PropertyDescriptor {
  return "value" in descriptor ? { ...descriptor, value: unwrap(descriptor.value) } : descriptor;
}

function samePropertyDescriptor(left: PropertyDescriptor | undefined, right: PropertyDescriptor): boolean {
  if (!left) return false;
  if ("value" in left !== "value" in right) return false;
  if (left.configurable !== right.configurable || left.enumerable !== right.enumerable) return false;
  if ("value" in left && "value" in right) {
    return left.writable === right.writable && !hasChanged(left.value, right.value);
  }
  return left.get === right.get && left.set === right.set;
}

function reactiveOptionsKey(options: ReactiveOptions): object {
  if (!options.readonly && !options.onReadonlyWrite && !options.passthroughKeys?.length) return defaultReactiveOptions;
  if (options.readonly && !options.onReadonlyWrite && !options.passthroughKeys?.length) return readonlyReactiveOptionsKey;
  return options as object;
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

function mutateArray(target: unknown[], methodName: string, method: Function, args: unknown[], receiver: unknown): unknown {
  if ((methodName === "push" || methodName === "pop") && method === Array.prototype[methodName]) {
    return mutateArrayEnd(target, methodName, method, args, receiver);
  }
  const previous = target.slice();
  recordArrayUndo(target);
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

function mutateArrayEnd(target: unknown[], methodName: "push" | "pop", method: Function, args: unknown[], receiver: unknown): unknown {
  const oldLength = target.length;
  const removed = methodName === "pop" && oldLength > 0
    ? Reflect.getOwnPropertyDescriptor(target, String(oldLength - 1))
    : undefined;
  if (hasActiveTransaction()) {
    recordTransactionUndo(() => {
      if (methodName === "push") {
        target.length = oldLength;
      } else if (oldLength > 0) {
        target.length = oldLength;
        if (removed) Reflect.defineProperty(target, String(oldLength - 1), removed);
        else Reflect.deleteProperty(target, String(oldLength - 1));
      }
    });
  }
  const result = method.apply(target, args.map(arg => unwrap(arg)));
  const newLength = target.length;
  if (newLength !== oldLength) {
    batch(() => {
      if (methodName === "push") {
        for (let index = oldLength; index < newLength; index++) trigger(target, String(index));
      } else {
        trigger(target, String(oldLength - 1));
      }
      trigger(target, "length");
      trigger(target, iterateKey);
    });
  }
  return result === target ? receiver : result;
}

function recordPropertyUndo(target: object, key: PropertyKey): void {
  if (!hasActiveTransaction()) return;
  recordTransactionUndo(createPropertyUndo(target, key));
}

function createPropertyUndo(target: object, key: PropertyKey): () => void {
  if (Array.isArray(target) && key === "length") return createArrayUndo(target);
  const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
  const arrayTarget = Array.isArray(target) ? target : undefined;
  const oldLength = arrayTarget?.length;
  return () => {
    if (descriptor) Reflect.defineProperty(target, key, descriptor);
    else Reflect.deleteProperty(target, key);
    if (oldLength !== undefined && arrayTarget && arrayTarget.length !== oldLength) arrayTarget.length = oldLength;
  };
}

function recordArrayUndo(target: unknown[]): void {
  if (!hasActiveTransaction()) return;
  recordTransactionUndo(createArrayUndo(target));
}

function createArrayUndo(target: unknown[]): () => void {
  const descriptors = new Map<PropertyKey, PropertyDescriptor>();
  for (const key of Reflect.ownKeys(target)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
    if (descriptor) descriptors.set(key, descriptor);
  }
  return () => {
    for (const key of Reflect.ownKeys(target)) if (key !== "length" && !descriptors.has(key)) Reflect.deleteProperty(target, key);
    const length = descriptors.get("length")?.value;
    if (typeof length === "number") target.length = length;
    for (const [key, descriptor] of descriptors) if (key !== "length") Reflect.defineProperty(target, key, descriptor);
  };
}
