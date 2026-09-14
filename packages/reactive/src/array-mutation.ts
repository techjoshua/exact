import { arrayIndex, createPropertyUndo } from './array-property-undo.js';
export { createPropertyUndo } from './array-property-undo.js';
import {
	batch,
	hasActiveTransaction,
	recordTransactionUndo,
	readMutationVersion,
	type MutationRestoration,
	trigger
} from './internal/deps.js';

import { markReactiveHashDirty } from './internal/keyed-collections.js';

import { arrayLengthWriteKey, iterateKey } from './internal/symbols.js';
import { unwrap } from './internal/values.js';
import type { ReactiveOptions } from './internal/types.js';

/** Applies a mutable array operation and journals its inverse during an optimistic transaction. */
export function mutateArray(
	target: unknown[],
	methodName: string,
	method: (this: unknown[], ...args: unknown[]) => unknown,
	args: unknown[],
	receiver: unknown,
	options: ReactiveOptions
): unknown {
	// Array methods run against the raw target, so reject readonly access before invoking the
	// method, including user callbacks such as sort comparators or overridden methods.
	if (options.readonly) {
		options.onReadonlyWrite?.(methodName);
		throw new TypeError(`Cannot call ${methodName} on a readonly array`);
	}
	if ((methodName === 'push' || methodName === 'pop') && method === Array.prototype[methodName]) {
		return mutateArrayEnd(target, methodName, method, args, receiver, options);
	}
	const previous = target.slice();
	let result: unknown;
	try {
		result = method.apply(
			target,
			args.map((arg) => unwrap(arg))
		);
	} finally {
		recordArrayMutationUndo(target, previous);
		batch(() => {
			const maxLength = Math.max(previous.length, target.length);
			let changed = previous.length !== target.length;
			for (let index = 0; index < maxLength; index++) {
				const existed = Reflect.has(previous, index);
				const exists = Reflect.has(target, index);
				if (existed === exists && Object.is(unwrap(previous[index]), unwrap(target[index])))
					continue;
				changed = true;
				trigger(target, String(index));
			}
			if (previous.length !== target.length) trigger(target, 'length');
			if (changed) {
				markReactiveHashDirty(target);
				trigger(target, iterateKey);
				notifyMutation(options, methodName);
			}
		});
	}

	return result === target ? receiver : result;
}

function notifyMutation(options: ReactiveOptions, operation: string): void {
	try {
		options.onMutation?.(undefined, operation);
	} catch {
		// Inspection cannot change array mutation behavior.
	}
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
	const optimistic = target.slice();
	const lengthVersion = readMutationVersion(target, arrayLengthWriteKey);
	const versions = Array.from(
		{ length: Math.max(previous.length, optimistic.length) },
		(_, index) => readMutationVersion(target, String(index))
	);
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
		const ownsLength = restoration.allows(target, arrayLengthWriteKey, lengthVersion);
		let segmentUnchanged = ownsLength;
		for (let offset = 0; offset < inserted.length; offset++) {
			if (
				!restoration.allows(target, String(prefix + offset), versions[prefix + offset]) ||
				!sameArraySlot(optimistic, target, prefix + offset, prefix + offset)
			) {
				segmentUnchanged = false;
				break;
			}
		}
		if (segmentUnchanged) {
			const beforeLength = target.length;
			Array.prototype.splice.call(
				target,
				prefix,
				inserted.length,
				...removed.map((value) => unwrap(value))
			);
			for (let offset = 0; offset < removed.length; offset++) {
				const previousIndex = prefix + offset;
				const targetIndex = prefix + offset;
				const descriptor = Reflect.getOwnPropertyDescriptor(previous, String(previousIndex));
				if (descriptor) Reflect.defineProperty(target, String(targetIndex), descriptor);
				else Reflect.deleteProperty(target, String(targetIndex));
			}
			for (let index = prefix; index < Math.max(beforeLength, target.length); index++)
				restoration.mark(target, String(index));
			if (beforeLength !== target.length) restoration.mark(target, 'length');
			return;
		}

		const changedLength = Math.max(previousEnd, optimisticEnd);
		for (let index = prefix; index < changedLength; index++) {
			if (
				(!ownsLength && index >= target.length) ||
				!restoration.allows(target, String(index), versions[index]) ||
				!sameArraySlot(optimistic, target, index, index)
			)
				continue;
			if (Reflect.has(previous, index)) target[index] = previous[index];
			else Reflect.deleteProperty(target, index);
			restoration.mark(target, String(index));
		}
	});
}

function sameArraySlot(
	left: readonly unknown[],
	right: readonly unknown[],
	leftIndex: number,
	rightIndex: number
): boolean {
	const leftExists = Reflect.has(left, leftIndex);
	const rightExists = Reflect.has(right, rightIndex);
	return (
		leftExists === rightExists &&
		(!leftExists || Object.is(unwrap(left[leftIndex]), unwrap(right[rightIndex])))
	);
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
	const removed =
		methodName === 'pop' && oldLength > 0
			? Reflect.getOwnPropertyDescriptor(target, String(oldLength - 1))
			: undefined;
	const journaled = hasActiveTransaction();
	const lengthVersion = journaled ? readMutationVersion(target, arrayLengthWriteKey) : 0;
	const result = method.apply(
		target,
		args.map((arg) => unwrap(arg))
	);
	const newLength = target.length;
	if (newLength !== oldLength) {
		if (journaled) {
			if (methodName === 'push') {
				for (let index = oldLength; index < newLength; index++) {
					const insertedIndex = index;
					recordTransactionUndo(
						(restoration) => {
							if (restoration.allows(target, arrayLengthWriteKey, lengthVersion)) {
								Array.prototype.splice.call(target, insertedIndex, 1);
								restoration.mark(target, 'length');
							} else Reflect.deleteProperty(target, insertedIndex);
						},
						target,
						String(insertedIndex)
					);
				}
			} else {
				recordTransactionUndo(
					(restoration) => {
						if (restoration.allows(target, arrayLengthWriteKey, lengthVersion)) {
							Array.prototype.splice.call(target, oldLength - 1, 0, undefined);
							restoration.mark(target, 'length');
						} else if (oldLength > target.length) return;
						if (removed) Reflect.defineProperty(target, String(oldLength - 1), removed);
						else Reflect.deleteProperty(target, String(oldLength - 1));
					},
					target,
					String(oldLength - 1)
				);
			}
		}
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
		notifyMutation(options, methodName);
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
export function createArrayUndo(target: unknown[]): (restoration: MutationRestoration) => void {
	const descriptors = new Map<PropertyKey, PropertyDescriptor>();
	const versions = new Map<PropertyKey, number>();
	const oldLength = target.length;
	const lengthVersion = readMutationVersion(target, arrayLengthWriteKey);
	for (const key of Reflect.ownKeys(target)) {
		const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
		if (descriptor) descriptors.set(key, descriptor);
		versions.set(key, readMutationVersion(target, key));
	}
	return (restoration) => {
		const ownsLength = restoration.allows(target, arrayLengthWriteKey, lengthVersion);
		for (const key of Reflect.ownKeys(target)) {
			if (key === 'length' || descriptors.has(key) || !restoration.allows(target, key)) continue;
			Reflect.deleteProperty(target, key);
			restoration.mark(target, key);
		}
		for (const [key, descriptor] of descriptors) {
			if (key === 'length' || !restoration.allows(target, key, versions.get(key))) continue;
			const index = arrayIndex(key);
			if (!ownsLength && index !== undefined && index >= target.length) continue;
			Reflect.defineProperty(target, key, descriptor);
			restoration.mark(target, key);
		}
		if (ownsLength) {
			let length = oldLength;
			for (const key of Object.getOwnPropertyNames(target)) {
				const index = arrayIndex(key);
				if (index !== undefined) length = Math.max(length, index + 1);
			}
			if (target.length !== length) {
				target.length = length;
				restoration.mark(target, 'length');
			}
		}
	};
}
