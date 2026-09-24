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
	it('preserves a stream failure without an unhandled observer rejection', async () => {
		const recorder = new ExactProtocolRecorder();
		const failure = new Error('connection interrupted');
		const fetch = recorder.wrap(async () => ({
			ok: true,
			status: 200,
			headers: { 'Content-Type': 'application/json' },
			body: new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(new TextEncoder().encode('{"ok":'));
					controller.error(failure);
				}
			}),
			json: async () => {
				throw failure;
			}
		}));
		const response = await fetch('/__exact', { method: 'POST', headers: {}, body: '{}' });
		await expect(new Response(response.body).text()).rejects.toBe(failure);
		await recorder.settle();
		// Allow orphaned promise rejections to surface through the test runner.
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(recorder.exchanges[0]?.response?.body).toBeUndefined();
	});

	it.each(['json', 'text'] as const)('preserves native Response.%s()', async (method) => {
		const recorder = new ExactProtocolRecorder();
		const fetch = recorder.wrap(async () => Response.json({ ok: true }));
		const response = await fetch('/__exact', { method: 'POST', headers: {}, body: '{}' });
		expect(await response[method]!()).toEqual(method === 'json' ? { ok: true } : '{"ok":true}');
		await recorder.settle();
		expect(recorder.exchanges[0]?.response?.body).toEqual({ ok: true });
	});

	it('forwards cancellation to a pending source and settles observation', async () => {
		const recorder = new ExactProtocolRecorder();
		let canceled: unknown;
		const fetch = recorder.wrap(async () => ({
			ok: true,
			status: 200,
			json: async () => ({}),
			body: new ReadableStream<Uint8Array>({
				cancel(reason) {
					canceled = reason;
				}
			})
		}));
		const response = await fetch('/__exact', { method: 'POST', headers: {}, body: '{}' });
		const reader = response.body!.getReader();
		const pending = reader.read();
		try {
			await reader.cancel('disposed');
			await pending;
			await recorder.settle();
			expect(canceled).toBe('disposed');
			expect(recorder.exchanges[0]?.response?.rawBody).toBeUndefined();
		} finally {
			reader.releaseLock();
		}
	}, 1000);
	it.each(['read', 'cancel'] as const)('waits for an active %s to finish', async (operation) => {
		const recorder = new ExactProtocolRecorder();
		const completion = Promise.withResolvers<void>();
		const started = Promise.withResolvers<void>();
		const fetch = recorder.wrap(
			async () =>
				new Response(
					new ReadableStream<Uint8Array>(
						{
							async pull(controller) {
								started.resolve();
								await completion.promise;
								controller.close();
							},
							async cancel() {
								started.resolve();
								await completion.promise;
							}
						},
						{ highWaterMark: 0 }
					)
				)
		);
		const response = await fetch('/__exact', { method: 'POST', headers: {}, body: '{}' });
		const reader = response.body!.getReader();
		try {
			const pending = operation === 'read' ? reader.read() : reader.cancel();
			await started.promise;
			let settled = false;
			const settlement = recorder.settle().then(() => {
				settled = true;
			});
			await Promise.resolve();
			expect(settled).toBe(false);
			completion.resolve();
			await pending;
			await settlement;
			expect(settled).toBe(true);
		} finally {
			completion.resolve();
			reader.releaseLock();
		}
	});
	it('does not pull unread bytes on behalf of the client', async () => {
		const recorder = new ExactProtocolRecorder();
		let pulls = 0;
		const fetch = recorder.wrap(async () => ({
			ok: true,
			status: 200,
			json: async () => ({}),
			body: new ReadableStream<Uint8Array>(
				{
					pull(controller) {
						pulls++;
						controller.enqueue(new Uint8Array([65]));
					}
				},
				{ highWaterMark: 0 }
			)
		}));
		const response = await fetch('/__exact', { method: 'POST', headers: {}, body: '{}' });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(pulls).toBe(0);
		await recorder.settle();
		const reader = response.body!.getReader();
		try {
			expect((await reader.read()).value).toEqual(new Uint8Array([65]));
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(pulls).toBe(1);
		} finally {
			await reader.cancel();
			reader.releaseLock();
		}
		await recorder.settle();
	});
});
