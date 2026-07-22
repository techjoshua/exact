import { describe, expect, it, vi } from 'vitest';
import { createExactBindingGateway, handleExactRequest } from './index.js';
import { context, readStreamEvents } from './test-support/server.js';

const buildKey = '0123456789abcdef0123456789abcdef01234567';

describe('exact binding gateway', () => {
	it('forwards validated mixed-root requests to the configured endpoint', async () => {
		let request: { input: string; init: RequestInit } | undefined;
		const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
			request = { input: String(input), init: init! };
			return new Response(JSON.stringify({ ok: true, version: 1, results: [] }), {
				status: 200,
				headers: {
					'content-type': 'application/json',
					'x-exact-preferred-build': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
					'content-length': '999'
				}
			});
		});
		const response = await handleExactRequest(
			{
				method: 'POST',
				headers: {
					'X-Exact-Binding': 'billing',
					'X-Exact-Build': buildKey,
					cookie: 'session=browser',
					authorization: 'Bearer browser',
					accept: 'application/json'
				},
				body: {
					type: 'batch',
					version: 1,
					operations: [
						{ type: 'action', root: '@company/billing#./Area', id: 'save' },
						{ type: 'refresh', root: '@company/billing#./Other', id: 'panel' }
					]
				}
			},
			context({
				gateway: createExactBindingGateway({
					bindings: { billing: { endpoint: 'http://billing.internal/__exact' } },
					fetch: fetch as typeof globalThis.fetch
				})
			})
		);

		expect(request?.input).toBe('http://billing.internal/__exact');
		expect(request?.init.redirect).toBe('follow');
		const headers = new Headers(request?.init.headers);
		expect(headers.get('x-exact-binding')).toBeNull();
		expect(headers.get('x-exact-build')).toBe(buildKey);
		expect(headers.get('cookie')).toBeNull();
		expect(headers.get('authorization')).toBeNull();
		expect(JSON.parse(String(request?.init.body))).toMatchObject({
			type: 'batch',
			operations: [
				{ root: '@company/billing#./Area', id: 'save' },
				{ root: '@company/billing#./Other', id: 'panel' }
			]
		});
		expect(response.status).toBe(200);
		expect(response.headers['x-exact-preferred-build']).toBe(
			'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
		);
		expect(response.headers['content-length']).toBeUndefined();
	});

	it('runs page security before forwarding', async () => {
		const fetch = vi.fn();
		const response = await handleExactRequest(
			{
				method: 'POST',
				headers: { 'x-exact-binding': 'billing', 'x-exact-build': buildKey },
				body: { type: 'action', root: '@company/billing#./Area', id: 'save' }
			},
			context({
				authorize: () => false,
				gateway: createExactBindingGateway({
					bindings: { billing: { endpoint: 'http://billing.internal/__exact' } },
					fetch: fetch as typeof globalThis.fetch
				})
			})
		);

		expect(response.status).toBe(403);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('allows one request transform to install internal credentials', async () => {
		const transform = vi.fn((request) => {
			const headers = new Headers(request.headers as HeadersInit);
			headers.set('authorization', 'Bearer internal');
			return { ...request, headers };
		});
		const fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
			expect(new Headers(init?.headers).get('authorization')).toBe('Bearer internal');
			return new Response(JSON.stringify({ ok: true }), {
				headers: { 'content-type': 'application/json' }
			});
		});
		const response = await handleExactRequest(
			{
				method: 'POST',
				headers: { 'x-exact-binding': 'billing', 'x-exact-build': buildKey },
				body: { type: 'action', root: '@company/billing#./Area', id: 'save' }
			},
			context({
				gateway: createExactBindingGateway({
					bindings: { billing: { endpoint: 'http://billing.internal/__exact' } },
					fetch: fetch as typeof globalThis.fetch,
					transformForwardedRequest: transform
				})
			})
		);

		expect(response.status).toBe(200);
		expect(transform).toHaveBeenCalledOnce();
	});

	it('rejects unknown bindings with a bounded event and never exposes an endpoint', async () => {
		const events: unknown[] = [];
		const fetch = vi.fn();
		const response = await handleExactRequest(
			{
				method: 'POST',
				headers: { 'x-exact-binding': 'unknown', 'x-exact-build': buildKey },
				body: { type: 'action', root: '@company/unknown#./Area', id: 'save' }
			},
			context({
				gateway: createExactBindingGateway({
					bindings: { billing: { endpoint: 'http://billing.internal/__exact' } },
					fetch: fetch as typeof globalThis.fetch,
					onReject: (event) => events.push(event)
				})
			})
		);

		expect(response.status).toBe(404);
		expect(JSON.parse(response.body)).toEqual({ error: 'unknown_binding' });
		expect(events).toEqual([{ reason: 'unknown_binding', binding: 'unknown' }]);
		expect(JSON.stringify(events)).not.toContain('billing.internal');
		expect(fetch).not.toHaveBeenCalled();
	});

	it('passes a valid NDJSON stream through while validating it incrementally', async () => {
		const payload = [
			{ event: 'start', version: 1, operations: 1 },
			{ event: 'complete', version: 1 }
		]
			.map((event) => JSON.stringify(event))
			.join('\n');
		const response = await handleExactRequest(
			{
				method: 'POST',
				headers: {
					'x-exact-binding': 'billing',
					'x-exact-build': buildKey,
					accept: 'application/x-ndjson'
				},
				body: { type: 'action', root: '@company/billing#./Area', id: 'save' }
			},
			context({
				gateway: createExactBindingGateway({
					bindings: { billing: { endpoint: 'http://billing.internal/__exact' } },
					fetch: (async () =>
						new Response(payload, {
							headers: { 'content-type': 'application/x-ndjson' }
						})) as typeof globalThis.fetch
				})
			})
		);

		expect(response.stream).toBeDefined();
		expect(await readStreamEvents(response.stream!)).toEqual([
			{ event: 'start', version: 1, operations: 1 },
			{ event: 'complete', version: 1 }
		]);
	});
});
