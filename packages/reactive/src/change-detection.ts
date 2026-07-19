import { hasChanged as hasStructurallyChanged } from './internal/equality.js';
import { isPlainObject } from './internal/objects.js';
import { isReactiveValue, unwrap } from './internal/values.js';

/** Compares values after unwrapping reactive containers. */
export function hasChanged(previous: unknown, next: unknown): boolean {
	return hasStructurallyChanged(previous, next, unwrap);
}

/** Identifies objects whose nested structure can participate in reactive reconciliation. */
export function isReactiveContainer(value: unknown): value is object {
	return Array.isArray(value) || isPlainObject(value);
}

/** Detects replacement of reactive value identities. */
export function reactiveValueChanged(previous: unknown, next: unknown): boolean {
	return (isReactiveValue(previous) || isReactiveValue(next)) && !Object.is(previous, next);
}
