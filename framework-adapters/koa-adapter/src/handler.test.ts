import { EventEmitter } from 'node:events';
import { defineExactOperationContract } from '@exactjs/server';
import { describe, expect, it, vi } from 'vitest';
import { createExactKoaMiddleware, type ExactKoaContext } from './index.js';

describe('@exactjs/koa-adapter', () => {
	it('writes eXact responses into Koa context', async () => {
		const middleware = createExactKoaMiddleware({
			publicOrigin: 'http://koa.example.test',
			contract: {
				version: 1,
				endpoint: '/__exact',
				actions: { save: stateAction('save') },
				boundaries: {}
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
			contract: {
				version: 1,
				endpoint: '/__exact',
				actions: {},
				boundaries: {}
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
			contract: {
				version: 1,
				endpoint: '/__exact',
				actions: { save: stateAction('save') },
				boundaries: {}
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

	it('aborts request work when the Koa response closes', async () => {
		const response = new EventEmitter();
		let actionSignal!: AbortSignal;
		const middleware = createExactKoaMiddleware({
			contract: {
				version: 1,
				endpoint: '/__exact',
				actions: { wait: stateAction('wait') },
				boundaries: {}
			},
			actions: {
				wait: async (_input, context) => {
					actionSignal = context.signal!;
					await new Promise<void>((resolve) =>
						actionSignal.addEventListener('abort', () => resolve(), { once: true })
					);
					return { state: 'cancelled' };
				}
			}
		});
		const ctx = createKoaContext({ type: 'action', id: 'wait' });
		ctx.res = response;
		const pending = middleware(ctx);

		await vi.waitFor(() => expect(actionSignal).toBeDefined());
		response.emit('close');
		await pending;

		expect(actionSignal.aborted).toBe(true);
		expect(response.listenerCount('close')).toBe(0);
	});
});

function stateAction(id: string) {
	return defineExactOperationContract(id, {
		writes: [{ path: '*', kind: 'write', confidence: 'exact' }]
	});
}

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
