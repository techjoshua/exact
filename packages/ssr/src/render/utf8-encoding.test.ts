import { describe, expect, it } from 'vitest';
import { createSsrUtf8Codec } from './utf8-encoding.js';

describe('SSR UTF-8 host capabilities', () => {
	it.each([
		{ name: 'portable', host: undefined },
		{ name: 'native', host: Buffer }
	])('preserves encoding and independent output ownership ($name)', ({ host }) => {
		const codec = createSsrUtf8Codec(host);
		const encoder = new TextEncoder();
		for (const value of ['', 'plain & text', 'caf\u00e9 \ud83d\ude80 \u65e5', '\ud800x\udc00']) {
			const expected = encoder.encode(value);
			expect([...codec.encode(value)]).toEqual([...expected]);
			if (codec.byteLength) expect(codec.byteLength(value)).toBe(expected.byteLength);
		}
		const first = codec.encode('first');
		const second = codec.encode('second');
		first.fill(0);
		expect(new TextDecoder().decode(second)).toBe('second');
	});
	it('supports hosts that provide only byte counting', () => {
		const codec = createSsrUtf8Codec({ byteLength: Buffer.byteLength });
		expect([...codec.encode('\u00e9')]).toEqual([195, 169]);
		expect(codec.byteLength?.('\u00e9')).toBe(2);
	});
});
