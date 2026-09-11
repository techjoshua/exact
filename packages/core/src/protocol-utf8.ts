const encoder = new TextEncoder();
/** Counts UTF-8 bytes without buffering short strings, matching TextEncoder for lone surrogates. */
export function protocolUtf8ByteLength(value: string): number {
	if (value.length > 64) return encoder.encode(value).byteLength;
	let bytes = 0;
	for (let index = 0; index < value.length; index++) {
		const code = value.charCodeAt(index);
		if (code <= 0x7f) bytes++;
		else if (code <= 0x7ff) bytes += 2;
		else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
			const next = value.charCodeAt(index + 1);
			if (next >= 0xdc00 && next <= 0xdfff) {
				bytes += 4;
				index++;
			} else bytes += 3;
		} else bytes += 3;
	}
	return bytes;
}
