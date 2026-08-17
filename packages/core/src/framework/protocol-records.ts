const reservedObjectKeys = new Set(['__proto__', 'prototype', 'constructor']);

/** Returns whether a key can be materialized in an eXact protocol dictionary. */
export function isSafeProtocolKey(key: string): boolean {
	return !reservedObjectKeys.has(key);
}

/** Creates a prototype-free dictionary for decoded or generated protocol records. */
export function createProtocolRecord<T>(): Record<string, T> {
	return Object.create(null) as Record<string, T>;
}

/** Normalizes a positive safe-integer protocol resource limit. */
export function normalizeProtocolLimit(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

/**
 * Validates every own key in a recursively decoded JSON-like protocol value.
 * Cycles are tolerated for defensive use outside JSON decoding.
 */
export function hasOnlySafeProtocolKeys(value: unknown): boolean {
	if (!value || typeof value !== 'object') return true;
	const pending: object[] = [value];
	const seen = new WeakSet<object>();
	while (pending.length) {
		const current = pending.pop()!;
		if (seen.has(current)) continue;
		seen.add(current);
		for (const key of Object.keys(current)) {
			if (!isSafeProtocolKey(key)) return false;
			const child = (current as Record<string, unknown>)[key];
			if (child && typeof child === 'object') pending.push(child);
		}
	}
	return true;
}
