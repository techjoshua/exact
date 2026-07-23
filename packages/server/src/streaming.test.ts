import { describe, expect, it, vi } from 'vitest';
import { createExpressHandler, createFetchHandler, handleExactRequest } from './index.js';
import { context, readNextStreamLine, readStreamEvents } from './test-support/server.js';

describe('@exactjs/server streaming', () => {
	it('streams single operation results as ndjson events', async () => {
		const result = await handleExactRequest(
			{
				method: 'POST',
				headers: { accept: 'application/x-ndjson' },
				body: { type: 'refresh', id: 'allowed-boundary' }
			},
			context()
		);

		expect(result.status).toBe(200);
		expect(result.headers['content-type']).toBe('application/x-ndjson; charset=utf-8');
		expect(await readStreamEvents(result.stream!)).toEqual([
			{ event: 'start', version: 1, operations: 1 },
			{
				event: 'patch',
				version: 1,
				index: 0,
				type: 'refresh',
				id: 'allowed-boundary',
				patch: { type: 'replace', id: 'allowed-boundary', html: '<section>Updated</section>' }
			},
			{
				event: 'result',
				version: 1,
				index: 0,
				result: { ok: true, type: 'refresh', id: 'allowed-boundary' }
			},
			{ event: 'complete', version: 1 }
		]);
	});

	it('aborts dispatched work when the response stream reader is cancelled', async () => {
		let started!: () => void;
		const didStart = new Promise<void>((resolve) => {
			started = resolve;
		});
		let observedAbort = false;
		const result = await handleExactRequest(
			{
				method: 'POST',
				headers: { accept: 'application/x-ndjson' },
				body: { type: 'action', id: 'allowed-action' }
			},
			context({
				actions: {
					'allowed-action': (_input, requestContext) =>
						new Promise((resolve) => {
							started();
							requestContext.signal?.addEventListener(
								'abort',
								() => {
									observedAbort = true;
									resolve({});
								},
								{ once: true }
							);
						})
				}
			})
		);
		const reader = result.stream!.getReader();
		expect(JSON.parse(await readNextStreamLine(reader))).toMatchObject({ event: 'start' });
		await didStart;
		await reader.cancel('client disconnected');
		expect(observedAbort).toBe(true);
	});

	it('enforces request graph and non-stream response budgets', async () => {
		const deep: Record<string, any> = {};
		let cursor = deep;
		for (let index = 0; index < 150; index++) cursor = cursor.next = {};
		const rejectedRequest = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'action', id: 'allowed-action', payload: deep }
			},
			context()
		);
		expect(rejectedRequest.status).toBe(400);

		const rejectedResponse = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'action', id: 'allowed-action' }
			},
			context({
				limits: { maxResponseBytes: 64 },
				actions: { 'allowed-action': () => ({ html: 'x'.repeat(1_000) }) }
			})
		);
		expect(rejectedResponse.status).toBe(500);
		expect(JSON.parse(rejectedResponse.body)).toEqual({ error: 'internal_error' });
	});

	it('does not dispatch streamed work ahead of consumer demand', async () => {
		const action = vi.fn(() => ({
			patches: [
				{ type: 'text' as const, id: 'a', value: 'A' },
				{ type: 'text' as const, id: 'b', value: 'B' }
			]
		}));
		const response = await handleExactRequest(
			{
				method: 'POST',
				headers: { accept: 'application/x-ndjson' },
				body: { type: 'action', id: 'allowed-action' }
			},
			context({ actions: { 'allowed-action': action } })
		);
		await Promise.resolve();
		expect(action).not.toHaveBeenCalled();
		const reader = response.stream!.getReader();
		expect(JSON.parse(await readNextStreamLine(reader))).toMatchObject({ event: 'start' });
		await Promise.resolve();
		expect(action).toHaveBeenCalledTimes(1);
		await reader.cancel();
	});

	it('enforces stream byte budgets and validates payloads without invoking accessors', async () => {
		const oversized = await handleExactRequest(
			{
				method: 'POST',
				headers: { accept: 'application/x-ndjson' },
				body: { type: 'action', id: 'allowed-action' }
			},
			context({
				limits: { maxStreamBytes: 80 },
				actions: { 'allowed-action': () => ({ html: 'x'.repeat(1_000) }) }
			})
		);
		const reader = oversized.stream!.getReader();
		expect(JSON.parse(await readNextStreamLine(reader))).toMatchObject({ event: 'start' });
		await expect(reader.read()).rejects.toThrow('byte limit');

		let reads = 0;
		const payload = Object.create(Object.prototype);
		Object.defineProperty(payload, 'danger', {
			enumerable: true,
			get() {
				reads++;
				return 'value';
			}
		});
		const rejected = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'action', id: 'allowed-action', payload }
			},
			context()
		);
		expect(rejected.status).toBe(400);
		expect(reads).toBe(0);
	});

	it('preserves zero-prefetch demand through fetch stream wrappers', async () => {
		const action = vi.fn(() => ({}));
		const handler = createFetchHandler(context({ actions: { 'allowed-action': action } }));
		const response = await handler(
			new Request('https://app.test/__exact', {
				method: 'POST',
				body: JSON.stringify({ type: 'action', id: 'allowed-action' }),
				headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' }
			})
		);
		await Promise.resolve();
		expect(action).not.toHaveBeenCalled();
		const reader = response.body!.getReader();
		expect(JSON.parse(new TextDecoder().decode((await reader.read()).value))).toMatchObject({
			event: 'start'
		});
		await Promise.resolve();
		expect(action).toHaveBeenCalledTimes(1);
		await reader.cancel();
	});

	it('waits for Express drain before reading more streamed output', async () => {
		const listeners = new Map<string, () => void>();
		const writes: Uint8Array[] = [];
		let ended!: () => void;
		const complete = new Promise<void>((resolve) => {
			ended = resolve;
		});
		createExpressHandler(context())(
			{
				method: 'POST',
				url: '/__exact',
				headers: { accept: 'application/x-ndjson' },
				body: { type: 'action', id: 'allowed-action' }
			},
			{
				status() {
					return this;
				},
				setHeader() {},
				write(chunk) {
					writes.push(chunk);
					return writes.length !== 1;
				},
				end() {
					ended();
				},
				send() {
					ended();
				},
				destroy(error) {
					throw error;
				},
				once(event, listener) {
					listeners.set(event, listener);
				},
				off(event) {
					listeners.delete(event);
				}
			}
		);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(writes).toHaveLength(1);
		listeners.get('drain')?.();
		await complete;
		expect(writes.length).toBeGreaterThan(1);
	});
});
