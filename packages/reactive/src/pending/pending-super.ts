import { unwrap } from '../internal/values.js';
import { pendingPropertyDescriptor } from './pending-reflection.js';
import {
	isPendingNativeCollectionSize,
	type PendingCollectionContext
} from './pending-collections.js';
import type { PendingReactiveState } from './pending-state-contract.js';
import { pendingReactiveHelperVariant } from './helper-variants.js';
import { assertPendingAccessorReceiver } from './pending-property-policy.js';

/** Supplies inherited selections with the same ownership, native deltas and journal as direct accesses. */
interface PendingSuperContext extends PendingReactiveState, PendingCollectionContext {
	owns(value: object): boolean;
	write<Value>(target: object, key: PropertyKey, value: Value, data?: boolean): Value;
}

/** Reads from the original method home object, including native membership and compiled branded getters. */
export function readPendingSuper(
	context: PendingSuperContext,
	home: object | undefined,
	target: object,
	key: PropertyKey
): unknown {
	if (!home) throw new TypeError('Pending super access requires a compiled method home object');
	const base = Object.getPrototypeOf(home) as object | null;
	if (!base) throw new TypeError('Cannot read a null super prototype');
	const raw = unwrap(target);
	const descriptor = pendingPropertyDescriptor(base, key);
	if (descriptor?.get) {
		if (
			isPendingNativeCollectionSize(raw, key, descriptor.get) &&
			context.owns(target) &&
			!context.publishing
		)
			return context.collection(raw as Map<unknown, unknown> | Set<unknown>).size;
		if (
			context.owns(target) &&
			!pendingReactiveHelperVariant(descriptor.get) &&
			!isPendingNativeCollectionSize(raw, key, descriptor.get)
		)
			assertPendingAccessorReceiver(raw, key);
		return context.retain(context.helper(descriptor.get, target)());
	}
	return context.retain(Reflect.get(base, key, raw));
}

/** Preserves inherited setter selection without invoking a shadowing setter on the receiver. */
export function writePendingSuper<Value>(
	context: PendingSuperContext,
	home: object | undefined,
	target: object,
	key: PropertyKey,
	value: Value
): Value {
	if (!home) throw new TypeError('Pending super access requires a compiled method home object');
	const base = Object.getPrototypeOf(home) as object | null;
	if (!base) throw new TypeError('Cannot write a null super prototype');
	const raw = unwrap(target);
	if (!context.owns(target)) {
		if (!Reflect.set(base, key, value, raw)) throw new TypeError('Cannot assign super property');
		return value;
	}
	context.assertCurrent();
	context.checkCollectionWrite(target, key);
	const selected = pendingPropertyDescriptor(base, key);
	if (selected && !('value' in selected)) {
		if (!selected.set) throw new TypeError('Cannot assign super property without a setter');
		if (!pendingReactiveHelperVariant(selected.set)) assertPendingAccessorReceiver(raw, key);
		context.helper(selected.set, target)(value);
		return value;
	}
	const own = Object.getOwnPropertyDescriptor(raw, key);
	if (
		selected?.writable === false ||
		(own && (!('value' in own) || !own.writable)) ||
		(!own && !Object.isExtensible(raw))
	)
		throw new TypeError('Cannot assign super property');
	return context.write(target, key, value, true);
}
