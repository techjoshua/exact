import { proxyMarker, rawTarget } from './internal/symbols.js';
import type { Reactive, ReactiveOptions } from './internal/types.js';
import { reactive } from './observation.js';
import { hasActiveTransaction, recordTransactionUndo, track, trigger } from './internal/deps.js';
import { hasChanged, isReactiveContainer } from './change-detection.js';
import { unwrap } from './internal/values.js';

type IndexedRecord = {
	readonly indexes: Map<PropertyKey, number>;
	readonly initialized: Set<PropertyKey>;
	readonly values: unknown[];
};

const indexedRecords = new WeakMap<object, IndexedRecord>();

/**
 * Creates an inspectable object facade whose compiler-known top-level fields are
 * stored in stable numeric slots. Nested containers retain the general reactive
 * proxy so ordinary mutable objects, arrays, maps, and sets keep their semantics.
 */
export function indexedReactive<T extends object>(
	keys: readonly PropertyKey[],
	options: ReactiveOptions = {}
): Reactive<T> {
	const indexes = new Map<PropertyKey, number>();
	for (const key of keys) if (!indexes.has(key)) indexes.set(key, indexes.size);
	const names = [...indexes.keys()];
	const values = new Array<unknown>(indexes.size);
	const view: Record<PropertyKey, unknown> = {};
	const initialized = new Set<PropertyKey>();
	const read = (index: number) => {
		track(values, index);
		return values[index];
	};
	const write = (key: PropertyKey, index: number, next: unknown) => {
		const previous = values[index];
		const raw = unwrap(next);
		const value =
			raw && typeof raw === 'object' && isReactiveContainer(raw)
				? reactive(raw as object, options)
				: raw;
		const wasInitialized = initialized.has(key);
		if (wasInitialized && !hasChanged(previous, value)) return true;
		if (hasActiveTransaction())
			recordTransactionUndo(
				() => {
					values[index] = previous;
					if (!wasInitialized) {
						initialized.delete(key);
						Reflect.deleteProperty(view, key);
					}
				},
				values,
				index
			);
		values[index] = value;
		initialized.add(key);
		trigger(values, index);
		try {
			options.onMutation?.(key, 'set');
		} catch {
			// Observability must not alter state semantics.
		}
		return true;
	};

	const install = (key: PropertyKey, index: number) => {
		if (Object.prototype.hasOwnProperty.call(view, key)) return;
		Object.defineProperty(view, key, {
			configurable: true,
			enumerable: true,
			get: () => read(index),
			set: (next) => write(key, index, next)
		});
	};

	const facade = new Proxy(view, {
		get(target, key, receiver) {
			if (key === proxyMarker) return true;
			if (key === rawTarget) return target;
			const index = indexes.get(key);
			return index === undefined ? Reflect.get(target, key, receiver) : read(index);
		},
		set(target, key, next, receiver) {
			let index = indexes.get(key);
			if (index === undefined) {
				index = indexes.size;
				indexes.set(key, index);
				names.push(key);
			}
			install(key, index);
			return Reflect.set(target, key, next, receiver);
		},
		deleteProperty(target, key) {
			const index = indexes.get(key);
			if (index !== undefined && initialized.has(key)) {
				const previous = values[index];
				if (hasActiveTransaction())
					recordTransactionUndo(
						() => {
							values[index] = previous;
							install(key, index);
							initialized.add(key);
						},
						values,
						index
					);
				values[index] = undefined;
				trigger(values, index);
			}
			initialized.delete(key);
			return Reflect.deleteProperty(target, key);
		},
		has(target, key) {
			return initialized.has(key) || Reflect.has(target, key);
		}
	});
	indexedRecords.set(facade, { indexes, initialized, values });
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
		return index !== undefined && indexed.initialized.has(key)
			? { present: true, value: indexed.values[index] }
			: { present: false };
	}
	const descriptor = Object.getOwnPropertyDescriptor(value, key);
	return descriptor && 'value' in descriptor
		? { present: true, value: descriptor.value }
		: { present: false };
}
