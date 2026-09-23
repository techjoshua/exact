import { describe, expect, it } from 'vitest';
import { ExactProtocolRecorder } from './protocol.js';

describe('protocol response recording', () => {
	it.each<Headers | Record<string, string>>([
		{ 'content-type': 'application/json' },
		{ 'Content-Type': 'application/json' },
		new Headers({ 'Content-Type': 'application/json' })
	])('records streamed JSON with case-insensitive headers: %j', async (headers) => {
		const recorder = new ExactProtocolRecorder();
		const body = { ok: true, value: 'recorded' };
		const raw = JSON.stringify(body);
		const fetch = recorder.wrap(async () => ({
			ok: true,
			status: 200,
			headers,
			body: new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(new TextEncoder().encode(raw));
					controller.close();
				}
			}),
			json: async () => body
		}));
		const response = await fetch('/__exact', { method: 'POST', headers: {}, body: '{}' });
		expect(await new Response(response.body).text()).toBe(raw);
		await recorder.settle();
		expect(recorder.exchanges[0]?.response).toMatchObject({
			headers: { 'content-type': 'application/json' },
			rawBody: raw,
			body
		});
	});
});
