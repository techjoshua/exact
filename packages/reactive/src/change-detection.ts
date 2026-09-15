import { hasChanged as hasStructurallyChanged } from './internal/equality.js';
import { isPlainObject } from './internal/objects.js';
import { isReactive, isReactiveValue, unwrap } from './internal/values.js';

const exactOpaqueOperationIdentity = Symbol.for('@exactjs/opaque-target-operation');

/** Compares values after unwrapping reactive containers. */
export function hasChanged(previous: unknown, next: unknown): boolean {
	return hasStructurallyChanged(previous, next, unwrap);
}

/** Compares computed results without treating distinct live references as interchangeable. */
export function hasComputedResultChanged(previous: unknown, next: unknown): boolean {
	// Consumers must move their field subscriptions when a selection changes to another proxy,
	// even if its current fields are equal. Plain calculated results retain structural equality.
	return isReactive(previous) || isReactive(next)
		? !Object.is(previous, next)
		: hasChanged(previous, next);
}

/** Identifies objects whose nested structure can participate in reactive reconciliation. */
export function isReactiveContainer(value: unknown): value is object {
	if (
		value &&
		typeof value === 'object' &&
		Object.prototype.hasOwnProperty.call(value, exactOpaqueOperationIdentity)
	)
		return false;
	return (
		Array.isArray(value) || value instanceof Map || value instanceof Set || isPlainObject(value)
	);
}

/** Detects replacement of reactive value identities. */
export function reactiveValueChanged(previous: unknown, next: unknown): boolean {
	return (isReactiveValue(previous) || isReactiveValue(next)) && !Object.is(previous, next);
}
