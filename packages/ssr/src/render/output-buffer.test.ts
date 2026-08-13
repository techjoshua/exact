import { describe, expect, it } from 'vitest';
import { SsrOutputBuffer, utf8ByteLength } from './output-buffer.js';

describe('SSR output buffering', () => {
	it('counts UTF-8 without allocating an encoded copy', () => {
		expect(utf8ByteLength('plain')).toBe(5);
		expect(utf8ByteLength('café')).toBe(5);
		expect(utf8ByteLength('\ud83d\ude80')).toBe(4);
		expect(utf8ByteLength('\ud800')).toBe(3);
	});

	it('accounts for surrogate pairs split across renderer chunks', () => {
		const output = new SsrOutputBuffer(4);
		output.append('\ud83d');
		output.append('\ude80');

		expect(output.finish()).toEqual(['\ud83d', '\ude80']);
	});

	it('rejects output incrementally before constructing a final string', () => {
		const output = new SsrOutputBuffer(4);
		output.append('abc');

		expect(() => output.append('é')).toThrow(
			'eXact SSR output exceeds the configured maximum of 4 bytes'
		);
	});
});
