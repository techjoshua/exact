const utf8Encoder = new TextEncoder();

/** Normalizes a positive integer limit or returns its configured fallback. */
export function positiveLimit(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

/** Measures a string's UTF-8 representation with one shared stateless encoder. */
export function utf8ByteLength(value: string): number {
	return utf8Encoder.encode(value).byteLength;
}
