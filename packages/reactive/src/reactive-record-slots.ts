import type { IndexedLayout } from './indexed-layout.js';

/** Mutable instance-local extension of one immutable compiler-indexed layout. */
export type IndexedRecordLayout = {
	readonly layout: IndexedLayout;
	dynamicIndexes?: Map<PropertyKey, number>;
	dynamicKeys?: PropertyKey[];
	readonly initialized: boolean[];
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
	record.initialized.push(false);
	return index;
}

/** Resolves one validated numeric slot back to its authored property identity. */
export function indexedRecordKey(record: IndexedRecordLayout, index: number): PropertyKey {
	if (index < record.layout.keys.length) return record.layout.keys[index]!;
	return record.dynamicKeys![index - record.layout.keys.length]!;
}
