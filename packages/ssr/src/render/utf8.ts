/** Counts a string's encoded UTF-8 length without constructing an encoded buffer. */
export function utf8ByteLength(value: string): number {
	let bytes = 0;
	for (let index = 0; index < value.length; index++) {
		const code = value.charCodeAt(index);
		if (code <= 0x7f) bytes++;
		else if (code <= 0x7ff) bytes += 2;
		else if (isHighSurrogate(code) && isLowSurrogate(value.charCodeAt(index + 1))) {
			bytes += 4;
			index++;
		} else bytes += 3;
	}
	return bytes;
}

/** Reports whether one UTF-16 code unit begins a surrogate pair. */
export function isHighSurrogate(code: number): boolean {
	return code >= 0xd800 && code <= 0xdbff;
}

/** Reports whether one UTF-16 code unit completes a surrogate pair. */
export function isLowSurrogate(code: number): boolean {
	return code >= 0xdc00 && code <= 0xdfff;
}
