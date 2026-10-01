import { unwrap } from '../internal/values.js';
import { hasChanged } from '../change-detection.js';
/** Unwraps data values while preserving accessor descriptors. */
export function normalizeDescriptor(descriptor: PropertyDescriptor): PropertyDescriptor {
	return 'value' in descriptor ? { ...descriptor, value: unwrap(descriptor.value) } : descriptor;
}

/** Compares descriptor semantics before emitting a reactive write. */
export function samePropertyDescriptor(
	left: PropertyDescriptor | undefined,
	right: PropertyDescriptor
): boolean {
	if (!left) return false;
	if ('value' in left !== 'value' in right) return false;
	if (left.configurable !== right.configurable || left.enumerable !== right.enumerable)
		return false;
	if ('value' in left && 'value' in right) {
		return left.writable === right.writable && !hasChanged(left.value, right.value);
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
