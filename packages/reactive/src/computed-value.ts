import { reactiveValueMarker, reactiveValueRef } from './internal/symbols.js';
import type { ReactiveRef, ReactiveValue } from './internal/types.js';

/** Builds the public read-only facade without exposing the computation graph's owner. */
export function createComputedValue<T>(node: ReactiveRef<T>): ReactiveValue<T> & object {
	return {
		[reactiveValueMarker]: true,
		[reactiveValueRef]: node,
		get: () => node.get(),
		toJSON: readComputedValue,
		toString: computedValueToString,
		valueOf: readComputedValue,
		[Symbol.toPrimitive]: readComputedValue
	} as ReactiveValue<T> & object;
}

function readComputedValue<T>(this: ReactiveValue<T>): T {
	return this.get();
}

function computedValueToString(this: ReactiveValue): string {
	return String(this.get());
}
