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

/** Narrows generated metadata to a non-array record. */
export function isContractRecord(value: unknown): value is Record<string, any> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Requires a stable generated contract name to be non-empty. */
export function isContractString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

/** Rejects unexpected fields in versioned generated metadata. */
export function hasOnlyContractKeys(
	value: Record<string, any>,
	allowed: readonly string[]
): boolean {
	return Object.keys(value).every((key) => allowed.includes(key));
}
