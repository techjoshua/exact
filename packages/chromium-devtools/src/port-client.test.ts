import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createExactExtensionQueryClient } from './port-client.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

it('rejects a panel request when the page bridge does not respond', async () => {
	const port = panelPort();
	vi.stubGlobal('chrome', { runtime: { connect: () => port.port, lastError: undefined } });
	const client = createExactExtensionQueryClient(4, 50);
	const connection = client.connect();
	const rejected = expect(connection).rejects.toThrow(
		'DevTools page bridge did not respond; reload the inspected page'
	);

	await vi.advanceTimersByTimeAsync(50);
	await rejected;
});

it('clears the response timeout when the inspected page answers', async () => {
	const port = panelPort();
	vi.stubGlobal('chrome', { runtime: { connect: () => port.port, lastError: undefined } });
	const client = createExactExtensionQueryClient(4, 50);
	const connection = client.connect();
	const request = port.sent[0] as { id: string };
	port.receive({ id: request.id, ok: true, result: { id: 'session' } });

	await expect(connection).resolves.toEqual({ id: 'session' });
	await vi.advanceTimersByTimeAsync(50);
	expect(vi.getTimerCount()).toBe(0);
});

it('acknowledges runtime connection errors and rejects pending work on disconnect', async () => {
	const port = panelPort();
	let lastErrorReads = 0;
	vi.stubGlobal('chrome', {
		runtime: {
			connect: () => port.port,
			get lastError() {
				lastErrorReads++;
				return { message: 'Receiving end does not exist.' };
			}
		}
	});
	const client = createExactExtensionQueryClient(4, 50);
	const connection = client.connect();
	const rejected = expect(connection).rejects.toThrow('DevTools port disconnected');
	port.disconnect();

	await rejected;
	expect(lastErrorReads).toBe(1);
	expect(vi.getTimerCount()).toBe(0);
});

function panelPort() {
	const messages: Array<(message: any) => void> = [];
	const disconnects: Array<() => void> = [];
	const sent: unknown[] = [];
	const port: chrome.runtime.Port = {
		name: 'exact-devtools-panel:4',
		onMessage: { addListener: (listener) => messages.push(listener) },
		onDisconnect: { addListener: (listener) => disconnects.push(listener) },
		postMessage: vi.fn((message: unknown) => sent.push(message)),
		disconnect: vi.fn(() => disconnects.forEach((listener) => listener()))
	};
	return {
		port,
		sent,
		receive(message: unknown) {
			for (const listener of messages) listener(message);
		},
		disconnect() {
			port.disconnect();
		}
	};
}
