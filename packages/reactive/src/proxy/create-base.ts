import { reactivePropertyTraps } from './property-mutations.js';
import { nativeArrayMember } from '../internal/native-operations.js';
import { requiresExactProxyValue } from './property-descriptors.js';
import { track } from '../internal/deps.js';

import { iterateKey, proxyMarker, rawTarget, reactiveProxyPolicy } from '../internal/symbols.js';

import { isReactive, isReactiveValue, unwrap } from '../internal/values.js';

import type { ReactiveOptions, ReactiveRef } from '../internal/types.js';

import { mutateArray } from '../arrays/mutation.js';
import { isReactiveContainer } from '../change-detection.js';
import { getCachedProxy, cacheProxy, reactiveOptionsKey, registerProxySource } from './cache.js';
import { customArrayMember } from './subclass-members.js';

import {
	mutatingArrayMethods,
	parentSourceCache,
	proxyRefs,
	reactiveRawObjects,
	type CachedParentSource
} from './state.js';

import type { ReactiveCollectionMember, ReactiveProxyRecord } from './capabilities.js';

type ReactiveProxyHandler = ProxyHandler<object> & {
	record: ReactiveProxyRecord;
};

/**
 * Retains alias-specific proxy ownership while sharing the trap code across every nested proxy.
 * A per-proxy record is required because one raw value may have several simultaneous parent paths.
 */
const reactiveProxyHandler: ProxyHandler<object> = {
	get(this: ReactiveProxyHandler, target: object, key: PropertyKey, receiver: object): unknown {
		if (key === proxyMarker) return true;
		if (key === rawTarget) return target;
		if (key === reactiveProxyPolicy) return this.record;

		const { collectionMember, options, proxy } = this.record;
		trackProxySources(proxy!);
		if (target instanceof Map || target instanceof Set) {
			if (!collectionMember)
				throw new TypeError('Compiled object/array state received a Map or Set value');
			return readCollectionMember(target, key, this.record);
		}
		const current = Reflect.get(target, key, Array.isArray(target) ? target : receiver);
		// Native iterators read object slots without consuming fields on their proxies.
		// Track sequence changes so a shared snapshot observes reordering and replacement.
		if (
			Array.isArray(target) &&
			(key === Symbol.iterator || key === 'values' || key === 'entries' || key === 'keys') &&
			current === nativeArrayMember(key)
		)
			track(target, iterateKey);
		if (current && typeof current === 'object' && requiresExactProxyValue(target, key))
			return current;
		if (
			Array.isArray(target) &&
			key !== 'constructor' &&
			typeof current === 'function' &&
			current !== nativeArrayMember(key)
		)
			return readArrayMember(target, receiver, current, key, this.record, true);
		if (Array.isArray(target) && mutatingArrayMethods.has(key) && typeof current === 'function') {
			return readArrayMember(target, receiver, current, key, this.record, false);
		}
		if (options.passthroughKeys?.includes(key)) {
			track(target, key);
			return current;
		}

		if (isReactiveValue(current)) {
			track(target, key);
			const currentValue = current.get();
			const currentTarget = unwrap(currentValue);
			return isReactiveContainer(currentTarget)
				? sourcedReactive(
						currentTarget,
						options,
						createParentSource(target, key, options, collectionMember),
						collectionMember
					)
				: currentTarget;
		}

		if (current && typeof current === 'object' && isReactiveContainer(unwrap(current))) {
			const currentTarget = unwrap(current) as object;
			if (currentTarget === target) {
				track(target, key);
				return receiver;
			}
			const source = createParentSource(target, key, options, collectionMember);
			return sourcedReactive(currentTarget, options, source, collectionMember);
		}

		track(target, key);
		return current;
	},

	...reactivePropertyTraps,

	ownKeys(this: ReactiveProxyHandler, target: object): ArrayLike<string | symbol> {
		trackProxySources(this.record.proxy!);
		track(target, iterateKey);
		return Reflect.ownKeys(target);
	},

	has(this: ReactiveProxyHandler, target: object, key: PropertyKey): boolean {
		track(target, key);
		return Reflect.has(target, key);
	}
};

/** Creates collection wrapping callbacks only when the receiver needs collection interception. */
function readCollectionMember(
	target: Map<unknown, unknown> | Set<unknown>,
	key: PropertyKey,
	record: ReactiveProxyRecord
): unknown {
	const { options, collectionMember, proxy } = record;
	return collectionMember!(target, key, proxy!, options, (current, dependency) => {
		if (!current || typeof current !== 'object' || !isReactiveContainer(unwrap(current)))
			return current;
		return sourcedReactive(
			unwrap(current) as object,
			options,
			dependency === undefined
				? undefined
				: createParentSource(target, dependency, options, collectionMember),
			collectionMember
		);
	});
}

/** Keeps method-specific closure contexts out of ordinary array and object property reads. */
function readArrayMember(
	target: unknown[],
	receiver: object,
	method: (...args: unknown[]) => unknown,
	key: PropertyKey,
	{ options, collectionMember }: ReactiveProxyRecord,
	custom: boolean
): unknown {
	if (custom)
		return customArrayMember(target, receiver, method, key, options, (result) => {
			const raw = unwrap(result);
			if (raw === target) return receiver;
			return raw && typeof raw === 'object' && isReactiveContainer(raw)
				? sourcedReactive(raw, options, undefined, collectionMember)
				: result;
		});
	return (...args: unknown[]) => mutateArray(target, String(key), method, args, receiver, options);
}

/** Creates a reactive with an explicitly selected collection capability. */
export function createReactiveBase(
	value: object,
	options: ReactiveOptions,
	parentSource?: ReactiveRef,
	collectionMember?: ReactiveCollectionMember
): object {
	const reactiveTarget = isReactive(value) ? (value as { [rawTarget]: object })[rawTarget] : value;
	const cached = getCachedProxy(reactiveTarget, options, parentSource);
	if (cached) {
		if (parentSource) registerProxySource(cached, parentSource);
		return cached;
	}

	// Keep ownership slots inline and give the handler only the record field it needs.
	const record: ReactiveProxyRecord = {
		options,
		collectionMember,
		forwardingSet: false,
		proxy: undefined
	};
	const handler = { __proto__: reactiveProxyHandler, record } as ReactiveProxyHandler;
	const proxy = new Proxy(reactiveTarget, handler);
	record.proxy = proxy;

	cacheProxy(reactiveTarget, options, parentSource, proxy);
	if (parentSource) {
		reactiveRawObjects.add(reactiveTarget);
		registerProxySource(proxy, parentSource);
	}
	return proxy;
}

/** Retains the receiving collection's reactive policy and parent path for an iterated value. */
export function wrapReactiveCollectionValue(
	receiver: object,
	current: unknown,
	dependency?: PropertyKey
): unknown {
	if (
		!isReactive(receiver) ||
		!current ||
		typeof current !== 'object' ||
		!isReactiveContainer(unwrap(current))
	)
		return current;
	const record = (receiver as { [reactiveProxyPolicy]: ReactiveProxyRecord })[reactiveProxyPolicy];
	const target = unwrap(receiver);
	return sourcedReactive(
		unwrap(current) as object,
		record.options,
		dependency === undefined
			? undefined
			: createParentSource(target, dependency, record.options, record.collectionMember),
		record.collectionMember
	);
}

function createParentSource(
	target: object,
	key: PropertyKey,
	options: ReactiveOptions,
	collectionMember?: ReactiveCollectionMember
): CachedParentSource {
	const optionKey = reactiveOptionsKey(options);
	let byKey = parentSourceCache.get(target);
	if (!byKey) parentSourceCache.set(target, (byKey = new Map()));
	let byOptions = byKey.get(key);
	if (!byOptions) byKey.set(key, (byOptions = new WeakMap()));
	const cached = byOptions.get(optionKey);
	if (cached) return cached;
	const source: CachedParentSource = {
		target,
		key,
		cachedRaw: undefined,
		cachedProxy: undefined,
		get() {
			track(target, key);
			const next = Reflect.get(target, key);
			if (isReactiveValue(next)) {
				const nextValue = next.get();
				return nextValue && typeof nextValue === 'object'
					? sourcedReactive(unwrap(nextValue) as object, options, source, collectionMember)
					: nextValue;
			}
			return next && typeof next === 'object'
				? sourcedReactive(unwrap(next) as object, options, source, collectionMember)
				: next;
		},
		set(value: unknown) {
			// Reuse the native property owner for normalization, descriptors, receivers and inverses.
			const receiver = createReactiveBase(target, options, undefined, collectionMember);
			if (!Reflect.set(receiver, key, value))
				throw new TypeError(`Cannot assign reactive state property ${String(key)}`);
		}
	};
	byOptions.set(optionKey, source);
	return source;
}

/** Reuses the child proxy most recently resolved through one stable parent path. */
function sourcedReactive(
	raw: object,
	options: ReactiveOptions,
	source?: CachedParentSource,
	collectionMember?: ReactiveCollectionMember
): object {
	if (!source) return createReactiveBase(raw, options, undefined, collectionMember);
	if (source.cachedRaw === raw && source.cachedProxy) {
		registerProxySource(source.cachedProxy, source);
		return source.cachedProxy;
	}
	const proxy = createReactiveBase(raw, options, source, collectionMember);
	source.cachedRaw = raw;
	source.cachedProxy = proxy;
	return proxy;
}

/** Observes the parent path owned by this proxy, including a migrated collection item. */
function trackProxySources(proxy: object): void {
	const source = proxyRefs.get(proxy);
	if (source) track(source.target, source.key);
}
