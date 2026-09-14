import { afterEach, expect, it, vi } from 'vitest';
import { BunRequestGate } from './adaptive-gate.js';
import { createBunRequestHandler } from './request-handler.js';

afterEach(() => vi.restoreAllMocks());

it('keeps direct Fetch calls immediate and preserves the original Response', () => {
	const response = new Response('body');
	const handler = createBunRequestHandler(() => response);
	expect(handler(new Request('https://example.test'))).toBe(response);
});

it('lets the outer host own admission when dispatching to a nested endpoint', () => {
	const observe = vi.spyOn(BunRequestGate.prototype, 'observeRequest').mockImplementation(() => {});
	const response = new Response('body');
	const endpoint = createBunRequestHandler(() => response);
	const handler = createBunRequestHandler(endpoint);
	expect(handler(new Request('https://example.test'), { pendingRequests: 1 })).toBe(response);
	expect(observe).toHaveBeenCalledTimes(1);
});

it('honors the outer opt-out and rejects aborted requests before calling application code', async () => {
	const observe = vi.spyOn(BunRequestGate.prototype, 'observeRequest');
	const run = vi.fn(() => new Response('body'));
	const handler = createBunRequestHandler(createBunRequestHandler(run), { adaptive: false });
	handler(new Request('https://example.test'), { pendingRequests: 1 });
	expect(observe).not.toHaveBeenCalled();
	const abort = new AbortController();
	abort.abort('disconnected');
	await expect(
		handler(new Request('https://example.test', { signal: abort.signal }), { pendingRequests: 1 })
	).rejects.toBe('disconnected');
	expect(run).toHaveBeenCalledTimes(1);
});
