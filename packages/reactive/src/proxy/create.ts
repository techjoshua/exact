import { hasActiveTransaction, recordTransactionUndo, track, trigger } from '../internal/deps.js';

import { markReactiveHashDirty } from '../internal/keyed-collections.js';

import { iterateKey, proxyMarker, rawTarget } from '../internal/symbols.js';

import { isArrayStructureKey } from '../internal/objects.js';
import { isReactive, isReactiveValue, unwrap } from '../internal/values.js';

import type { ReactiveOptions, ReactiveRef } from '../internal/types.js';

import { createPropertyUndo, mutateArray, recordPropertyUndo } from '../array-mutation.js';
import { hasChanged, isReactiveContainer } from '../change-detection.js';
import { reactiveCollectionMember } from './collections.js';

import {
	defaultReactiveOptions,
	mutatingArrayMethods,
	parentSourceCache,
	proxyRefs,
	proxySources,
	reactiveRawObjects,
	readonlyReactiveOptionsKey,
	rootProxyCache,
	sourcedProxyCache
} from './state.js';

/** Creates a reactive. */
export function createReactive(
	value: object,
	options: ReactiveOptions,
	parentSource?: ReactiveRef
): object {
	const reactiveTarget = isReactive(value) ? (value as { [rawTarget]: object })[rawTarget] : value;
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
			if (target instanceof Map || target instanceof Set) {
				return reactiveCollectionMember(target, key, proxy, options, (current, dependency) => {
					if (!current || typeof current !== 'object' || !isReactiveContainer(unwrap(current)))
						return current;
					return createReactive(
						unwrap(current) as object,
						options,
						dependency === undefined ? undefined : createParentSource(target, dependency, options)
					);
				});
			}
			const current = Reflect.get(target, key, receiver);
			if (Array.isArray(target) && mutatingArrayMethods.has(key) && typeof current === 'function') {
				return (...args: unknown[]) =>
					mutateArray(target, String(key), current, args, receiver, options);
			}
			if (options.passthroughKeys?.includes(key)) {
				track(target, key);
				return current;
			}

			if (isReactiveValue(current)) {
				track(target, key);
				const currentValue = current.get();
				return currentValue && typeof currentValue === 'object'
					? createReactive(
							unwrap(currentValue) as object,
							options,
							createParentSource(target, key, options)
						)
					: currentValue;
			}

			if (current && typeof current === 'object' && isReactiveContainer(unwrap(current))) {
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
			const removedIndexes =
				Array.isArray(target) &&
				key === 'length' &&
				typeof next === 'number' &&
				next < target.length
					? Array.from({ length: target.length - next }, (_, offset) => next + offset).filter(
							(index) => Reflect.has(target, index)
						)
					: [];
			const previous = Reflect.get(target, key, receiver);
			const unwrapped = unwrap(next);
			const hadKey = Object.prototype.hasOwnProperty.call(target, key);
			const changed = hasChanged(previous, unwrapped);
			// If structural equality suppresses notification it must also suppress
			// replacement. Otherwise direct reads observe a new identity while
			// existing computed values legitimately retain the old one.
			const ownDescriptor = Reflect.getOwnPropertyDescriptor(target, key);
			if (!changed && ownDescriptor && 'value' in ownDescriptor) return true;
			const undo = hasActiveTransaction() ? createPropertyUndo(target, key) : undefined;
			forwardingSet = true;
			let ok: boolean;
			try {
				ok = Reflect.set(target, key, unwrapped, receiver);
			} finally {
				forwardingSet = false;
			}
			if (ok && undo && (!hadKey || !Object.is(previous, Reflect.get(target, key, receiver))))
				recordTransactionUndo(undo, target, key);
			if (ok && changed) {
				markReactiveHashDirty(target);
				trigger(target, key);
				for (const index of removedIndexes) trigger(target, String(index));
				if (
					previousLength !== undefined &&
					Array.isArray(target) &&
					target.length !== previousLength &&
					key !== 'length'
				)
					trigger(target, 'length');
				if (!hadKey || isArrayStructureKey(target, key)) trigger(target, iterateKey);
				notifyMutation(options, key, 'set');
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
			if (undo) recordTransactionUndo(undo, target, key);
			markReactiveHashDirty(target);
			trigger(target, key);
			if (!previous || isArrayStructureKey(target, key)) trigger(target, iterateKey);
			if (oldLength !== undefined && (target as unknown[]).length !== oldLength && key !== 'length')
				trigger(target, 'length');
			notifyMutation(options, key, 'define');
			return true;
		},
		deleteProperty(target, key) {
			if (options.readonly) {
				options.onReadonlyWrite?.(key);
				return false;
			}

			const hadKey = Object.prototype.hasOwnProperty.call(target, key);
			const descriptor =
				hadKey && hasActiveTransaction()
					? Reflect.getOwnPropertyDescriptor(target, key)
					: undefined;
			const ok = Reflect.deleteProperty(target, key);
			if (ok && hadKey) {
				if (descriptor)
					recordTransactionUndo(
						() => {
							Reflect.defineProperty(target, key, descriptor);
						},
						target,
						key
					);
				markReactiveHashDirty(target);
				trigger(target, key);
				trigger(target, iterateKey);
				notifyMutation(options, key, 'delete');
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

function createParentSource(
	target: object,
	key: PropertyKey,
	options: ReactiveOptions
): ReactiveRef {
	const optionKey = reactiveOptionsKey(options);
	let byKey = parentSourceCache.get(target);
	if (!byKey) parentSourceCache.set(target, (byKey = new Map()));
	let byOptions = byKey.get(key);
	if (!byOptions) byKey.set(key, (byOptions = new WeakMap()));
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
				return nextValue && typeof nextValue === 'object'
					? createReactive(unwrap(nextValue) as object, options, source)
					: nextValue;
			}
			return next && typeof next === 'object'
				? createReactive(unwrap(next) as object, options, source)
				: next;
		},
		set(value: unknown) {
			const previous = Reflect.get(target, key);
			const unwrapped = unwrap(value);
			if (!hasChanged(previous, unwrapped)) return;
			recordPropertyUndo(target, key);
			Reflect.set(target, key, unwrapped);
			markReactiveHashDirty(target);
			trigger(target, key);
			if (isArrayStructureKey(target, key)) trigger(target, iterateKey);
		}
	};
	byOptions.set(optionKey, source);
	return source;
}

function getCachedProxy(
	raw: object,
	options: ReactiveOptions,
	source?: ReactiveRef
): object | undefined {
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

function cacheProxy(
	raw: object,
	options: ReactiveOptions,
	source: ReactiveRef | undefined,
	proxy: object
): void {
	const optionKey = reactiveOptionsKey(options);
	if (source) {
		let byOptions = sourcedProxyCache.get(raw);
		if (!byOptions) sourcedProxyCache.set(raw, (byOptions = new WeakMap()));
		let bySource = byOptions.get(optionKey);
		if (!bySource) byOptions.set(optionKey, (bySource = new Map()));
		bySource.set(source, proxy);
		return;
	}
	let byOptions = rootProxyCache.get(raw);
	if (!byOptions) rootProxyCache.set(raw, (byOptions = new WeakMap()));
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
	return 'value' in descriptor ? { ...descriptor, value: unwrap(descriptor.value) } : descriptor;
}

function samePropertyDescriptor(
	left: PropertyDescriptor | undefined,
	right: PropertyDescriptor
): boolean {
	if (!left) return false;
	if ('value' in left !== 'value' in right) return false;
	if (left.configurable !== right.configurable || left.enumerable !== right.enumerable)
		return false;
	if ('value' in left && 'value' in right) {
		return left.writable === right.writable && !hasChanged(left.value, right.value);
	}
	return left.get === right.get && left.set === right.set;
}

function reactiveOptionsKey(options: ReactiveOptions): object {
	if (
		!options.readonly &&
		!options.onReadonlyWrite &&
		!options.onMutation &&
		!options.passthroughKeys?.length
	)
		return defaultReactiveOptions;
	if (
		options.readonly &&
		!options.onReadonlyWrite &&
		!options.onMutation &&
		!options.passthroughKeys?.length
	)
		return readonlyReactiveOptionsKey;
	return options as object;
}

function notifyMutation(
	options: ReactiveOptions,
	key: PropertyKey | undefined,
	operation: string
): void {
	try {
		options.onMutation?.(key, operation);
	} catch {
		// Observation is deliberately outside application error propagation.
	}
}
