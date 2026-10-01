import type { ReactiveOptions, ReactiveRef } from '../internal/types.js';
import { unwrap } from '../internal/values.js';
import {
	defaultReactiveOptions,
	readonlyReactiveOptionsKey,
	rootProxyCache,
	sourcedProxyCache,
	proxyRefs
} from './state.js';

/** Reuses a proxy only when its parent ownership and option policy agree. */
export function getCachedProxy(
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
			proxyRefs.set(proxy, source);
			return proxy;
		}
	}
	return undefined;
}

/** Retains the proxy under its option policy and optional parent ownership. */
export function cacheProxy(
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

/** Shares ordinary option policies while keeping custom capability records isolated. */
export function reactiveOptionsKey(options: ReactiveOptions): object {
	if ('__exactCollectionCacheMode' in options) return options as object;
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
