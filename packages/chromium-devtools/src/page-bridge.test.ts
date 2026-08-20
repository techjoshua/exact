/* eslint-disable @typescript-eslint/no-explicit-any -- This test intentionally models external, private, or invalid values that production contracts reject. */
// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
	delete (globalThis as any)[Symbol.for('@exactjs/devtools-hook')];
	vi.restoreAllMocks();
});

it('acknowledges bridge readiness separately from runtime readiness', async () => {
	vi.resetModules();
	let listener: ((event: MessageEvent) => void) | undefined;
	vi.spyOn(window, 'addEventListener').mockImplementation((type, candidate) => {
		if (type === 'message') listener = candidate as (event: MessageEvent) => void;
	});
	const posted: any[] = [];
	vi.spyOn(window, 'postMessage').mockImplementation((message) => posted.push(message));
	await import('./page-bridge.js');

	listener?.(pageMessage({ control: { type: 'hello', documentId: 'document-1' } }));
	await Promise.resolve();
	expect(posted.at(-1)?.control).toMatchObject({
		type: 'ready',
		documentId: 'document-1',
		runtimeReady: false
	});

	const disconnect = vi.fn(async () => {});
	(globalThis as any)[Symbol.for('@exactjs/devtools-hook')] = {
		protocol: 1,
		connect: async () => ({ id: 'session-1' }),
		disconnect,
		request: vi.fn(),
		subscribe: vi.fn(),
		highlight: vi.fn(),
		ownerOfElement: vi.fn()
	};
	listener?.(pageMessage({ control: { type: 'hello', documentId: 'document-1' } }));
	await Promise.resolve();
	expect(posted.at(-1)?.control).toMatchObject({ runtimeReady: true, protocol: 1 });

	listener?.(pageMessage({ message: { id: 'request-1', type: 'connect' } }));
	await Promise.resolve();
	await Promise.resolve();
	expect(posted.at(-1)?.message).toEqual({
		id: 'request-1',
		ok: true,
		result: { id: 'session-1' }
	});

	listener?.(pageMessage({ control: { type: 'transport-disconnect', documentId: 'document-1' } }));
	await Promise.resolve();
	expect(disconnect).toHaveBeenCalledOnce();
});

function pageMessage(data: unknown): MessageEvent {
	return new MessageEvent('message', {
		source: window,
		data: { source: 'exact-devtools-extension', ...(data as object) }
	});
}
