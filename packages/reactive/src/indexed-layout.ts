/** Immutable mapping between authored property names and compiler-addressable slots. */
export type IndexedLayout = Readonly<{
	indexes: ReadonlyMap<PropertyKey, number>;
	keys: readonly PropertyKey[];
}>;

const indexedLayouts = new WeakMap<object, IndexedLayout>();

/** Reuses one immutable indexed layout for every facade built from the same compiler key array. */
export function indexedLayout(keys: readonly PropertyKey[]): IndexedLayout {
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
