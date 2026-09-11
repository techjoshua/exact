import { createServer } from 'node:http';
import { createExactProducedResponse, exactResponseBodyOf } from '@exactjs/server';
import { expect, it, vi } from 'vitest';
import { writeNodeResponse } from './handler.js';

it.each([
	'known',
	'unknown',
	'prepared known',
	'prepared unknown',
	'chunked',
	'no content',
	'render failure',
	'cleanup failure',
	'invalid length'
])('preserves HTTP bytes and cleanup ordering with %s body length', async (mode) => {
	const html = '<main>' + '\u6f22\u5b57\ud83d\ude80'.repeat(32) + '</main>';
	const logger = { log: vi.fn() };
	let cleanupBeforeCommit = false;
	const prepared = mode.startsWith('prepared');
	const server = createServer((_request, response) => {
		if (prepared) response.writeHead(200, { 'content-length': Buffer.byteLength(html) });
		const result = createExactProducedResponse(
			mode === 'no content' ? 204 : 200,
			mode === 'chunked' ? { 'transfer-encoding': 'chunked' } : {},
			(write, environment) => {
				write(html);
				if (!mode.endsWith('unknown'))
					environment?.setBodyByteLength?.(
						mode === 'invalid length' ? -1 : Buffer.byteLength(html)
					);
				if (mode === 'render failure') throw new Error('render failed');
			}
		);
		exactResponseBodyOf(result)!.retainRequestScope?.(async () => {
			await Promise.resolve();
			cleanupBeforeCommit = !response.headersSent;
			if (mode === 'cleanup failure') throw new Error('cleanup failed');
		});
		void writeNodeResponse(response, result, undefined, logger);
	});
	try {
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(0, '127.0.0.1', resolve);
		});
		const address = server.address();
		if (!address || typeof address === 'string') throw new Error('Missing test listener');
		const response = await fetch(`http://127.0.0.1:${address.port}`, {
			signal: AbortSignal.timeout(5000)
		});
		const expected =
			mode === 'no content'
				? ''
				: mode === 'known' || mode === 'unknown' || mode === 'chunked' || prepared
					? html
					: '{"error":"internal_error"}';
		expect(response.status).toBe(mode === 'no content' ? 204 : expected === html ? 200 : 500);
		expect(await response.text()).toBe(expected);
		if (
			mode === 'no content' ||
			mode === 'chunked' ||
			mode === 'render failure' ||
			mode === 'cleanup failure'
		)
			expect(response.headers.has('content-length')).toBe(false);
		else expect(Number(response.headers.get('content-length'))).toBe(Buffer.byteLength(expected));
		expect(cleanupBeforeCommit).toBe(!prepared);
	} finally {
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});
