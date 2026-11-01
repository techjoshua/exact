import { reactiveValueMarker, reactiveValueRef } from './internal/symbols.js';
import type { ComputedInspection, ReactiveRef, ReactiveValue } from './internal/types.js';

const computedValues = new WeakMap<object, { inspect(): ComputedInspection }>();

/** Builds the public read-only facade without exposing the computation graph's owner. */
export function createComputedValue<T>(
	node: ReactiveRef<T> & { inspect(): ComputedInspection }
): ReactiveValue<T> & object {
	const value = {
		[reactiveValueMarker]: true,
		[reactiveValueRef]: node,
		get: () => node.get(),
		toJSON: readComputedValue,
		toString: computedValueToString,
		valueOf: readComputedValue,
		[Symbol.toPrimitive]: readComputedValue
	} as ReactiveValue<T> & object;
	computedValues.set(value, node);
	return value;
}

/** Returns bounded graph state for tooling without exposing computed values or source text. */
export function inspectComputed(value: ReactiveValue): ComputedInspection | undefined {
	return computedValues.get(value as object)?.inspect();
}

function readComputedValue<T>(this: ReactiveValue<T>): T {
	return this.get();
}

function computedValueToString(this: ReactiveValue): string {
	return String(this.get());
}
