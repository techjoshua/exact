import { decodeReactiveProtocolValue } from '@exactjs/core';
import { isJsonSafe } from './validation.js';

/** Bounds applied while decoding an untrusted reactive-protocol value. */
export type ReactiveProtocolDecodeLimits = {
	readonly maxDepth?: number;
	readonly maxNodes?: number;
	readonly maxBytes?: number;
};

/** Validates, decodes, and revalidates an untrusted reactive-protocol graph. */
export function decodeBoundedReactiveProtocolValue(
	encoded: unknown,
	limits: ReactiveProtocolDecodeLimits,
	failure: () => Error
): unknown {
	if (!isJsonSafe(encoded, limits)) throw failure();
	let decoded: unknown;
	try {
		decoded = decodeReactiveProtocolValue(encoded);
	} catch {
		throw failure();
	}
	if (!isJsonSafe(decoded, limits)) throw failure();
	return decoded;
}
