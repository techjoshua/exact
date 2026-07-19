import type { ReactiveOptions, ReactiveRef } from '../internal/types.js';

export function conflictingListKeyError(left: string, right: string): Error {
	const sites = [left, right].sort();
	return new Error(
		`Conflicting this.map() key extractors for the same collection (${sites[0]} and ${sites[1]}). A reactive collection must have one stable key contract.`
	);
}

export const defaultReactiveOptions: ReactiveOptions = Object.freeze({});
export const readonlyReactiveOptionsKey = Object.freeze({ readonly: true });
export const rootProxyCache = new WeakMap<object, WeakMap<object, object>>();
export const sourcedProxyCache = new WeakMap<object, WeakMap<object, Map<ReactiveRef, object>>>();
export const parentSourceCache = new WeakMap<
	object,
	Map<PropertyKey, WeakMap<object, ReactiveRef>>
>();
export const proxyRefs = new WeakMap<object, ReactiveRef>();
export const proxySources = new WeakMap<object, Set<ReactiveRef>>();
export const reactiveRawObjects = new WeakSet<object>();
interface ListKeyRegistration {
	key: (item: unknown) => string;
	signature: string;
	site: string;
	references: number;
}

export const listKeyExtractors = new WeakMap<object, ListKeyRegistration>();
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
