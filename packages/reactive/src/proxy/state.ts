import type { ReactiveOptions, ReactiveRef } from '../internal/types.js';

/** Performs the conflicting list key error domain operation. */
export function conflictingListKeyError(left: string, right: string): Error {
	const sites = [left, right].sort();
	return new Error(
		`Conflicting this.map() key extractors for the same collection (${sites[0]} and ${sites[1]}). A reactive collection must have one stable key contract.`
	);
}

/** Provides the canonical default reactive options value. */
export const defaultReactiveOptions: ReactiveOptions = Object.freeze({});
/** Provides the canonical readonly reactive options key value. */
export const readonlyReactiveOptionsKey = Object.freeze({ readonly: true });
/** Provides the canonical root proxy cache value. */
export const rootProxyCache = new WeakMap<object, WeakMap<object, object>>();
/** Provides the canonical sourced proxy cache value. */
export const sourcedProxyCache = new WeakMap<object, WeakMap<object, Map<ReactiveRef, object>>>();
/** Provides the canonical parent source cache value. */
export const parentSourceCache = new WeakMap<
	object,
	Map<PropertyKey, WeakMap<object, ReactiveRef>>
>();
/** Provides the canonical proxy refs value. */
export const proxyRefs = new WeakMap<object, ReactiveRef>();
/** Provides the canonical proxy sources value. */
export const proxySources = new WeakMap<object, Set<ReactiveRef>>();
/** Provides the canonical reactive raw objects value. */
export const reactiveRawObjects = new WeakSet<object>();
interface ListKeyRegistration {
	key: (item: unknown) => string;
	signature: string;
	site: string;
	references: number;
}

/** Provides the canonical list key extractors value. */
export const listKeyExtractors = new WeakMap<object, ListKeyRegistration>();
/** Provides the canonical mutating array methods value. */
export const mutatingArrayMethods = new Set<PropertyKey>([
	'copyWithin',
	'fill',
	'pop',
	'push',
	'reverse',
	'shift',
	'sort',
	'splice',
	'unshift'
]);
