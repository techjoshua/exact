import { nativeCallable, nativeReceiverKind } from '../internal/native-operations.js';
import { unwrap } from '../internal/values.js';
import { applyNativeReactiveCollection } from '../proxy/collection-publication.js';
import { assertPendingWritable } from './pending-property-policy.js';
import { pendingPropertyDescriptor } from './pending-reflection.js';
import { hasPendingReactiveHelperHome, pendingReactiveHelperVariant } from './helper-variants.js';
import type { PendingReactiveState } from './pending-state-contract.js';

/** Keeps external reads ordinary while compiled accessors retain invocation-owned captures. */
export function readUnownedPendingProperty(
	context: PendingReactiveState,
	receiver: object,
	key: PropertyKey
): unknown {
	if (!hasPendingReactiveHelperHome(unwrap(receiver))) return Reflect.get(receiver, key);
	const descriptor = pendingPropertyDescriptor(unwrap(receiver), key);
	return descriptor?.get && pendingReactiveHelperVariant(descriptor.get)
		? context.helper(descriptor.get, receiver)()
		: Reflect.get(receiver, key);
}

/** Executes external storage immediately while preserving its reactive alias and native brands. */
export function selectUnownedPendingMethod(
	receiver: object,
	key: PropertyKey,
	selected?: unknown
): (...args: unknown[]) => unknown {
	const operation = selected ?? Reflect.get(receiver, key);
	const raw = unwrap(receiver);
	if (
		(raw instanceof Map || raw instanceof Set) &&
		operation === nativeCallable(nativeReceiverKind(raw)!, key)
	)
		return (...args) => applyNativeReactiveCollection(receiver, key, args);
	return (...args) => Reflect.apply(operation, receiver, args);
}

/** Writes external storage without acquiring publication ownership, honoring the selected alias. */
export function writeUnownedPendingProperty<Value>(
	receiver: object,
	key: PropertyKey,
	value: Value,
	context?: PendingReactiveState
): Value {
	assertPendingWritable(receiver, key);
	const descriptor =
		context && hasPendingReactiveHelperHome(unwrap(receiver))
			? pendingPropertyDescriptor(unwrap(receiver), key)
			: undefined;
	if (context && descriptor?.set && pendingReactiveHelperVariant(descriptor.set)) {
		context.helper(descriptor.set, receiver)(value);
		return value;
	}
	if (!Reflect.set(receiver, key, value)) throw new TypeError('Cannot assign property');
	return value;
}

/** Deletes external storage immediately, preserving readonly policy and native reflection results. */
export function removeUnownedPendingProperty(receiver: object, key: PropertyKey): boolean {
	assertPendingWritable(receiver, key);
	return Reflect.deleteProperty(receiver, key);
}
