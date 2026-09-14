import { describe, expect, it } from 'vitest';
import { portableUtf8ByteLength, utf8ByteLength } from './utf8.js';

describe.each([
	{ name: 'host', countBytes: utf8ByteLength },
	{ name: 'portable', countBytes: portableUtf8ByteLength }
])('SSR UTF-8 byte length ($name)', ({ countBytes }) => {
	it('matches platform encoding for short and long ASCII, escaping characters, and Unicode', () => {
		const encoder = new TextEncoder();
		for (const value of [
			'',
			'x',
			'x'.repeat(31),
			'x'.repeat(32),
			'x'.repeat(8192),
			'\0\t\n<&>"'.repeat(20),
			'\u00e9'.repeat(100),
			'\u4e16\u754c'.repeat(100),
			'x'.repeat(8192) + '\ud83d\ude80',
			'\ud800' + 'x'.repeat(8192),
			'x'.repeat(8192) + '\udc00',
			'abc\u00e9 \ud83d\ude80 \u65e5'.repeat(100),
			('x'.repeat(128) + '\u65e5').repeat(16) + 'abc\u00e9 \ud83d\ude80'.repeat(100)
		])
			expect(countBytes(value)).toBe(encoder.encode(value).byteLength);
	});

	it('counts every UTF-16 code unit, including paired and unpaired surrogates', () => {
		const encoder = new TextEncoder();
		for (let start = 0; start < 65536; start += 256) {
			const value = String.fromCharCode(
				...Array.from({ length: 256 }, (_, index) => start + index)
			);
			expect(countBytes(value)).toBe(encoder.encode(value).byteLength);
		}
	});
});
