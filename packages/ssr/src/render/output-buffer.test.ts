import { describe, expect, it, vi } from 'vitest';
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

	it('uses an environment byte-length operation without weakening split-surrogate accounting', () => {
		const encodedByteLength = vi.fn(utf8ByteLength);
		const output = new SsrOutputBuffer(9, undefined, encodedByteLength);
		output.append('caf\u00e9');
		output.append('\ud83d');
		output.append('\ude80');

		expect(output.encodedBytes()).toBe(9);
		expect(encodedByteLength).toHaveBeenCalledOnce();
		expect(encodedByteLength).toHaveBeenCalledWith('caf\u00e9');
	});

	it('joins compiler-known byte facts across surrogate boundaries', () => {
		const output = new SsrOutputBuffer(4);
		output.accountKnown('\ud83d', 3);
		output.accountKnown('\ude80', 3);
		output.appendAccounted('\ud83d\ude80');

		expect(output.finish()).toEqual(['\ud83d\ude80']);
	});

	it('charges a compiler-proven byte-closed program as one span', () => {
		const output = new SsrOutputBuffer(8);
		output.accountKnown('\ud800', 3);
		output.accountClosedBytes(4);
		output.appendAccounted('\ud800caf\u00e9');

		expect(output.finish()).toEqual(['\ud800caf\u00e9']);
	});

	it('restores byte provenance after a failed component attempt', () => {
		const output = new SsrOutputBuffer(4);
		output.accountKnown('ab', 2);
		const checkpoint = output.checkpoint();
		output.accountKnown('cd', 2);
		output.rollback(checkpoint);
		output.accountKnown('Ã©', 2);
		output.appendAccounted('abÃ©');

		expect(output.finish()).toEqual(['abÃ©']);
	});

	it('rescans the completed root after foreign output invalidates provenance', () => {
		const output = new SsrOutputBuffer(4);
		output.accountKnown('ignored', 1);
		output.invalidateAccounting();

		expect(() => output.appendAccounted('abcÃ©')).toThrow(
			'eXact SSR output exceeds the configured maximum of 4 bytes'
		);
	});

	it('rejects output incrementally before constructing a final string', () => {
		const output = new SsrOutputBuffer(4);
		output.append('abc');

		expect(() => output.append('é')).toThrow(
			'eXact SSR output exceeds the configured maximum of 4 bytes'
		);
	});
});
