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
