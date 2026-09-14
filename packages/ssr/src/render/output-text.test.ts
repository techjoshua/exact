import { describe, expect, it } from 'vitest';
import { createSsrContext } from './context.js';
import { SsrOutputBuffer } from './output-buffer.js';
import { escapeSsrText } from './output-text.js';

describe('SSR output text accounting', () => {
	it('preserves long text, escaping and exact limits with portable and native counters', () => {
		for (const counter of [undefined, (value: string) => Buffer.byteLength(value)]) {
			for (const value of [
				'a'.repeat(31),
				'a'.repeat(32),
				'\u6f22\u5b57\ud83d\ude80'.repeat(32),
				'\u6f22<&>'.repeat(32),
				'a'.repeat(32) + '\ud800'
			]) {
				const expected = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
				const bytes = Buffer.byteLength(expected);
				for (const limit of [bytes, bytes - 1]) {
					const context = createSsrContext({ maxOutputBytes: limit });
					const output = new SsrOutputBuffer(limit, undefined, counter);
					context.outputSink = output;
					const render = () => {
						const html = escapeSsrText(context, value);
						output.appendAccounted(html);
						return { html, bytes: output.encodedBytes() };
					};
					if (limit === bytes) expect(render()).toEqual({ html: expected, bytes });
					else expect(render).toThrow('exceeds the configured maximum');
				}
			}
		}
	});

	it('accounts surrogate pairs spanning long text publications', () => {
		const chunks = ['a'.repeat(32) + '\ud83d', '\ude80' + 'b'.repeat(32)];
		const expected = chunks.join('');
		for (const counter of [undefined, (value: string) => Buffer.byteLength(value)]) {
			const context = createSsrContext({ maxOutputBytes: Buffer.byteLength(expected) });
			const output = new SsrOutputBuffer(context.maxOutputBytes, undefined, counter);
			context.outputSink = output;
			for (const chunk of chunks) output.appendAccounted(escapeSsrText(context, chunk));
			expect(output.finish().join('')).toBe(expected);
			expect(output.encodedBytes()).toBe(Buffer.byteLength(expected));
		}
	});

	it('escapes dynamic text and charges the rendered UTF-8 bytes once', () => {
		const context = createSsrContext({ maxOutputBytes: 14 });
		const output = new SsrOutputBuffer(context.maxOutputBytes);
		context.outputSink = output;

		const html = escapeSsrText(context, 'caf\u00e9<&');
		output.appendAccounted(html);

		expect(html).toBe('caf\u00e9&lt;&amp;');
		expect(output.finish()).toEqual(['caf\u00e9&lt;&amp;']);
	});

	it('rejects escaped output at the exact byte boundary', () => {
		const context = createSsrContext({ maxOutputBytes: 13 });
		const output = new SsrOutputBuffer(context.maxOutputBytes);
		context.outputSink = output;

		expect(() => escapeSsrText(context, 'caf\u00e9<&')).toThrow(
			'eXact SSR output exceeds the configured maximum of 13 bytes'
		);
	});
});
