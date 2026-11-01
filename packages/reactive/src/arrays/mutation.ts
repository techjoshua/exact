import { notifyMutation } from '../internal/mutation-observation.js';
import { samePropertyDescriptor, propertyDescriptor } from '../proxy/property-descriptors.js';
import { captureArrayOrder, recordArrayReorder } from './reordering.js';
import {
	hasArrayPositions,
	arrayPosition,
	arrayPositionKey,
	arrayPropertyAddress,
	isArrayPosition,
	isUsableArrayPosition
} from './positions.js';
import { mutateArraySequence, supportsSequenceTracking } from './sequence-mutation.js';
import { arrayIndex, createPropertyUndo } from './property-undo.js';
export { createPropertyUndo } from './property-undo.js';
import {
	batch,
	hasActiveTransaction,
	recordTransactionUndo,
	readOwnershipVersion,
	notifyReactiveDependency,
	type MutationRestoration,
	trigger
} from '../internal/deps.js';

import { markReactiveHashDirty } from '../internal/keyed-collections.js';

import { arrayLengthWriteKey, iterateKey } from '../internal/symbols.js';
import { unwrap } from '../internal/values.js';
import type { ReactiveOptions } from '../internal/types.js';

/** Captures removed existing slots before a truncation, preserving native coercion and probe order. */
export function truncatedArrayIndexes(target: unknown[], next: number): number[] {
	return Array.from({ length: target.length - next }, (_, offset) => next + offset).filter(
		(index) => Reflect.has(target, index)
	);
}

/** Applies a mutable array operation and journals its inverse during an optimistic transaction. */
export function mutateArray(
	target: unknown[],
	methodName: string,
	method: (this: unknown[], ...args: unknown[]) => unknown,
	args: unknown[],
	receiver: unknown,
	options: ReactiveOptions
): unknown {
	// Normalize authored reactive values before deciding whether native descriptors permit a fast path.
	args = args.map((arg) => unwrap(arg));
	if (
		(hasActiveTransaction() || hasArrayPositions(target)) &&
		['push', 'pop', 'shift', 'unshift', 'splice'].includes(methodName) &&
		method === Reflect.get(Array.prototype, methodName) &&
		supportsSequenceTracking(target, methodName, args)
	) {
		return mutateArraySequence(target, methodName, method, args, options);
	}
	if (
		!hasActiveTransaction() &&
		!hasArrayPositions(target) &&
		(methodName === 'push' || methodName === 'pop') &&
		method === Array.prototype[methodName] &&
		supportsSequenceTracking(target, methodName, args)
	) {
		return mutateArrayEnd(target, methodName, method, args, receiver, options);
	}
	const previous = copyArraySlots(target);
	const order =
		(hasActiveTransaction() || hasArrayPositions(target)) &&
		(methodName === 'reverse' || methodName === 'sort') &&
		method === Reflect.get(Array.prototype, methodName) &&
		supportsSequenceTracking(target, 'splice', [0, 0])
			? captureArrayOrder(target)
			: undefined;
	let result: unknown;
	try {
		result = method.apply(target, args);
	} finally {
		const reordered = order && recordArrayReorder(target, previous, order, methodName);
		if (!reordered) recordArrayMutationUndo(target, previous);
		batch(() => {
			const maxLength = Math.max(previous.length, target.length);
			let changed = previous.length !== target.length;
			for (let index = 0; index < maxLength; index++) {
				if (sameArraySlot(previous, target, index, index, true)) continue;
				changed = true;
				if (reordered) notifyReactiveDependency(target, String(index));
				else trigger(target, String(index));
			}
			if (previous.length !== target.length) trigger(target, 'length');
			if (changed) {
				markReactiveHashDirty(target);
				trigger(target, iterateKey);
				notifyMutation(options, undefined, methodName);
			}
		});
	}

	return result === target ? receiver : result;
}

/**
 * Records a sequence-aware inverse for an authored array method.
 *
 * The changed middle segment is replaced while any later authoritative prefix, suffix, or append
 * remains in place. If authoritative work changed the optimistic segment itself, rollback falls
 * back to restoring only positions that still contain the optimistic value.
 */
function recordArrayMutationUndo(target: unknown[], previous: unknown[]): void {
	if (!hasActiveTransaction()) return;
	if (hasIndexedAccessor(previous) || hasIndexedAccessor(target)) {
		recordTransactionUndo(createArrayUndo(target, previous));
		return;
	}
	if (previous.length === target.length) {
		for (let index = 0; index < previous.length; index++) {
			if (sameArraySlot(previous, target, index, index)) continue;
			const position = arrayPosition(target, index, true)!;
			const descriptor = Reflect.getOwnPropertyDescriptor(previous, String(index));
			readOwnershipVersion(target, String(index));
			recordTransactionUndo(
				() => {
					if (position.index < 0) return false;
					return descriptor
						? Reflect.defineProperty(target, String(position.index), descriptor)
						: Reflect.deleteProperty(target, String(position.index));
				},
				position,
				arrayPositionKey
			);
		}
		return;
	}
	const optimistic = copyArraySlots(target);
	const lengthVersion = readOwnershipVersion(target, arrayLengthWriteKey);
	const versions = Array.from(
		{ length: Math.max(previous.length, optimistic.length) },
		(_, index) => readOwnershipVersion(target, String(index))
	);
	const addresses = versions.map((_, index) => arrayPropertyAddress(target, String(index)));
	let prefix = 0;
	while (
		prefix < previous.length &&
		prefix < optimistic.length &&
		sameArraySlot(previous, optimistic, prefix, prefix)
	)
		prefix++;

	let suffix = 0;
	while (
		suffix < previous.length - prefix &&
		suffix < optimistic.length - prefix &&
		sameArraySlot(
			previous,
			optimistic,
			previous.length - suffix - 1,
			optimistic.length - suffix - 1
		)
	)
		suffix++;

	const previousEnd = previous.length - suffix;
	const optimisticEnd = optimistic.length - suffix;
	const removed = previous.slice(prefix, previousEnd);
	const inserted = optimistic.slice(prefix, optimisticEnd);
	recordTransactionUndo((restoration) => {
		const ownsLength =
			addresses.every(
				(address) => !isArrayPosition(address.target) || isUsableArrayPosition(address.target)
			) && restoration.allows(target, arrayLengthWriteKey, lengthVersion);
		let segmentUnchanged = ownsLength;
		for (let offset = 0; offset < inserted.length; offset++) {
			if (
				!restoration.allows(
					addresses[prefix + offset]!.target,
					addresses[prefix + offset]!.key,
					versions[prefix + offset]
				) ||
				!sameArraySlot(optimistic, target, prefix + offset, prefix + offset)
			) {
				segmentUnchanged = false;
				break;
			}
		}
		if (segmentUnchanged) {
			const beforeLength = target.length;
			const receipts = Array.from(
				{ length: Math.max(beforeLength, previousEnd) - prefix },
				(_, offset) => {
					const address = addresses[prefix + offset];
					return address
						? restoration.capture(address.target, address.key)
						: restoration.capture(target, String(prefix + offset));
				}
			);
			const lengthReceipt = restoration.capture(target, 'length');
			restoreArraySegment(
				target,
				prefix,
				inserted.length,
				removed.map((value) => unwrap(value))
			);
			for (let offset = 0; offset < removed.length; offset++) {
				const previousIndex = prefix + offset;
				const targetIndex = prefix + offset;
				const descriptor = Reflect.getOwnPropertyDescriptor(previous, String(previousIndex));
				const completed = descriptor
					? Reflect.defineProperty(target, String(targetIndex), descriptor)
					: Reflect.deleteProperty(target, String(targetIndex));
				if (completed) restoration.mark(receipts[offset]!);
				else restoration.notify(target, String(targetIndex));
			}
			for (let offset = removed.length; offset < receipts.length; offset++)
				restoration.mark(receipts[offset]!);
			if (beforeLength !== target.length) restoration.mark(lengthReceipt);
			return;
		}

		const changedLength = Math.max(previousEnd, optimisticEnd);
		for (let index = prefix; index < changedLength; index++) {
			if (
				(!ownsLength && index >= target.length) ||
				!restoration.allows(addresses[index]!.target, addresses[index]!.key, versions[index]) ||
				!sameArraySlot(optimistic, target, index, index)
			)
				continue;
			const receipt = restoration.capture(addresses[index]!.target, addresses[index]!.key);
			if (Reflect.has(previous, index)) {
				target[index] = previous[index];
				restoration.mark(receipt);
			} else if (Reflect.deleteProperty(target, index)) restoration.mark(receipt);
		}
	});
}

/** Restores a segment in linear time without routing its values through function arguments.
 * Moves the suffix in native splice order, preserving holes and native property constraints.
 */
function restoreArraySegment(
	target: unknown[],
	start: number,
	count: number,
	values: unknown[]
): void {
	const length = target.length;
	const delta = values.length - count;
	const step = delta > 0 ? -1 : 1;
	for (
		let source = delta > 0 ? length - 1 : start + count;
		delta && (delta > 0 ? source >= start + count : source < length);
		source += step
	) {
		const destination = source + delta;
		if (Reflect.has(target, source)) target[destination] = target[source];
		else if (!Reflect.deleteProperty(target, destination))
			throw new TypeError('Cannot restore array slot');
	}
	for (let index = length - 1; index >= length + delta; index--)
		if (!Reflect.deleteProperty(target, index)) throw new TypeError('Cannot restore array slot');
	for (let index = 0; index < values.length; index++) target[start + index] = values[index];
	target.length = length + delta;
}

function sameArraySlot(
	left: readonly unknown[],
	right: readonly unknown[],
	leftIndex: number,
	rightIndex: number,
	accessorsMayHaveChanged = false
): boolean {
	const leftDescriptor = propertyDescriptor(left, String(leftIndex));
	const rightDescriptor = propertyDescriptor(right, String(rightIndex));
	// A raw method can update accessor backing state without replacing its descriptor.
	// Conservatively invalidate those reads without evaluating extra authored getters.
	if (
		accessorsMayHaveChanged &&
		((leftDescriptor && !('value' in leftDescriptor)) ||
			(rightDescriptor && !('value' in rightDescriptor)))
	)
		return false;
	return rightDescriptor
		? samePropertyDescriptor(leftDescriptor, rightDescriptor)
		: leftDescriptor === undefined;
}

function mutateArrayEnd(
	target: unknown[],
	methodName: 'push' | 'pop',
	method: (this: unknown[], ...args: unknown[]) => unknown,
	args: unknown[],
	receiver: unknown,
	options: ReactiveOptions
): unknown {
	const oldLength = target.length;
	const result = method.apply(target, args);
	const newLength = target.length;
	if (newLength !== oldLength) {
		batch(() => {
			markReactiveHashDirty(target);
			if (methodName === 'push') {
				for (let index = oldLength; index < newLength; index++) trigger(target, String(index));
			} else {
				trigger(target, String(oldLength - 1));
			}
			trigger(target, 'length');
			trigger(target, iterateKey);
		});
		notifyMutation(options, undefined, methodName);
	}
	return result === target ? receiver : result;
}

/** Journals one property only when an active transaction can roll it back. */
export function recordPropertyUndo(target: object, key: PropertyKey): void {
	if (!hasActiveTransaction()) return;
	recordTransactionUndo(createPropertyUndo(target, key), target, key);
}

/** Journals an array reconciliation with independent restoration ownership for each slot. */
export function recordArrayUndo(target: unknown[]): void {
	if (!hasActiveTransaction()) return;
	recordTransactionUndo(createArrayUndo(target));
}

/** Captures array descriptors for reconciliation while preserving later authoritative slot writes. */
export function createArrayUndo(
	target: unknown[],
	snapshot: unknown[] = target
): (restoration: MutationRestoration) => void {
	const descriptors = new Map<PropertyKey, PropertyDescriptor>();
	const versions = new Map<PropertyKey, number>();
	const addresses = new Map<PropertyKey, { target: object; key: PropertyKey }>();
	const oldLength = snapshot.length;
	const lengthVersion = readOwnershipVersion(target, arrayLengthWriteKey);
	if (oldLength) {
		readOwnershipVersion(target, '0');
		addresses.set('0', arrayPropertyAddress(target, '0'));
	}
	for (const key of Reflect.ownKeys(snapshot)) {
		const descriptor = Reflect.getOwnPropertyDescriptor(snapshot, key);
		if (descriptor) descriptors.set(key, descriptor);
		versions.set(key, readOwnershipVersion(target, key));
		addresses.set(key, arrayPropertyAddress(target, key));
	}
	return (restoration) => {
		const positionsUsable = [...addresses.values()].every(
			(address) => !isArrayPosition(address.target) || isUsableArrayPosition(address.target)
		);
		const ownsLength =
			positionsUsable && restoration.allows(target, arrayLengthWriteKey, lengthVersion);
		for (const key of Reflect.ownKeys(target)) {
			if (
				key === 'length' ||
				(!positionsUsable && arrayIndex(key) !== undefined) ||
				(snapshot !== target && arrayIndex(key) === undefined) ||
				descriptors.has(key) ||
				!restoration.allows(target, key)
			)
				continue;
			const receipt = restoration.capture(target, key);
			if (Reflect.deleteProperty(target, key)) restoration.mark(receipt);
		}
		for (const [key, descriptor] of descriptors) {
			const address = addresses.get(key)!;
			if (key === 'length' || !restoration.allows(address.target, address.key, versions.get(key)))
				continue;
			const index = arrayIndex(key);
			if (!ownsLength && index !== undefined && index >= target.length) continue;
			const receipt = restoration.capture(address.target, address.key);
			if (Reflect.defineProperty(target, key, descriptor)) restoration.mark(receipt);
		}
		if (ownsLength) {
			let length = oldLength;
			for (const key of Object.getOwnPropertyNames(target)) {
				const index = arrayIndex(key);
				if (index !== undefined) length = Math.max(length, index + 1);
			}
			if (target.length !== length) {
				const receipt = restoration.capture(target, 'length');
				target.length = length;
				restoration.mark(receipt);
			}
		}
	};
}

// Descriptor snapshots preserve holes and never evaluate authored indexed getters.
function copyArraySlots(target: unknown[]): unknown[] {
	const result = new Array<unknown>(target.length);
	for (const key of Reflect.ownKeys(target)) {
		if (arrayIndex(key) === undefined) continue;
		const descriptor = Reflect.getOwnPropertyDescriptor(target, key)!;
		if (
			'value' in descriptor &&
			descriptor.writable &&
			descriptor.enumerable &&
			descriptor.configurable
		)
			result[Number(key)] = descriptor.value;
		else Reflect.defineProperty(result, key, descriptor);
	}
	return result;
}

// Accessor slots cannot participate in value-based sequence rollback without extra getter calls.
function hasIndexedAccessor(target: unknown[]): boolean {
	return Reflect.ownKeys(target).some((key) => {
		if (arrayIndex(key) === undefined) return false;
		return !('value' in Reflect.getOwnPropertyDescriptor(target, key)!);
	});
}
