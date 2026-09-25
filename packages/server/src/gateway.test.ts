import { describe, expect, it, vi } from 'vitest';
import {
	createExactBindingGateway,
	exactResponseToFetchResponse,
	handleExactRequest
} from './index.js';
import { context } from './test-support/server.js';
import type { ExactBindingGatewayOptions, ExactRequestLike, ExactServerContext } from './types.js';

const original = ' { "version": 1, "payload": [1, 2] }\n';
async function invoke(
	fetch: typeof globalThis.fetch,
	policy: Partial<ExactServerContext> = {},
	request: Partial<ExactRequestLike> = {},
	options: Partial<ExactBindingGatewayOptions> = {}
) {
	return handleExactRequest(
		{ method: 'POST', headers: { 'x-exact-binding': 'billing' }, body: original, ...request },
		context({
			...policy,
			gateway: createExactBindingGateway({
				bindings: { billing: { endpoint: 'https://billing.internal/__exact' } },
				fetch,
				...options
			})
		})
	);
}

describe('opaque binding gateway', () => {
	it('preserves payload and response text without local operation authorization', async () => {
		const fetch = vi.fn(
			async (_url: string | URL | Request, _init?: RequestInit) =>
				new Response(' { "opaque": true }\n', { status: 201 })
		);
		const authorizeOperation = vi.fn(() => false);
		const result = await invoke(fetch, { authorizeOperation });
		expect(fetch).toHaveBeenCalledWith(
			'https://billing.internal/__exact',
			expect.objectContaining({ body: original, redirect: 'manual' })
		);
		expect(result.status).toBe(201);
		expect(await exactResponseToFetchResponse(result).text()).toBe(' { "opaque": true }\n');
		expect(authorizeOperation).not.toHaveBeenCalled();
	});
	it.each(['authorize', 'validateCsrf'] as const)(
		'runs %s before reading the body',
		async (hook) => {
			const text = vi.fn(async () => original);
			const fetch = vi.fn();
			expect((await invoke(fetch, { [hook]: () => false }, { body: undefined, text })).status).toBe(
				403
			);
			expect(text).not.toHaveBeenCalled();
			expect(fetch).not.toHaveBeenCalled();
		}
	);
	it('forwards credentials and correlation while consuming routing and hop headers', async () => {
		const fetch = vi.fn(
			async (_url: string | URL | Request, _init?: RequestInit) => new Response('ok')
		);
		await invoke(
			fetch,
			{},
			{
				headers: {
					'x-exact-binding': 'billing',
					'x-exact-build': 'service-owned-format',
					'x-exact-debug-session': 'same-id',
					cookie: 'session=browser',
					authorization: 'Bearer browser',
					origin: 'https://page.test',
					connection: 'x-hop',
					'x-hop': 'remove',
					host: 'page.test'
				}
			},
			{
				transformForwardedRequest(request) {
					const headers = new Headers(request.headers as HeadersInit);
					headers.set('authorization', 'Bearer internal');
					return { ...request, headers };
				}
			}
		);
		const headers = new Headers(fetch.mock.calls[0]![1]!.headers);
		expect(Object.fromEntries(headers)).toMatchObject({
			cookie: 'session=browser',
			authorization: 'Bearer internal',
			origin: 'https://page.test',
			'x-exact-build': 'service-owned-format',
			'x-exact-debug-session': 'same-id',
			'x-exact-debug-binding': 'billing'
		});
		for (const name of ['x-exact-binding', 'host', 'connection', 'x-hop'])
			expect(headers.has(name)).toBe(false);
	});
	it.each(['../billing', 'unknown', 'constructor'])(
		'rejects unconfigured binding %s',
		async (binding) => {
			const fetch = vi.fn();
			expect((await invoke(fetch, {}, { headers: { 'x-exact-binding': binding } })).status).toBe(
				binding === '../billing' ? 400 : 404
			);
			expect(fetch).not.toHaveBeenCalled();
		}
	);
	it('rejects transforms that change the payload', async () => {
		const fetch = vi.fn();
		expect(
			(
				await invoke(
					fetch,
					{},
					{},
					{ transformForwardedRequest: (request) => ({ ...request, body: 'changed' }) }
				)
			).status
		).toBe(502);
		expect(fetch).not.toHaveBeenCalled();
	});
	it('rejects parsed objects instead of reconstructing the wire payload', async () => {
		const fetch = vi.fn();
		expect((await invoke(fetch, {}, { body: { version: 1 } })).status).toBe(400);
		expect(fetch).not.toHaveBeenCalled();
	});
	it('bounds request bytes and cancels the input stream', async () => {
		const cancel = vi.fn();
		const bodyStream = new ReadableStream<Uint8Array>({
			start(c) {
				c.enqueue(new Uint8Array(5));
			},
			cancel
		});
		expect(
			(await invoke(vi.fn(), { limits: { maxRequestBytes: 4 } }, { body: undefined, bodyStream }))
				.status
		).toBe(400);
		expect(cancel).toHaveBeenCalledOnce();
	});
	it('relays arbitrary response bytes without parsing stream events', async () => {
		const bytes = new Uint8Array([255, 0, 10, 128]);
		const result = await invoke(
			async () => new Response(bytes, { headers: { 'content-type': 'application/x-ndjson' } })
		);
		expect(new Uint8Array(await exactResponseToFetchResponse(result).arrayBuffer())).toEqual(bytes);
	});
	it('cancels oversized upstream responses', async () => {
		const cancel = vi.fn();
		const source = new ReadableStream<Uint8Array>({
			start(c) {
				c.enqueue(new Uint8Array(5));
			},
			cancel
		});
		const result = await invoke(async () => new Response(source), {
			limits: { maxResponseBytes: 4 }
		});
		await expect(exactResponseToFetchResponse(result).text()).rejects.toThrow('byte limit');
		expect(cancel).toHaveBeenCalledOnce();
	});
	it('propagates downstream cancellation', async () => {
		const cancel = vi.fn();
		const result = await invoke(async () => new Response(new ReadableStream({ cancel })));
		await result.stream!.cancel('disconnected');
		expect(cancel).toHaveBeenCalledWith('disconnected');
	});
	it('relays redirects and separate response cookies', async () => {
		const headers = new Headers({ location: '/login' });
		headers.append('set-cookie', 'a=1; Path=/');
		headers.append('set-cookie', 'b=2; Path=/');
		const result = await invoke(async () => new Response(null, { status: 302, headers }));
		expect(result.status).toBe(302);
		expect(exactResponseToFetchResponse(result).headers.getSetCookie()).toEqual([
			'a=1; Path=/',
			'b=2; Path=/'
		]);
	});
});

it('disables upstream progress when the gateway deployment buffers responses', async () => {
	const fetch = vi.fn(
		async (_url: string | URL | Request, _init?: RequestInit) => new Response('done')
	);
	const result = await invoke(
		fetch,
		{ progress: { supported: false, reason: 'buffering gateway' } },
		{
			headers: { 'x-exact-binding': 'billing', 'x-exact-stream': '1', 'x-exact-progress': '1' }
		},
		{
			transformForwardedRequest(request) {
				const headers = new Headers(request.headers as HeadersInit);
				headers.set('x-exact-progress', '1');
				return { ...request, headers };
			}
		}
	);
	const forwarded = new Headers(fetch.mock.calls[0]![1]!.headers);
	expect(forwarded.has('x-exact-progress')).toBe(false);
	expect(forwarded.get('x-exact-stream')).toBe('1');
	expect(fetch).toHaveBeenCalledOnce();
	expect(await exactResponseToFetchResponse(result).text()).toBe('done');
});
