import { batch, hasActiveTransaction, recordTransactionUndo, trigger } from './internal/deps.js';

import { markReactiveHashDirty } from './internal/keyed-collections.js';

import { iterateKey } from './internal/symbols.js';
import { unwrap } from './internal/values.js';

/** Applies an array to the owned runtime state. */
export function mutateArray(
	target: unknown[],
	methodName: string,
	method: (this: unknown[], ...args: unknown[]) => unknown,
	args: unknown[],
	receiver: unknown
): unknown {
	if ((methodName === 'push' || methodName === 'pop') && method === Array.prototype[methodName]) {
		return mutateArrayEnd(target, methodName, method, args, receiver);
	}
	const previous = target.slice();
	recordArrayUndo(target);
	let result: unknown;
	try {
		result = method.apply(
			target,
			args.map((arg) => unwrap(arg))
		);
	} finally {
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
			}
		});
	}

	return result === target ? receiver : result;
}

function mutateArrayEnd(
	target: unknown[],
	methodName: 'push' | 'pop',
	method: (this: unknown[], ...args: unknown[]) => unknown,
	args: unknown[],
	receiver: unknown
): unknown {
	const oldLength = target.length;
	const removed =
		methodName === 'pop' && oldLength > 0
			? Reflect.getOwnPropertyDescriptor(target, String(oldLength - 1))
			: undefined;
	if (hasActiveTransaction()) {
		recordTransactionUndo(() => {
			if (methodName === 'push') {
				target.length = oldLength;
			} else if (oldLength > 0) {
				target.length = oldLength;
				if (removed) Reflect.defineProperty(target, String(oldLength - 1), removed);
				else Reflect.deleteProperty(target, String(oldLength - 1));
			}
		});
	}
	const result = method.apply(
		target,
		args.map((arg) => unwrap(arg))
	);
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
	}
	return result === target ? receiver : result;
}

/** Performs the record property undo domain operation. */
export function recordPropertyUndo(target: object, key: PropertyKey): void {
	if (!hasActiveTransaction()) return;
	recordTransactionUndo(createPropertyUndo(target, key));
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
	recordTransactionUndo(createArrayUndo(target));
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
