/** Validates non-empty generated names without prototype-bearing dictionary keys. */
export function isSafeContractStringList(value: unknown): value is string[] {
	return (
		Array.isArray(value) &&
		value.every(
			(item) =>
				isContractString(item) &&
				item !== '__proto__' &&
				item !== 'prototype' &&
				item !== 'constructor'
		)
	);
}

/** Accepts opaque symbol keys and safe generated names for runtime prop metadata. */
export function isSafeContractPropertyKeyList(value: unknown): value is (string | symbol)[] {
	return (
		Array.isArray(value) &&
		value.every((item) => typeof item === 'symbol' || isSafeContractStringList([item]))
	);
}

/** Narrows generated metadata to a non-array record. */
export function isContractRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Requires a stable generated contract name to be non-empty. */
export function isContractString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

/** Rejects unexpected fields in versioned generated metadata. */
export function hasOnlyContractKeys(
	value: Record<string, unknown>,
	allowed: readonly string[]
): boolean {
	return Object.keys(value).every((key) => allowed.includes(key));
}

/** Validates compiler-owned reactive allocation metadata shared by artifacts and execution plans. */
export function isReactiveAllocation(value: unknown): boolean {
	return (
		isContractRecord(value) &&
		hasOnlyContractKeys(value, ['name', 'provenance', 'allocation', 'dependencies']) &&
		isContractString(value.name) &&
		typeof value.provenance === 'string' &&
		['state', 'props', 'context', 'derived', 'cell', 'snapshot', 'unknown'].includes(
			value.provenance
		) &&
		typeof value.allocation === 'string' &&
		['constant', 'live-slot', 'inline', 'computed', 'snapshot', 'structural'].includes(
			value.allocation
		) &&
		isSafeContractStringList(value.dependencies)
	);
}
