import { hasActiveTransaction, recordTransactionUndo, track, trigger } from '../internal/deps.js';
import { hasChanged } from '../change-detection.js';
import { unwrap } from '../internal/values.js';
import type { ReactiveOptions } from '../internal/types.js';

type ReactiveCollection = Map<unknown, unknown> | Set<unknown>;
type WrapCollectionValue = (value: unknown, dependency?: PropertyKey) => unknown;

const iterateDependency = Symbol('exact.collection.iterate');
const sizeDependency = Symbol('exact.collection.size');
const keyDependencies = new WeakMap<object, Map<unknown, symbol>>();

/**
 * Implements the observable Map and Set surface without changing native
 * collection identity, iteration order, or mutation return values.
 */
export function reactiveCollectionMember(
	target: ReactiveCollection,
	key: PropertyKey,
	receiver: object,
	options: ReactiveOptions,
	wrap: WrapCollectionValue
): unknown {
	if (key === 'size') {
		track(target, sizeDependency);
		return target.size;
	}
	if (target instanceof Map) return reactiveMapMember(target, key, receiver, options, wrap);
	return reactiveSetMember(target, key, receiver, options, wrap);
}

function reactiveMapMember(
	target: Map<unknown, unknown>,
	key: PropertyKey,
	receiver: object,
	options: ReactiveOptions,
	wrap: WrapCollectionValue
): unknown {
	switch (key) {
		case 'get':
			return (input: unknown) => {
				const rawKey = unwrap(input);
				const dependency = collectionKeyDependency(target, rawKey);
				track(target, dependency);
				return wrap(target.get(rawKey), dependency);
			};
		case 'has':
			return (input: unknown) => {
				const rawKey = unwrap(input);
				track(target, collectionKeyDependency(target, rawKey));
				return target.has(rawKey);
			};
		case 'set':
			return (input: unknown, value: unknown) => {
				assertWritable(options, 'set');
				const rawKey = unwrap(input);
				const rawValue = unwrap(value);
				const had = target.has(rawKey);
				const previous = target.get(rawKey);
				if (had && !hasChanged(previous, rawValue)) return receiver;
				recordMapUndo(target, rawKey, had, previous);
				target.set(rawKey, rawValue);
				trigger(target, collectionKeyDependency(target, rawKey));
				trigger(target, iterateDependency);
				if (!had) trigger(target, sizeDependency);
				notifyMutation(options, rawKey, 'map.set');
				return receiver;
			};
		case 'delete':
			return (input: unknown) => {
				assertWritable(options, 'delete');
				const rawKey = unwrap(input);
				if (!target.has(rawKey)) return false;
				const previous = target.get(rawKey);
				recordMapUndo(target, rawKey, true, previous);
				const deleted = target.delete(rawKey);
				if (deleted) {
					triggerCollectionRemoval(target, rawKey);
					releaseCollectionKeyDependency(target, rawKey);
					notifyMutation(options, rawKey, 'map.delete');
				}
				return deleted;
			};
		case 'clear':
			return () => {
				assertWritable(options, 'clear');
				if (!target.size) return undefined;
				const previous = [...target.entries()];
				if (hasActiveTransaction())
					recordTransactionUndo(() => restoreMap(target, previous), target, iterateDependency);
				target.clear();
				for (const [entryKey] of previous)
					trigger(target, collectionKeyDependency(target, entryKey));
				keyDependencies.delete(target);
				trigger(target, iterateDependency);
				trigger(target, sizeDependency);
				notifyMutation(options, undefined, 'map.clear');
				return undefined;
			};
		case 'keys':
			return () => mapIterator(target, 'keys', wrap);
		case 'values':
			return () => mapIterator(target, 'values', wrap);
		case 'entries':
		case Symbol.iterator:
			return () => mapIterator(target, 'entries', wrap);
		case 'forEach':
			return (callback: (value: unknown, key: unknown, map: object) => void, thisArg?: unknown) => {
				track(target, iterateDependency);
				target.forEach((value, entryKey) => {
					const dependency = collectionKeyDependency(target, entryKey);
					callback.call(thisArg, wrap(value, dependency), wrap(entryKey), receiver);
				});
			};
		default:
			return Reflect.get(target, key, target);
	}
}

function reactiveSetMember(
	target: Set<unknown>,
	key: PropertyKey,
	receiver: object,
	options: ReactiveOptions,
	wrap: WrapCollectionValue
): unknown {
	switch (key) {
		case 'has':
			return (input: unknown) => {
				const rawValue = unwrap(input);
				track(target, collectionKeyDependency(target, rawValue));
				return target.has(rawValue);
			};
		case 'add':
			return (input: unknown) => {
				assertWritable(options, 'add');
				const rawValue = unwrap(input);
				if (target.has(rawValue)) return receiver;
				if (hasActiveTransaction())
					recordTransactionUndo(
						() => target.delete(rawValue),
						target,
						collectionKeyDependency(target, rawValue)
					);
				target.add(rawValue);
				trigger(target, collectionKeyDependency(target, rawValue));
				trigger(target, iterateDependency);
				trigger(target, sizeDependency);
				notifyMutation(options, undefined, 'set.add');
				return receiver;
			};
		case 'delete':
			return (input: unknown) => {
				assertWritable(options, 'delete');
				const rawValue = unwrap(input);
				if (!target.has(rawValue)) return false;
				if (hasActiveTransaction())
					recordTransactionUndo(
						() => target.add(rawValue),
						target,
						collectionKeyDependency(target, rawValue)
					);
				const deleted = target.delete(rawValue);
				if (deleted) {
					triggerCollectionRemoval(target, rawValue);
					releaseCollectionKeyDependency(target, rawValue);
					notifyMutation(options, undefined, 'set.delete');
				}
				return deleted;
			};
		case 'clear':
			return () => {
				assertWritable(options, 'clear');
				if (!target.size) return undefined;
				const previous = [...target.values()];
				if (hasActiveTransaction())
					recordTransactionUndo(() => restoreSet(target, previous), target, iterateDependency);
				target.clear();
				for (const value of previous) trigger(target, collectionKeyDependency(target, value));
				keyDependencies.delete(target);
				trigger(target, iterateDependency);
				trigger(target, sizeDependency);
				notifyMutation(options, undefined, 'set.clear');
				return undefined;
			};
		case 'keys':
		case 'values':
		case Symbol.iterator:
			return () => setIterator(target, wrap);
		case 'entries':
			return () => setEntryIterator(target, wrap);
		case 'forEach':
			return (
				callback: (value: unknown, repeated: unknown, set: object) => void,
				thisArg?: unknown
			) => {
				track(target, iterateDependency);
				target.forEach((value) => {
					const wrapped = wrap(value);
					callback.call(thisArg, wrapped, wrapped, receiver);
				});
			};
		default:
			return Reflect.get(target, key, target);
	}
}

function mapIterator(
	target: Map<unknown, unknown>,
	kind: 'keys' | 'values' | 'entries',
	wrap: WrapCollectionValue
): IterableIterator<unknown> {
	track(target, iterateDependency);
	const iterator = target[kind]();
	return wrapIterator(iterator, (value) => {
		if (kind === 'keys') return wrap(value);
		if (kind === 'values') return wrap(value);
		const [entryKey, entryValue] = value as [unknown, unknown];
		return [wrap(entryKey), wrap(entryValue, collectionKeyDependency(target, entryKey))];
	});
}

function setIterator(target: Set<unknown>, wrap: WrapCollectionValue): IterableIterator<unknown> {
	track(target, iterateDependency);
	return wrapIterator(target.values(), (value) => wrap(value));
}

function setEntryIterator(
	target: Set<unknown>,
	wrap: WrapCollectionValue
): IterableIterator<[unknown, unknown]> {
	track(target, iterateDependency);
	return wrapIterator(target.values(), (value) => {
		const wrapped = wrap(value);
		return [wrapped, wrapped];
	});
}

function wrapIterator<T, U>(iterator: Iterator<T>, wrap: (value: T) => U): IterableIterator<U> {
	return {
		next() {
			const result = iterator.next();
			return result.done
				? { done: true, value: undefined }
				: { done: false, value: wrap(result.value) };
		},
		[Symbol.iterator]() {
			return this;
		}
	};
}

function collectionKeyDependency(target: object, key: unknown): symbol {
	let dependencies = keyDependencies.get(target);
	if (!dependencies) keyDependencies.set(target, (dependencies = new Map()));
	let dependency = dependencies.get(key);
	if (!dependency) {
		dependency = Symbol('exact.collection.key');
		dependencies.set(key, dependency);
	}
	return dependency;
}

function releaseCollectionKeyDependency(target: object, key: unknown): void {
	const dependencies = keyDependencies.get(target);
	if (!dependencies) return;
	dependencies.delete(key);
	if (!dependencies.size) keyDependencies.delete(target);
}

function triggerCollectionRemoval(target: ReactiveCollection, value: unknown): void {
	trigger(target, collectionKeyDependency(target, value));
	trigger(target, iterateDependency);
	trigger(target, sizeDependency);
}

function recordMapUndo(
	target: Map<unknown, unknown>,
	key: unknown,
	had: boolean,
	previous: unknown
): void {
	if (!hasActiveTransaction()) return;
	recordTransactionUndo(
		() => {
			if (had) target.set(key, previous);
			else target.delete(key);
		},
		target,
		collectionKeyDependency(target, key)
	);
}

function restoreMap(
	target: Map<unknown, unknown>,
	entries: readonly (readonly [unknown, unknown])[]
): void {
	target.clear();
	for (const [key, value] of entries) target.set(key, value);
}

function restoreSet(target: Set<unknown>, values: readonly unknown[]): void {
	target.clear();
	for (const value of values) target.add(value);
}

function assertWritable(options: ReactiveOptions, operation: string): void {
	if (!options.readonly) return;
	options.onReadonlyWrite?.(operation);
	throw new TypeError(`Cannot call ${operation} on a readonly reactive collection`);
}

function notifyMutation(options: ReactiveOptions, key: unknown, operation: string): void {
	const propertyKey =
		typeof key === 'string' || typeof key === 'number' || typeof key === 'symbol' ? key : undefined;
	try {
		options.onMutation?.(propertyKey, operation);
	} catch {
		// Diagnostic observation must not change collection mutation behavior.
	}
}
