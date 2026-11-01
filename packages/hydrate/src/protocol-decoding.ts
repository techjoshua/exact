import { decodeReactiveProtocolValue } from '@exactjs/core';
import { isDecodedProtocolSafe, isJsonSafe } from './validation.js';

/** Bounds applied while decoding an untrusted reactive-protocol value. */
export type ReactiveProtocolDecodeLimits = {
	readonly maxDepth?: number;
	readonly maxNodes?: number;
	readonly maxBytes?: number;
	readonly onResource?: (kind: 'depth' | 'nodes' | 'bytes', actual: number) => void;
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
		decoded = decodeReactiveProtocolValue(
			encoded,
			limits.onResource ? { maxDepth: Number.MAX_SAFE_INTEGER } : undefined
		);
	} catch {
		throw failure();
	}
	if (!isDecodedProtocolSafe(decoded, limits)) throw failure();
	return decoded;
}
