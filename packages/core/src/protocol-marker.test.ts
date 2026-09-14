import { describe, expect, it } from 'vitest';
import { decodeExactMarkerPart, encodeExactMarkerPart } from './protocol.js';

describe('marker protocol encoding', () => {
	it('preserves direct keys and the canonical UTF-8 hex wire format', () => {
		for (const value of ['plain', 'A-z_0.9', '-', 'a-b'])
			expect(encodeExactMarkerPart(value)).toBe(value);
		expect(encodeExactMarkerPart('/assets/app.js')).toBe('~2f6173736574732f6170702e6a73');
		expect(encodeExactMarkerPart('--')).toBe('~2d2d');
		const values = [
			'',
			'<!-->',
			'\u0000',
			'\u007f',
			'\u0080',
			'\u07ff',
			'\u0800',
			'\ud800',
			'\udfff',
			'\ud83d\ude80',
			'\ud800\ud800\udc00'
		];
		for (let point = 0; point <= 0xffff; point += 97)
			values.push('/' + String.fromCharCode(point, point ^ 0x8000));
		for (const value of values) {
			const bytes = new TextEncoder().encode(value);
			const expected =
				'~' + Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
			expect(encodeExactMarkerPart(value)).toBe(expected);
			if (bytes.length)
				expect(decodeExactMarkerPart(expected)).toBe(new TextDecoder().decode(bytes));
		}
	});
});
