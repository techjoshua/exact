/** Optional host capabilities for UTF-8 encoding without a Node module dependency. */
export type HostUtf8Buffer = {
	from?: (value: string) => Uint8Array;
	byteLength?: (value: string) => number;
};

/** Request-independent encoding operations whose returned byte ranges remain independently owned. */
export type SsrUtf8Codec = {
	encode(value: string): Uint8Array;
	byteLength?: (value: string) => number;
};

/** Selects available host encoding capabilities, retaining standard TextEncoder support. */
export function createSsrUtf8Codec(buffer?: HostUtf8Buffer): SsrUtf8Codec {
	const encoder = typeof buffer?.from === 'function' ? undefined : new TextEncoder();
	return {
		encode: encoder ? encoder.encode.bind(encoder) : buffer!.from!.bind(buffer),
		byteLength:
			typeof buffer?.byteLength === 'function' ? buffer.byteLength.bind(buffer) : undefined
	};
}

const codec = createSsrUtf8Codec((globalThis as { Buffer?: HostUtf8Buffer }).Buffer);

/** Encodes an independently owned output range using the current host's UTF-8 implementation. */
export const encodeSsrUtf8 = codec.encode;

/** Native byte counting when provided by the host; portable callers retain their own fallback. */
export const nativeUtf8ByteLength = codec.byteLength;
