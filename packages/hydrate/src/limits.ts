const utf8Encoder = new TextEncoder();

/** Normalizes a positive integer limit or returns its configured fallback. */
export { normalizeProtocolLimit as positiveLimit } from '@exactjs/core/framework/protocol-records';

/** Measures a string's UTF-8 representation with one shared stateless encoder. */
export function utf8ByteLength(value: string): number {
	return utf8Encoder.encode(value).byteLength;
}
