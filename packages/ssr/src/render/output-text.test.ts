import { describe, expect, it } from 'vitest';
import { createSsrContext } from './context.js';
import { SsrOutputBuffer } from './output-buffer.js';
import { escapeSsrText } from './output-text.js';

describe('SSR output text accounting', () => {
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
