import { proxyMarker, rawTarget, reactiveValueMarker, type reactiveValueRef } from './symbols.js';
import type { ReactiveRef, ReactiveValue } from './types.js';

/** Returns whether a value is an eXact reactive-value wrapper. */
export function isReactiveValue(
	value: unknown
): value is ReactiveValue & { [reactiveValueRef]: ReactiveRef } {
	return !!value && typeof value === 'object' && reactiveValueMarker in value;
}

/** Returns whether a value is an eXact reactive proxy. */
export function isReactive(value: unknown): boolean {
	return (
		!!value &&
		typeof value === 'object' &&
		Boolean((value as { [proxyMarker]?: boolean })[proxyMarker])
	);
}

/**
 * Returns the raw value behind a reactive proxy or reactive-value wrapper.
 *
 * Reactive-value reads remain tracked; proxy unwrapping only removes the proxy
 * layer and does not recursively clone descendants.
 */
export function unwrap<T>(value: T): T {
	if (isReactiveValue(value)) return value.get() as T;
	if (isReactive(value)) return (value as { [rawTarget]: T })[rawTarget];
	return value;
}

/** Rejects mutation through a readonly reactive-value reference. */
export function rejectReadonlyReactiveValueWrite(): never {
	throw new TypeError('Cannot write to readonly reactive value');
}
