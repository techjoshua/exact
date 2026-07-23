import { describe, expect, it, vi } from 'vitest';
import { createExactKoaMiddleware, type ExactKoaContext } from './index.js';

describe('@exactjs/koa-adapter', () => {
	it('writes eXact responses into Koa context', async () => {
		const middleware = createExactKoaMiddleware({
			manifest: {
				version: 1,
				endpoint: '/__exact',
				actions: { save: { id: 'save', placement: 'server' } }
			},
			actions: {
				save: (_input, context) => ({
					state: {
						runtime: 'koa',
						url: context.requestContext?.url.href,
						platformUrl: (context.platformRequest as ExactKoaContext).url
					}
				})
			}
		});
		const ctx = createKoaContext({ type: 'action', id: 'save' });

		await middleware(ctx);

		expect(ctx.status).toBe(200);
		expect(JSON.parse(String(ctx.body))).toEqual({
			ok: true,
			type: 'action',
			id: 'save',
			state: {
				runtime: 'koa',
				url: 'http://koa.example.test/__exact',
				platformUrl: '/__exact'
			}
		});
	});

	it('delegates unmatched requests and preserves the existing Koa response', async () => {
		const middleware = createExactKoaMiddleware({
			manifest: {
				version: 1,
				endpoint: '/__exact',
				actions: {}
			}
		});
		const ctx = createKoaContext(undefined);
		ctx.url = '/other';
		ctx.status = 418;
		ctx.body = 'existing';
		const next = vi.fn(async () => 'downstream');

		await middleware(ctx, next);

		expect(next).toHaveBeenCalledOnce();
		expect(ctx.status).toBe(418);
		expect(ctx.body).toBe('existing');
	});

	it('uses raw request text and writes response headers', async () => {
		const middleware = createExactKoaMiddleware({
			manifest: {
				version: 1,
				endpoint: '/__exact',
				actions: { save: { id: 'save', placement: 'server' } }
			},
			actions: {
				save: () => ({ state: { ok: true } })
			}
		});
		const ctx = createKoaContext(undefined);
		ctx.request.rawBody = JSON.stringify({ type: 'action', id: 'save' });
		const headers = new Map<string, string>();
		ctx.set = (name, value) => headers.set(name, value);

		await middleware(ctx);

		expect(ctx.status).toBe(200);
		expect(headers.get('content-type')).toBe('application/json; charset=utf-8');
	});
});

function createKoaContext(body: unknown): ExactKoaContext {
	return {
		method: 'POST',
		url: '/__exact',
		headers: { host: 'koa.example.test' },
		request: { body },
		status: 0,
		body: undefined,
		set() {}
	};
}
