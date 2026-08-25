import { proxyMarker, rawTarget } from './internal/symbols.js';
import type { Reactive, ReactiveOptions } from './internal/types.js';
import { hasActiveTransaction, recordTransactionUndo, track, trigger } from './internal/deps.js';
import { hasChanged, isReactiveContainer } from './change-detection.js';
import { unwrap } from './internal/values.js';

type IndexedRecord = {
	readonly indexes: Map<PropertyKey, number>;
	readonly keys: PropertyKey[];
	readonly initialized: boolean[];
	readonly target: Record<PropertyKey, unknown>;
};

/** Stable dependency keys for compiler-known fields on one indexed reactive target. */
export type ReactiveOwnDependencies = Readonly<{
	target: object;
	keys: readonly PropertyKey[];
}>;

const indexedRecords = new WeakMap<object, IndexedRecord>();

/**
 * Creates an inspectable object facade whose compiler-known top-level fields are
 * stored in stable numeric slots. Nested containers retain the general reactive
 * proxy so ordinary mutable objects, arrays, maps, and sets keep their semantics.
 */
export function createIndexedReactive<T extends object>(
	keys: readonly PropertyKey[],
	options: ReactiveOptions,
	wrap: (value: object, options: ReactiveOptions) => object
): Reactive<T> {
	const indexes = new Map<PropertyKey, number>();
	const indexedKeys: PropertyKey[] = [];
	for (const key of keys) {
		if (indexes.has(key)) continue;
		indexes.set(key, indexes.size);
		indexedKeys.push(key);
	}
	const target: Record<PropertyKey, unknown> = {};
	const initialized = new Array<boolean>(indexes.size).fill(false);
	const read = (key: PropertyKey, index: number) => {
		track(target, index);
		return target[key];
	};
	const write = (key: PropertyKey, index: number, next: unknown) => {
		const previous = target[key];
		const raw = unwrap(next);
		const value =
			raw && typeof raw === 'object' && isReactiveContainer(raw)
				? wrap(raw as object, options)
				: raw;
		const wasInitialized = initialized[index] === true;
		if (wasInitialized && !hasChanged(previous, value)) return true;
		if (hasActiveTransaction())
			recordTransactionUndo(
				() => {
					if (wasInitialized) target[key] = previous;
					if (!wasInitialized) {
						initialized[index] = false;
						Reflect.deleteProperty(target, key);
					}
				},
				target,
				index
			);
		Reflect.defineProperty(target, key, {
			configurable: true,
			enumerable: true,
			value,
			writable: true
		});
		initialized[index] = true;
		trigger(target, index);
		try {
			options.onMutation?.(key, 'set');
		} catch {
			// Observability must not alter state semantics.
		}
		return true;
	};

	const facade = new Proxy(target, {
		get(target, key, receiver) {
			if (key === proxyMarker) return true;
			if (key === rawTarget) return target;
			const index = indexes.get(key);
			return index === undefined ? Reflect.get(target, key, receiver) : read(key, index);
		},
		set(_target, key, next) {
			let index = indexes.get(key);
			if (index === undefined) {
				index = indexes.size;
				indexes.set(key, index);
				indexedKeys.push(key);
				initialized.push(false);
			}
			return write(key, index, next);
		},
		deleteProperty(_target, key) {
			const index = indexes.get(key);
			if (index !== undefined && initialized[index]) {
				const previous = target[key];
				if (hasActiveTransaction())
					recordTransactionUndo(
						() => {
							Reflect.defineProperty(target, key, {
								configurable: true,
								enumerable: true,
								value: previous,
								writable: true
							});
							initialized[index] = true;
						},
						target,
						index
					);
				trigger(target, index);
			}
			if (index !== undefined) initialized[index] = false;
			return Reflect.deleteProperty(target, key);
		},
		has(target, key) {
			const index = indexes.get(key);
			return (index !== undefined && initialized[index] === true) || Reflect.has(target, key);
		}
	});
	indexedRecords.set(facade, { indexes, keys: indexedKeys, initialized, target });
	return facade as Reactive<T>;
}

/** Reads an own field without invoking an arbitrary user-defined accessor. */
export function readReactiveOwnProperty(
	value: object,
	key: PropertyKey
): { present: true; value: unknown } | { present: false } {
	const indexed = indexedRecords.get(value);
	if (indexed) {
		const index = indexed.indexes.get(key);
		return index !== undefined && indexed.initialized[index]
			? { present: true, value: indexed.target[key] }
			: { present: false };
	}
	const descriptor = Object.getOwnPropertyDescriptor(value, key);
	return descriptor && 'value' in descriptor
		? { present: true, value: descriptor.value }
		: { present: false };
}

/** Reads one compiler-proven top-level slot without entering the facade's property trap. */
export function readIndexedReactiveSlot(value: object, index: number): unknown {
	const indexed = indexedRecords.get(value);
	if (!indexed || !Number.isSafeInteger(index) || index < 0 || index >= indexed.initialized.length)
		throw new TypeError('Compiled reactive read referenced an invalid indexed slot');
	track(indexed.target, index);
	const key = indexed.keys[index];
	return key === undefined ? undefined : indexed.target[key];
}

/** Resolves compiler-known own fields to compact stable dependencies without evaluating them. */
export function reactiveOwnDependencies(
	value: object,
	keys: readonly PropertyKey[]
): ReactiveOwnDependencies | undefined {
	const indexed = indexedRecords.get(value);
	if (!indexed) return undefined;
	const indexes: PropertyKey[] = [];
	for (const key of keys) {
		const index = indexed.indexes.get(key);
		if (index === undefined) return undefined;
		indexes.push(index);
	}
	return {
		target: indexed.target,
		keys: indexes
	};
}
