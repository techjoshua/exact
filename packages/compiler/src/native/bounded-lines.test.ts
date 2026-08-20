import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { readBoundedLines } from './bounded-lines.js';

describe('bounded subprocess line framing', () => {
	it('rejects an unterminated frame as soon as it exceeds the byte limit', () => {
		const stream = new PassThrough();
		const onLine = vi.fn();
		const onError = vi.fn();
		readBoundedLines(stream, { maxBytes: 4, onLine, onError });
		stream.write('12345');
		expect(onLine).not.toHaveBeenCalled();
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ message: 'Subprocess response frame exceeded its byte limit' })
		);
	});

	it('frames multiple lines without retaining prior bytes', () => {
		const stream = new PassThrough();
		const lines: string[] = [];
		readBoundedLines(stream, {
			maxBytes: 4,
			onLine: (line) => lines.push(line),
			onError: (error) => {
				throw error;
			}
		});
		stream.write('one\ntwo\n');
		expect(lines).toEqual(['one', 'two']);
	});
});
