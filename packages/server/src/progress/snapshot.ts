import { decodeReactiveProtocolValue, encodeReactiveProtocolValue } from '@exactjs/core';
import { isJsonSafe } from '../protocol.js';

/** Captures a standalone transport snapshot at report time, before authored data can mutate. */
export function captureProgressSnapshot(snapshot: unknown): unknown {
	const limits = { maxDepth: 32, maxNodes: 10_000, maxBytes: 64 * 1024 };
	if (!isJsonSafe(snapshot, limits))
		throw new TypeError('Invalid or oversized task progress snapshot');
	const encoded = encodeReactiveProtocolValue(snapshot);
	if (!isJsonSafe(encoded, limits)) throw new TypeError('Invalid encoded task progress snapshot');
	const json = JSON.stringify(encoded);
	if (new TextEncoder().encode(json).byteLength > limits.maxBytes)
		throw new TypeError('Task progress snapshot exceeds 64 KiB');
	return decodeReactiveProtocolValue(JSON.parse(json));
}
