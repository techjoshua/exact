/** JSON-compatible values accepted by canonical protocol serialization. */
export type IntlCanonicalValue =
	| null
	| boolean
	| number
	| string
	| readonly IntlCanonicalValue[]
	| Readonly<{ [key: string]: IntlCanonicalValue }>;

/** Serializes semantic message data with stable ordering and Unicode normalization. */
export function canonicalizeIntlValue(value: IntlCanonicalValue): string {
	return serializeCanonical(value, new Set<object>());
}

function serializeCanonical(value: IntlCanonicalValue, ancestors: Set<object>): string {
	if (value === null || typeof value === 'boolean') return JSON.stringify(value);
	if (typeof value === 'number') {
		if (!Number.isFinite(value))
			throw new TypeError('Intl canonical values require finite numbers');
		return JSON.stringify(Object.is(value, -0) ? 0 : value);
	}
	if (typeof value === 'string') return JSON.stringify(value.normalize('NFC'));
	if (ancestors.has(value)) throw new TypeError('Intl canonical values cannot contain cycles');
	ancestors.add(value);
	try {
		if (Array.isArray(value))
			return `[${value.map((entry) => serializeCanonical(entry, ancestors)).join(',')}]`;
		const normalized = new Map<string, IntlCanonicalValue>();
		for (const [rawKey, entry] of Object.entries(value)) {
			const key = rawKey.normalize('NFC');
			if (normalized.has(key))
				throw new TypeError(`Intl canonical object contains duplicate normalized key "${key}"`);
			normalized.set(key, entry);
		}
		return `{${[...normalized.entries()]
			.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
			.map(([key, entry]) => `${JSON.stringify(key)}:${serializeCanonical(entry, ancestors)}`)
			.join(',')}}`;
	} finally {
		ancestors.delete(value);
	}
}
