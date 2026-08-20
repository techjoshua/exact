import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { readBoundedLines } from './bounded-lines.js';

describe('language protocol framing', () => {
	it('rejects an oversized unterminated frame before buffering the remainder', () => {
		const stream = new PassThrough();
		const onLine = vi.fn();
		const onError = vi.fn();
		readBoundedLines(stream, 4, onLine, onError);
		stream.write('12345');
		expect(onLine).not.toHaveBeenCalled();
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ message: 'Language protocol frame exceeded its byte limit' })
		);
	});
});
