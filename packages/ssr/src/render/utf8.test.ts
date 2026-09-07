import { describe, expect, it } from 'vitest';
import { utf8ByteLength } from './utf8.js';

describe('SSR UTF-8 byte length', () => {
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
			'x'.repeat(8192) + '\udc00'
		])
			expect(utf8ByteLength(value)).toBe(encoder.encode(value).byteLength);
	});

	it('counts every UTF-16 code unit, including paired and unpaired surrogates', () => {
		const encoder = new TextEncoder();
		for (let start = 0; start < 65536; start += 256) {
			const value = String.fromCharCode(
				...Array.from({ length: 256 }, (_, index) => start + index)
			);
			expect(utf8ByteLength(value)).toBe(encoder.encode(value).byteLength);
		}
	});
});
