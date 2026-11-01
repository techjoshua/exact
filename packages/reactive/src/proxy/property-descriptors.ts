import { unwrap } from '../internal/values.js';
/** Unwraps replaceable data values while preserving native fixed-value and accessor invariants. */
export function normalizeDescriptor(
	descriptor: PropertyDescriptor,
	previous?: PropertyDescriptor
): PropertyDescriptor {
	const replaceable =
		(descriptor.configurable ?? previous?.configurable) ||
		(descriptor.writable ?? previous?.writable);
	return 'value' in descriptor && replaceable
		? { ...descriptor, value: unwrap(descriptor.value) }
		: descriptor;
}

/** Compares descriptor semantics before emitting a reactive write. */
export function samePropertyDescriptor(
	left: PropertyDescriptor | undefined,
	right: PropertyDescriptor | undefined
): boolean {
	if (!left || !right) return left === right;
	if ('value' in left !== 'value' in right) return false;
	if (left.configurable !== right.configurable || left.enumerable !== right.enumerable)
		return false;
	if ('value' in left && 'value' in right) {
		return left.writable === right.writable && Object.is(left.value, right.value);
	}
	return left.get === right.get && left.set === right.set;
}

/** Finds an own or inherited descriptor without invoking authored getters. */
export function propertyDescriptor(
	target: object,
	key: PropertyKey
): PropertyDescriptor | undefined {
	for (let owner: object | null = target; owner; owner = Reflect.getPrototypeOf(owner)) {
		const descriptor = Reflect.getOwnPropertyDescriptor(owner, key);
		if (descriptor) return descriptor;
	}
	return undefined;
}

/** Preserves ECMAScript invariants for frozen object-valued data properties. */
export function requiresExactProxyValue(target: object, key: PropertyKey): boolean {
	const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
	return !!descriptor && 'value' in descriptor && !descriptor.configurable && !descriptor.writable;
}

/** Caller-owned result cell avoids a result wrapper for each own-property read. */
export type ReactiveOwnPropertyReadCell = { value: unknown };

/** Reads an own field into a caller-owned cell without invoking an arbitrary accessor. */
export function readReactiveOwnPropertyInto(
	value: object,
	key: PropertyKey,
	cell: ReactiveOwnPropertyReadCell
): boolean {
	const descriptor = Object.getOwnPropertyDescriptor(value, key);
	if (descriptor && 'value' in descriptor) {
		cell.value = descriptor.value;
		return true;
	}
	cell.value = undefined;
	return false;
}

/** Reads an own field without invoking an arbitrary user-defined accessor. */
export function readReactiveOwnProperty(
	value: object,
	key: PropertyKey
): { present: true; value: unknown } | { present: false } {
	const cell: ReactiveOwnPropertyReadCell = { value: undefined };
	return readReactiveOwnPropertyInto(value, key, cell)
		? { present: true, value: cell.value }
		: { present: false };
}
