import { readReactiveOwnProperty } from './proxy/property-descriptors.js';
import type { ReactiveOptions, ReactiveRef, ReactiveValue } from './internal/types.js';
import type { IndexedLayout } from './indexed-layout.js';

/** Mutable instance-local extension of one immutable compiler-indexed layout. */
export type IndexedRecordLayout = {
	readonly layout: IndexedLayout;
	dynamicIndexes?: Map<PropertyKey, number>;
	dynamicKeys?: PropertyKey[];
};

/** Resolves a compiler-known or instance-local dynamic property to its stable numeric slot. */
export function indexedRecordIndex(
	record: IndexedRecordLayout,
	key: PropertyKey
): number | undefined {
	return record.layout.indexes.get(key) ?? record.dynamicIndexes?.get(key);
}

/** Resolves one property slot, extending only the receiving instance for a dynamic property. */
export function ensureIndexedRecordIndex(record: IndexedRecordLayout, key: PropertyKey): number {
	const existing = indexedRecordIndex(record, key);
	if (existing !== undefined) return existing;
	const dynamicIndexes = (record.dynamicIndexes ??= new Map());
	const dynamicKeys = (record.dynamicKeys ??= []);
	const index = record.layout.keys.length + dynamicIndexes.size;
	dynamicIndexes.set(key, index);
	dynamicKeys.push(key);
	return index;
}

/** Resolves one validated numeric slot back to its authored property identity. */
export function indexedRecordKey(record: IndexedRecordLayout, index: number): PropertyKey {
	if (index < record.layout.keys.length) return record.layout.keys[index]!;
	return record.dynamicKeys![index - record.layout.keys.length]!;
}

/** Counts compiler-known and instance-local property slots independently of field presence. */
export function indexedRecordSlotCount(record: IndexedRecordLayout): number {
	return record.layout.keys.length + (record.dynamicKeys?.length ?? 0);
}

/** Instance-owned indexed storage and lazily allocated dependency descriptors. Native properties own field presence. */
export type IndexedRecord = IndexedRecordLayout & {
	readonly target: Record<PropertyKey, unknown>;
	readonly options: ReactiveOptions;
	readonly wrap: (value: object, options: ReactiveOptions, parentSource?: ReactiveRef) => object;
	readonly preserveReactiveValues: boolean;
	sources?: ReactiveRef[];
	values?: ReactiveValue[];
};

/** Locates private records without retaining a facade beyond its own lifetime. */
export const indexedRecords = new WeakMap<object, IndexedRecord>();

/** Validates compiler-selected slot identity before a direct runtime operation. */
export function indexedRecord(value: object, index: number, operation: string): IndexedRecord {
	const indexed = indexedRecords.get(value);
	if (
		!indexed ||
		!Number.isSafeInteger(index) ||
		index < 0 ||
		index >= indexedRecordSlotCount(indexed)
	)
		throw new TypeError(`Compiled reactive ${operation} referenced an invalid indexed slot`);
	return indexed;
}

/** Reads native destination constraints without evaluating a slot getter. */
export function indexedReactiveSlotDescriptor(
	value: object,
	index: number
): PropertyDescriptor | undefined {
	const indexed = indexedRecord(value, index, 'describe');
	return Reflect.getOwnPropertyDescriptor(indexed.target, indexedRecordKey(indexed, index));
}

/** Stable dependency keys for compiler-known fields on one indexed reactive target. */
export type ReactiveOwnDependencies = Readonly<{
	target: object;
	keys: readonly PropertyKey[];
}>;

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

/** Resolves compiler-emitted numeric fields without repeating a property-layout lookup. */
export function reactiveIndexedDependencies(
	value: object,
	indexes: readonly number[]
): ReactiveOwnDependencies | undefined {
	const indexed = indexedRecords.get(value);
	if (!indexed) return undefined;
	for (const index of indexes) {
		if (!Number.isSafeInteger(index) || index < 0 || index >= indexedRecordSlotCount(indexed))
			return undefined;
	}
	return { target: indexed.target, keys: indexes };
}

/** Reads the retained source value for one validated compiler-indexed field without evaluating it. */
export function readIndexedReactiveSource(
	value: object,
	index: number
): { present: true; value: unknown } | { present: false } {
	const indexed = indexedRecords.get(value);
	if (
		!indexed ||
		!Number.isSafeInteger(index) ||
		index < 0 ||
		index >= indexedRecordSlotCount(indexed)
	)
		return { present: false };
	return readReactiveOwnProperty(value, indexedRecordKey(indexed, index));
}
