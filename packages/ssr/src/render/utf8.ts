import { nativeUtf8ByteLength } from './utf8-encoding.js';

const nonAsciiCodeUnit = /[\u0080-\uffff]/g;

/** Counts a string's encoded UTF-8 length without constructing an encoded buffer. */
export function utf8ByteLength(value: string): number {
	return nativeUtf8ByteLength ? nativeUtf8ByteLength(value) : portableUtf8ByteLength(value);
}

/** Counts UTF-8 bytes when the host does not supply a native counter, including unpaired surrogates. */
export function portableUtf8ByteLength(value: string): number {
	if (value.length >= 32) {
		let bytes = value.length;
		nonAsciiCodeUnit.lastIndex = 0;
		let windowStart = -1;
		let matches = 0;
		let nonAsciiUnits = 0;
		while (nonAsciiCodeUnit.test(value)) {
			const index = nonAsciiCodeUnit.lastIndex - 1;
			if (windowStart < 0) windowStart = index;
			const code = value.charCodeAt(index);
			nonAsciiUnits++;
			if (code <= 0x7ff) bytes++;
			else {
				bytes += 2;
				if (isHighSurrogate(code) && isLowSurrogate(value.charCodeAt(index + 1))) {
					nonAsciiCodeUnit.lastIndex++;
					nonAsciiUnits++;
				}
			}
			// Native searching skips sparse ASCII spans; dense text favors a simple loop.
			if (++matches === 8) {
				const end = nonAsciiCodeUnit.lastIndex;
				if (nonAsciiUnits * 4 > end - windowStart)
					return bytes - (value.length - end) + countUtf8Suffix(value, end);
				windowStart = end;
				matches = 0;
				nonAsciiUnits = 0;
			}
		}
		return bytes;
	}
	return countUtf8Suffix(value, 0);
}

function countUtf8Suffix(value: string, start: number): number {
	let bytes = 0;
	for (let index = start; index < value.length; index++) {
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
