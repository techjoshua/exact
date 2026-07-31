// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';

it('stops forwarding page responses after the extension port disconnects', async () => {
	vi.resetModules();
	const portMessages: unknown[] = [];
	const disconnectListeners: Array<() => void> = [];
	let lastErrorReads = 0;
	const port = {
		name: 'exact-devtools-content',
		onMessage: { addListener: vi.fn() },
		onDisconnect: {
			addListener(listener: () => void) {
				disconnectListeners.push(listener);
			}
		},
		postMessage(message: unknown) {
			portMessages.push(message);
		},
		disconnect: vi.fn()
	};
	Object.defineProperty(globalThis, 'chrome', {
		configurable: true,
		value: {
			runtime: {
				connect: () => port,
				get lastError() {
					lastErrorReads += 1;
					return { message: 'Receiving end does not exist.' };
				}
			}
		}
	});
	let pageListener: ((event: MessageEvent) => void) | undefined;
	const addListener = vi.spyOn(window, 'addEventListener').mockImplementation((type, listener) => {
		if (type === 'message') pageListener = listener as (event: MessageEvent) => void;
	});
	const removeListener = vi.spyOn(window, 'removeEventListener').mockImplementation(() => {});
	const postWindowMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => {});

	await import('./content-script.js');
	expect(addListener).toHaveBeenCalledWith('message', expect.any(Function));
	pageListener?.(
		new MessageEvent('message', {
			source: window,
			data: { source: 'exact-devtools-page', message: { id: 'before-disconnect' } }
		})
	);
	expect(portMessages).toEqual([{ id: 'before-disconnect' }]);

	disconnectListeners[0]?.();
	expect(lastErrorReads).toBe(1);
	expect(removeListener).toHaveBeenCalledWith('message', pageListener);
	expect(postWindowMessage).toHaveBeenCalledWith(
		{
			source: 'exact-devtools-extension',
			message: { id: 'disconnect', type: 'disconnect' }
		},
		'*'
	);

	pageListener?.(
		new MessageEvent('message', {
			source: window,
			data: { source: 'exact-devtools-page', message: { id: 'stale-response' } }
		})
	);
	expect(portMessages).toEqual([{ id: 'before-disconnect' }]);
});
