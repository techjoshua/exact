import { reactiveProxyOptions } from '../proxy/collection-publication.js';
import { unwrap } from '../internal/values.js';
/** Rejects assignments that native descriptors or receiver extensibility would prohibit before staging. */
export function assertPendingPropertyAssignable(target: object, key: PropertyKey): void {
	let owner: object | null = target;
	while (owner) {
		const descriptor = Reflect.getOwnPropertyDescriptor(owner, key);
		if (descriptor) {
			if ('value' in descriptor ? !descriptor.writable : !descriptor.set)
				throw new TypeError('Cannot assign task state property');
			if (owner === target || !('value' in descriptor)) return;
			break;
		}
		owner = Reflect.getPrototypeOf(owner);
	}
	if (!Reflect.isExtensible(target)) throw new TypeError('Cannot extend task state');
}

/** Recognizes canonical own Array indices, excluding the length sentinel. */
export function pendingArrayIndex(key: PropertyKey): number | undefined {
	if (typeof key !== 'string') return undefined;
	const index = Number(key);
	return Number.isInteger(index) && index >= 0 && index < 0xffff_ffff && String(index) === key
		? index
		: undefined;
}

export { nativePropertyKey as pendingPropertyKey } from '../internal/property-key.js';

/** Reads the inherited fallback after a pending own-property removal without invoking the removed getter. */
export function pendingInheritedRead(target: object, key: PropertyKey): unknown {
	const prototype = Reflect.getPrototypeOf(unwrap(target));
	return prototype ? Reflect.get(prototype, key, target) : undefined;
}

/** Rejects readonly aliases before callbacks or private publishers can produce side effects. */
export function assertPendingWritable(target: object, key: PropertyKey): void {
	const policy = reactiveProxyOptions(target);
	if (policy?.readonly) {
		policy.onReadonlyWrite?.(key);
		throw new TypeError('Cannot write through readonly pending state');
	}
}

/** Rejects uncompiled class accessors before execution because a facade cannot preserve private brands. */
export function assertPendingAccessorReceiver(target: object, key: PropertyKey): void {
	const prototype = Reflect.getPrototypeOf(target);
	if (prototype !== Object.prototype && prototype !== null)
		throw new TypeError(
			`Pending member ${String(key)} requires a compiled companion to preserve class private brands`
		);
}
