import { describe, expect, it, vi } from 'vitest';
import { createHtmlStream } from './creation.js';

describe('HTML stream iterator ownership', () => {
	it.each([
		{ chunks: ['ab'], options: { maxBytes: 1 }, error: 'byte limit' },
		{ chunks: ['é'], options: { maxBytes: 1 }, error: 'byte limit' },
		{ chunks: ['a', 'b'], options: { maxChunks: 1 }, error: 'chunk limit' }
	])('closes an iterator after $error rejects publication', async ({ chunks, options, error }) => {
		const close = vi.fn();
		const iterator = chunks[Symbol.iterator]();
		const returned = vi.fn(() => ({ done: true as const, value: undefined }));
		iterator.return = returned;
		const reader = createHtmlStream(
			{ [Symbol.iterator]: () => iterator },
			{ ...options, close }
		).getReader();
		try {
			await expect(
				(async () => {
					while (!(await reader.read()).done) {
						/* drain accepted bytes */
					}
				})()
			).rejects.toThrow(error);
			expect(returned).toHaveBeenCalledOnce();
			expect(close).toHaveBeenCalledOnce();
		} finally {
			await reader.cancel().catch(() => undefined);
			reader.releaseLock();
		}
	});

	it('keeps an iterator failure primary and runs independent cleanup after return fails', async () => {
		const failure = new Error('iterator failed');
		const cleanup = new Error('return failed');
		const close = vi.fn();
		const iterator: Iterator<string> = {
			next() {
				throw failure;
			},
			return() {
				throw cleanup;
			}
		};
		const reader = createHtmlStream({ [Symbol.iterator]: () => iterator }, { close }).getReader();
		try {
			await expect(reader.read()).rejects.toBe(failure);
			expect(failure).toHaveProperty('suppressed', [cleanup]);
			expect(close).toHaveBeenCalledOnce();
		} finally {
			await reader.cancel().catch(() => undefined);
			reader.releaseLock();
		}
	});

	it('does not pull a pre-aborted iterator and releases its resources exactly once', async () => {
		const request = new AbortController();
		const reason = new Error('request aborted');
		request.abort(reason);
		const next = vi.fn(() => ({ done: false, value: 'unused' }));
		const returned = vi.fn(() => ({ done: true as const, value: undefined }));
		const close = vi.fn();
		const reader = createHtmlStream(
			{ [Symbol.iterator]: () => ({ next, return: returned }) },
			{
				signal: request.signal,
				close
			}
		).getReader();
		try {
			await expect(reader.read()).rejects.toBe(reason);
			expect(next).not.toHaveBeenCalled();
			expect(returned).toHaveBeenCalledOnce();
			expect(close).toHaveBeenCalledOnce();
		} finally {
			await reader.cancel().catch(() => undefined);
			reader.releaseLock();
		}
	});
});

it('allows a consumed HTML stream to outlive a default chunk-count threshold', async () => {
	let closed = 0;
	function* chunks() {
		try {
			for (let index = 0; index < 100_001; index++) yield 'x';
		} finally {
			closed++;
		}
	}
	const reader = createHtmlStream(chunks()).getReader();
	let bytes = 0;
	try {
		for (;;) {
			const next = await reader.read();
			if (next.done) break;
			bytes += next.value.byteLength;
		}
		expect(bytes).toBe(100_001);
		expect(closed).toBe(1);
	} finally {
		await reader.cancel().catch(() => undefined);
		reader.releaseLock();
	}
});
