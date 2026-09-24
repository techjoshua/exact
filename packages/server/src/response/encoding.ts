type EncodeUtf8 = (chunk: string) => Uint8Array<ArrayBuffer>;
const hostBuffer = (globalThis as { Buffer?: { from?: EncodeUtf8 } }).Buffer;
const utf8 = new TextEncoder();
const encodeUtf8 =
	typeof hostBuffer?.from === 'function'
		? hostBuffer.from.bind(hostBuffer)
		: utf8.encode.bind(utf8);

/**
 * Preserves split surrogate pairs without retaining complete response text. Native host encoding
 * is preferred; portable hosts use TextEncoder. Each returned byte range owns its output.
 */
export function createResponseEncoder(encode: EncodeUtf8 = encodeUtf8): {
	encode(chunk: string): Uint8Array<ArrayBuffer>;
	finish(): Uint8Array<ArrayBuffer>;
} {
	let pending = '';
	return {
		encode(chunk) {
			if (pending) {
				chunk = pending + chunk;
				pending = '';
			}
			const last = chunk.charCodeAt(chunk.length - 1);
			if (last >= 0xd800 && last <= 0xdbff) {
				pending = chunk.slice(-1);
				chunk = chunk.slice(0, -1);
			}
			return encode(chunk);
		},
		finish() {
			const result = encode(pending);
			pending = '';
			return result;
		}
	};
}
