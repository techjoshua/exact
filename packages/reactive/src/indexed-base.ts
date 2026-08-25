import { proxyMarker, rawTarget } from './internal/symbols.js';
import type { Reactive, ReactiveOptions } from './internal/types.js';
import { batch, hasActiveTransaction, recordTransactionUndo, track, trigger } from './internal/deps.js';
import { hasChanged, isReactiveContainer } from './change-detection.js';
import { isReactiveValue, unwrap } from './internal/values.js';

type IndexedRecord = {
	readonly layout: IndexedLayout;
	dynamicIndexes?: Map<PropertyKey, number>;
	dynamicKeys?: PropertyKey[];
	readonly initialized: boolean[];
	readonly target: Record<PropertyKey, unknown>;
	readonly options: ReactiveOptions;
	readonly wrap: (value: object, options: ReactiveOptions) => object;
	readonly preserveReactiveValues: boolean;
};

type IndexedLayout = Readonly<{
	indexes: ReadonlyMap<PropertyKey, number>;
	keys: readonly PropertyKey[];
}>;

/** Stable dependency keys for compiler-known fields on one indexed reactive target. */
export type ReactiveOwnDependencies = Readonly<{
	target: object;
	keys: readonly PropertyKey[];
}>;

const indexedRecords = new WeakMap<object, IndexedRecord>();
const indexedLayouts = new WeakMap<object, IndexedLayout>();

/**
 * Creates an inspectable object facade whose compiler-known top-level fields are
 * stored in stable numeric slots. Nested containers retain the general reactive
 * proxy so ordinary mutable objects, arrays, maps, and sets keep their semantics.
 */
export function createIndexedReactive<T extends object>(
	keys: readonly PropertyKey[],
	options: ReactiveOptions,
	wrap: (value: object, options: ReactiveOptions) => object,
	initial?: T,
	preserveReactiveValues = false
): Reactive<T> {
	const layout = indexedLayout(keys);
	const target: Record<PropertyKey, unknown> = {};
	const initialized = new Array<boolean>(layout.keys.length).fill(false);
	const read = (key: PropertyKey, index: number) => {
		track(target, index);
		return readIndexedValue(record, key);
	};
	const record: IndexedRecord = {
		layout,
		initialized,
		target,
		options,
		wrap,
		preserveReactiveValues
	};
	if (initial) seedIndexedRecord(record, initial);

	const facade = new Proxy(target, {
		get(target, key, receiver) {
			if (key === proxyMarker) return true;
			if (key === rawTarget) return target;
			const index = indexedRecordIndex(record, key);
			return index === undefined ? Reflect.get(target, key, receiver) : read(key, index);
		},
		set(_target, key, next) {
			if (options.readonly) {
				options.onReadonlyWrite?.(key);
				return false;
			}
			const index = ensureIndexedRecordIndex(record, key);
			return writeIndexedRecord(record, index, next);
		},
		deleteProperty(_target, key) {
			const index = indexedRecordIndex(record, key);
			return index === undefined
				? Reflect.deleteProperty(target, key)
				: deleteIndexedRecord(record, index);
		},
		has(target, key) {
			const index = indexedRecordIndex(record, key);
			return (index !== undefined && initialized[index] === true) || Reflect.has(target, key);
		}
	});
	indexedRecords.set(facade, record);
	return facade as Reactive<T>;
}

/**
 * Reconciles a compiler-indexed facade while preserving numeric dependency identities.
 *
 * The caller owns batching and may reconcile compatible nested containers before this function
 * replaces a top-level slot. Returns false when the value is not an indexed facade.
 */
export function updateIndexedReactive(
	value: object,
	next: Record<PropertyKey, unknown>,
	reconcileNested: (previous: unknown, next: unknown) => boolean
): boolean {
	const indexed = indexedRecords.get(value);
	if (!indexed) return false;
	batch(() => {
		for (const key of Reflect.ownKeys(indexed.target)) {
			if (Object.prototype.hasOwnProperty.call(next, key)) continue;
			const index = indexedRecordIndex(indexed, key);
			if (index !== undefined) deleteIndexedRecord(indexed, index);
		}
		for (const key of Reflect.ownKeys(next)) {
			const incoming = Reflect.get(next, key);
			const index = ensureIndexedRecordIndex(indexed, key);
			if (indexed.initialized[index] && reconcileNested(indexed.target[key], incoming)) continue;
			writeIndexedRecord(indexed, index, incoming);
		}
	});
	return true;
}

/** Reads an own field without invoking an arbitrary user-defined accessor. */
export function readReactiveOwnProperty(
	value: object,
	key: PropertyKey
): { present: true; value: unknown } | { present: false } {
	const indexed = indexedRecords.get(value);
	if (indexed) {
		const index = indexedRecordIndex(indexed, key);
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
	const indexed = indexedRecord(value, index, 'read');
	track(indexed.target, index);
	return readIndexedValue(indexed, indexedRecordKey(indexed, index));
}

/** Reads one compiler-proven slot without collecting a dependency. */
export function peekIndexedReactiveSlot(value: object, index: number): unknown {
	const indexed = indexedRecord(value, index, 'peek');
	return readIndexedValue(indexed, indexedRecordKey(indexed, index));
}

/** Commits one compiler-proven slot without entering the facade's proxy traps. */
export function setIndexedReactiveSlot(value: object, index: number, next: unknown): void {
	writeIndexedRecord(indexedRecord(value, index, 'write'), index, next);
}

/** Deletes one compiler-proven slot without entering the facade's proxy traps. */
export function deleteIndexedReactiveSlot(value: object, index: number): boolean {
	return deleteIndexedRecord(indexedRecord(value, index, 'delete'), index);
}

function indexedRecord(value: object, index: number, operation: string): IndexedRecord {
	const indexed = indexedRecords.get(value);
	if (!indexed || !Number.isSafeInteger(index) || index < 0 || index >= indexed.initialized.length)
		throw new TypeError(`Compiled reactive ${operation} referenced an invalid indexed slot`);
	return indexed;
}

function writeIndexedRecord(indexed: IndexedRecord, index: number, next: unknown): boolean {
	const key = indexedRecordKey(indexed, index);
	const previous = indexed.target[key];
	const raw = retainedIndexedValue(indexed, key, next);
	const value =
		!indexed.options.passthroughKeys?.includes(key) &&
		!isReactiveValue(raw) &&
		raw &&
		typeof raw === 'object' &&
		isReactiveContainer(raw)
			? indexed.wrap(raw as object, indexed.options)
			: raw;
	const wasInitialized = indexed.initialized[index] === true;
	if (wasInitialized && !hasChanged(previous, value)) return true;
	if (hasActiveTransaction())
		recordTransactionUndo(
			() => {
				if (wasInitialized) indexed.target[key] = previous;
				if (!wasInitialized) {
					indexed.initialized[index] = false;
					Reflect.deleteProperty(indexed.target, key);
				}
			},
			indexed.target,
			index
		);
	Reflect.defineProperty(indexed.target, key, {
		configurable: true,
		enumerable: true,
		value,
		writable: true
	});
	indexed.initialized[index] = true;
	trigger(indexed.target, index);
	try {
		indexed.options.onMutation?.(key, 'set');
	} catch {
		// Observability must not alter state semantics.
	}
	return true;
}

function seedIndexedRecord(indexed: IndexedRecord, initial: object): void {
	for (const key of Reflect.ownKeys(initial)) {
		const index = ensureIndexedRecordIndex(indexed, key);
		const raw = retainedIndexedValue(indexed, key, Reflect.get(initial, key));
		indexed.target[key] =
			!indexed.options.passthroughKeys?.includes(key) &&
			!isReactiveValue(raw) &&
			raw &&
			typeof raw === 'object' &&
			isReactiveContainer(raw)
				? indexed.wrap(raw as object, indexed.options)
				: raw;
		indexed.initialized[index] = true;
	}
}

function retainedIndexedValue(
	indexed: IndexedRecord,
	key: PropertyKey,
	value: unknown
): unknown {
	if (indexed.options.passthroughKeys?.includes(key)) return value;
	if (indexed.preserveReactiveValues && isReactiveValue(value)) return value;
	return unwrap(value);
}

function readIndexedValue(indexed: IndexedRecord, key: PropertyKey): unknown {
	const current = indexed.target[key];
	if (indexed.options.passthroughKeys?.includes(key)) return current;
	if (!indexed.preserveReactiveValues || !isReactiveValue(current)) return current;
	const value = current.get();
	const raw = unwrap(value);
	return raw && typeof raw === 'object' && isReactiveContainer(raw)
		? indexed.wrap(raw as object, indexed.options)
		: raw;
}

function deleteIndexedRecord(indexed: IndexedRecord, index: number): boolean {
	const key = indexedRecordKey(indexed, index);
	if (indexed.initialized[index]) {
		const previous = indexed.target[key];
		if (hasActiveTransaction())
			recordTransactionUndo(
				() => {
					Reflect.defineProperty(indexed.target, key, {
						configurable: true,
						enumerable: true,
						value: previous,
						writable: true
					});
					indexed.initialized[index] = true;
				},
				indexed.target,
				index
			);
		trigger(indexed.target, index);
	}
	indexed.initialized[index] = false;
	return Reflect.deleteProperty(indexed.target, key);
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
		const index = indexedRecordIndex(indexed, key);
		if (index === undefined) return undefined;
		indexes.push(index);
	}
	return {
		target: indexed.target,
		keys: indexes
	};
}

function indexedLayout(keys: readonly PropertyKey[]): IndexedLayout {
	const identity = keys as object;
	const cached = indexedLayouts.get(identity);
	if (cached) return cached;
	const indexes = new Map<PropertyKey, number>();
	const uniqueKeys: PropertyKey[] = [];
	for (const key of keys) {
		if (indexes.has(key)) continue;
		indexes.set(key, indexes.size);
		uniqueKeys.push(key);
	}
	const layout = { indexes, keys: uniqueKeys };
	indexedLayouts.set(identity, layout);
	return layout;
}

function indexedRecordIndex(indexed: IndexedRecord, key: PropertyKey): number | undefined {
	return indexed.layout.indexes.get(key) ?? indexed.dynamicIndexes?.get(key);
}

function ensureIndexedRecordIndex(indexed: IndexedRecord, key: PropertyKey): number {
	const existing = indexedRecordIndex(indexed, key);
	if (existing !== undefined) return existing;
	const dynamicIndexes = (indexed.dynamicIndexes ??= new Map());
	const dynamicKeys = (indexed.dynamicKeys ??= []);
	const index = indexed.layout.keys.length + dynamicIndexes.size;
	dynamicIndexes.set(key, index);
	dynamicKeys.push(key);
	indexed.initialized.push(false);
	return index;
}

function indexedRecordKey(indexed: IndexedRecord, index: number): PropertyKey {
	if (index < indexed.layout.keys.length) return indexed.layout.keys[index]!;
	return indexed.dynamicKeys![index - indexed.layout.keys.length]!;
}
