import { batch, hasActiveTransaction, recordTransactionUndo, trigger } from './internal/deps.js';

import { markReactiveHashDirty } from './internal/keyed-collections.js';

import { iterateKey } from './internal/symbols.js';
import { unwrap } from './internal/values.js';
import type { ReactiveOptions } from './internal/types.js';

/** Applies an array to the owned runtime state. */
export function mutateArray(
	target: unknown[],
	methodName: string,
	method: (this: unknown[], ...args: unknown[]) => unknown,
	args: unknown[],
	receiver: unknown,
	options: ReactiveOptions
): unknown {
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
	recordTransactionUndo(() => {
		let segmentUnchanged = true;
		for (let offset = 0; offset < inserted.length; offset++) {
			if (!sameArraySlot(optimistic, target, prefix + offset, prefix + offset)) {
				segmentUnchanged = false;
				break;
			}
		}
		if (segmentUnchanged) {
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
			return;
		}

		const changedLength = Math.max(previousEnd, optimisticEnd);
		for (let index = prefix; index < changedLength; index++) {
			if (!sameArraySlot(optimistic, target, index, index)) continue;
			if (Reflect.has(previous, index)) target[index] = previous[index];
			else Reflect.deleteProperty(target, index);
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
						() => {
							Array.prototype.splice.call(target, insertedIndex, 1);
						},
						target,
						String(insertedIndex)
					);
				}
			} else {
				recordTransactionUndo(
					() => {
						Array.prototype.splice.call(target, oldLength - 1, 0, undefined);
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

/** Performs the record property undo domain operation. */
export function recordPropertyUndo(target: object, key: PropertyKey): void {
	if (!hasActiveTransaction()) return;
	recordTransactionUndo(createPropertyUndo(target, key), target, key);
}

/** Creates a property undo. */
export function createPropertyUndo(target: object, key: PropertyKey): () => void {
	if (Array.isArray(target) && key === 'length') return createArrayUndo(target);
	const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
	const arrayTarget = Array.isArray(target) ? target : undefined;
	const oldLength = arrayTarget?.length;
	return () => {
		if (descriptor) Reflect.defineProperty(target, key, descriptor);
		else Reflect.deleteProperty(target, key);
		if (oldLength !== undefined && arrayTarget && arrayTarget.length !== oldLength)
			arrayTarget.length = oldLength;
	};
}

/** Performs the record array undo domain operation. */
export function recordArrayUndo(target: unknown[]): void {
	if (!hasActiveTransaction()) return;
	recordTransactionUndo(createArrayUndo(target), target, iterateKey);
}

/** Creates an array undo. */
export function createArrayUndo(target: unknown[]): () => void {
	const descriptors = new Map<PropertyKey, PropertyDescriptor>();
	for (const key of Reflect.ownKeys(target)) {
		const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
		if (descriptor) descriptors.set(key, descriptor);
	}
	return () => {
		for (const key of Reflect.ownKeys(target))
			if (key !== 'length' && !descriptors.has(key)) Reflect.deleteProperty(target, key);
		const length = descriptors.get('length')?.value;
		if (typeof length === 'number') target.length = length;
		for (const [key, descriptor] of descriptors)
			if (key !== 'length') Reflect.defineProperty(target, key, descriptor);
	};
}
