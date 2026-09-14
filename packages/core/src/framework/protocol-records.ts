const reservedObjectKeys = new Set(['__proto__', 'prototype', 'constructor']);

export { protocolUtf8ByteLength } from '../protocol-utf8.js';

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

/** Validates the exact finite discriminator shape used by server slots and hydration. */
export function isServerSlotDiscriminator(value: unknown): boolean {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const discriminator = value as Record<string, unknown>;
	if (discriminator.kind === 'single') return Object.keys(discriminator).length === 1;
	if (discriminator.kind === 'branch')
		return (
			Object.keys(discriminator).length === 2 &&
			typeof discriminator.branch === 'string' &&
			!!discriminator.branch
		);
	return (
		discriminator.kind === 'keyed' &&
		Object.keys(discriminator).length === 3 &&
		typeof discriminator.list === 'string' &&
		!!discriminator.list &&
		typeof discriminator.keyToken === 'string' &&
		!!discriminator.keyToken
	);
}

/** Validates a partial response tree without traversing authorized subtrees. */
export function stateNodeMatchesWrites(
	value: object,
	path: string,
	writes: readonly string[]
): boolean {
	for (const key of Object.keys(value)) {
		if (!isSafeProtocolKey(key)) return false;
		if (Array.isArray(value) && !/^(0|[1-9]\d*)$/.test(key)) return false;
		const childPath = path ? `${path}.${key}` : key;
		if (writes.includes(childPath)) continue;
		if (!writes.some((write) => write.startsWith(`${childPath}.`))) return false;
		const child = (value as Record<string, unknown>)[key];
		if (!child || typeof child !== 'object') return false;
		if (!stateNodeMatchesWrites(child, childPath, writes)) return false;
	}
	return true;
}
