import { notifyMutation } from '../internal/mutation-observation.js';
import { nativeArrayMember } from '../internal/native-operations.js';
import {
	normalizeDescriptor,
	samePropertyDescriptor,
	propertyDescriptor,
	requiresExactProxyValue
} from './property-descriptors.js';
import { hasActiveTransaction, recordTransactionUndo, track, trigger } from '../internal/deps.js';

import { markReactiveHashDirty } from '../internal/keyed-collections.js';

import {
	arrayLengthWriteKey,
	iterateKey,
	proxyMarker,
	rawTarget,
	reactiveProxyPolicy
} from '../internal/symbols.js';

import { isArrayStructureKey } from '../internal/objects.js';
import { isReactive, isReactiveValue, unwrap } from '../internal/values.js';

import type { ReactiveOptions, ReactiveRef } from '../internal/types.js';

import {
	createPropertyUndo,
	mutateArray,
	recordPropertyUndo,
	truncatedArrayIndexes
} from '../arrays/mutation.js';
import { hasChanged, isReactiveContainer } from '../change-detection.js';
import { getCachedProxy, cacheProxy, reactiveOptionsKey, registerProxySource } from './cache.js';
import { customArrayMember, writeProxyAccessor } from './subclass-members.js';

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

	set(
		this: ReactiveProxyHandler,
		target: object,
		key: PropertyKey,
		next: unknown,
		receiver: object
	): boolean {
		const { options } = this.record;
		if (options.readonly) {
			options.onReadonlyWrite?.(key);
			return false;
		}

		const previousLength = Array.isArray(target) ? target.length : undefined;
		const removedIndexes =
			Array.isArray(target) && key === 'length' && typeof next === 'number' && next < target.length
				? truncatedArrayIndexes(target, next)
				: undefined;
		const descriptor = propertyDescriptor(target, key);
		if (descriptor && !('value' in descriptor)) {
			const ok = writeProxyAccessor(target, key, next, receiver, this.record);
			if (ok) {
				markReactiveHashDirty(target);
				trigger(target, key);
			}
			return ok;
		}
		const previous = Reflect.get(target, key, receiver);
		const unwrapped = unwrap(next);
		const hadKey = Object.prototype.hasOwnProperty.call(target, key);
		const changed = hasChanged(previous, unwrapped);
		if (!changed) {
			const ownDescriptor = Reflect.getOwnPropertyDescriptor(target, key);
			if (ownDescriptor && 'value' in ownDescriptor) {
				if (Array.isArray(target) && key === 'length') trigger(target, arrayLengthWriteKey);
				return true;
			}
		}
		const undo = hasActiveTransaction() ? createPropertyUndo(target, key) : undefined;
		this.record.forwardingSet = true;
		let ok: boolean;
		try {
			ok = Reflect.set(target, key, unwrapped, receiver);
		} finally {
			this.record.forwardingSet = false;
		}
		if (ok && undo && (!hadKey || !Object.is(previous, Reflect.get(target, key, receiver))))
			recordTransactionUndo(
				undo,
				Array.isArray(target) && key === 'length' ? undefined : target,
				key
			);
		// Creating an own key changes structure even when its inherited or missing value is unchanged.
		if (ok && (changed || !hadKey)) {
			if (Array.isArray(target) && key === 'length') trigger(target, arrayLengthWriteKey);
			markReactiveHashDirty(target);
			trigger(target, key);
			if (removedIndexes) for (const index of removedIndexes) trigger(target, String(index));
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

	defineProperty(
		this: ReactiveProxyHandler,
		target: object,
		key: PropertyKey,
		descriptor: PropertyDescriptor
	): boolean {
		const { options } = this.record;
		if (this.record.forwardingSet) return Reflect.defineProperty(target, key, descriptor);
		if (options.readonly) {
			options.onReadonlyWrite?.(key);
			return false;
		}
		const previous = Reflect.getOwnPropertyDescriptor(target, key);
		if (samePropertyDescriptor(previous, descriptor)) {
			if (Array.isArray(target) && key === 'length' && 'value' in descriptor)
				trigger(target, arrayLengthWriteKey);
			return true;
		}
		const undo = hasActiveTransaction() ? createPropertyUndo(target, key) : undefined;
		const oldLength = Array.isArray(target) ? target.length : undefined;
		const previousIndexes =
			Array.isArray(target) && key === 'length' ? Object.keys(target) : undefined;
		const ok = Reflect.defineProperty(target, key, normalizeDescriptor(descriptor));
		if (!ok) return false;
		if (Array.isArray(target) && key === 'length') {
			trigger(target, arrayLengthWriteKey);
			for (const index of previousIndexes ?? [])
				if (!Reflect.has(target, index)) trigger(target, index);
		}
		if (undo)
			recordTransactionUndo(
				undo,
				Array.isArray(target) && key === 'length' ? undefined : target,
				key
			);
		markReactiveHashDirty(target);
		trigger(target, key);
		if (!previous || isArrayStructureKey(target, key)) trigger(target, iterateKey);
		if (oldLength !== undefined && (target as unknown[]).length !== oldLength && key !== 'length')
			trigger(target, 'length');
		notifyMutation(options, key, 'define');
		return true;
	},

	deleteProperty(this: ReactiveProxyHandler, target: object, key: PropertyKey): boolean {
		const { options } = this.record;
		if (options.readonly) {
			options.onReadonlyWrite?.(key);
			return false;
		}

		const hadKey = Object.prototype.hasOwnProperty.call(target, key);
		const descriptor =
			hadKey && hasActiveTransaction() ? Reflect.getOwnPropertyDescriptor(target, key) : undefined;
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
