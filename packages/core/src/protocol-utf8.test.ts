import { describe, expect, it } from 'vitest';
import { protocolUtf8ByteLength } from './protocol-utf8.js';

describe('protocol UTF-8 byte counting', () => {
	it('matches TextEncoder across ASCII, Unicode, lone surrogates, and the fast-path boundary', () => {
		const encoder = new TextEncoder();
		const values = [
			'',
			'\u0000',
			'\u007f',
			'\u0080',
			'\u07ff',
			'\u0800',
			'\ud800',
			'\udfff',
			'😀',
			'é漢字',
			'a😀b',
			'\ud800\ud800\udc00',
			'\udc00\ud800',
			'😀'.repeat(32)
		];
		for (const length of [63, 64, 65, 1024]) {
			values.push('a'.repeat(length), 'a'.repeat(length) + '😀');
		}
		for (let point = 0; point <= 0xffff; point += 97) {
			values.push(String.fromCharCode(point, point ^ 0x8000));
		}
		for (const value of values)
			expect(protocolUtf8ByteLength(value)).toBe(encoder.encode(value).byteLength);
	});
});
