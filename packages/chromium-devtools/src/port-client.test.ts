/* eslint-disable @typescript-eslint/no-explicit-any -- This test intentionally models external, private, or invalid values that production contracts reject. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createExactExtensionQueryClient } from './port-client.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

it('starts response clocks only after readiness and retries one silent bridge', async () => {
	const runtime = panelRuntime();
	vi.stubGlobal('chrome', runtime.chrome);
	const client = createExactExtensionQueryClient(4, 50);
	const connection = client.connect();
	const rejection = expect(connection).rejects.toThrow(
		'DevTools runtime remained unresponsive after reconnecting'
	);

	await vi.advanceTimersByTimeAsync(1_000);
	expect(runtime.ports).toHaveLength(1);
	runtime.ports[0]!.receive(status('ready'));
	await vi.advanceTimersByTimeAsync(50);
	expect(runtime.ports[0]!.disconnect).toHaveBeenCalledOnce();
	await vi.advanceTimersByTimeAsync(100);
	expect(runtime.ports).toHaveLength(2);
	expect(runtime.ports[1]!.sent).toEqual(runtime.ports[0]!.sent);
	runtime.ports[1]!.receive(status('ready'));
	await vi.advanceTimersByTimeAsync(50);
	await rejection;
});

it('clears the response timeout when the inspected page answers', async () => {
	const runtime = panelRuntime();
	vi.stubGlobal('chrome', runtime.chrome);
	const client = createExactExtensionQueryClient(4, 50);
	const connection = client.connect();
	const request = runtime.ports[0]!.sent[0] as { id: string };
	runtime.ports[0]!.receive(status('ready'));
	runtime.ports[0]!.receive({ id: request.id, ok: true, result: { id: 'session' } });

	await expect(connection).resolves.toEqual({ id: 'session' });
	await vi.advanceTimersByTimeAsync(50);
	expect(vi.getTimerCount()).toBe(0);
});

it('reconnects a service-worker port and replays unresolved work', async () => {
	const runtime = panelRuntime();
	vi.stubGlobal('chrome', runtime.chrome);
	const client = createExactExtensionQueryClient(4, 50);
	const statuses: string[] = [];
	client.onStatus((value) => statuses.push(value));
	const connection = client.connect();
	const request = runtime.ports[0]!.sent[0] as { id: string };
	runtime.ports[0]!.disconnect();
	expect(runtime.lastErrorReads()).toBe(1);
	await vi.advanceTimersByTimeAsync(100);
	expect(runtime.ports[1]!.sent).toContainEqual(request);
	runtime.ports[1]!.receive(status('ready'));
	runtime.ports[1]!.receive({ id: request.id, ok: true, result: { id: 'session' } });

	await expect(connection).resolves.toEqual({ id: 'session' });
	expect(statuses).toEqual(['connecting', 'reconnecting', 'ready']);
});

it('bounds locally retained requests while the page bridge is unavailable', async () => {
	const runtime = panelRuntime();
	vi.stubGlobal('chrome', runtime.chrome);
	const client = createExactExtensionQueryClient(4, 50);
	const requests = Array.from({ length: 32 }, () => client.connect());
	await expect(client.connect()).rejects.toThrow('request queue is full');
	const disconnected = client.disconnect();
	await Promise.all(requests.map((request) => request.catch(() => undefined)));
	await disconnected;
});

function status(value: 'ready' | 'waiting-for-page') {
	return { channel: 'exact-devtools-control', type: 'status', status: value };
}

function panelRuntime() {
	const ports: ReturnType<typeof panelPort>[] = [];
	let errorReads = 0;
	return {
		ports,
		lastErrorReads: () => errorReads,
		chrome: {
			runtime: {
				connect() {
					const port = panelPort();
					ports.push(port);
					return port.port;
				},
				get lastError() {
					errorReads++;
					return { message: 'Service worker stopped.' };
				}
			}
		}
	};
}

function panelPort() {
	const messages: Array<(message: any) => void> = [];
	const disconnects: Array<() => void> = [];
	const sent: unknown[] = [];
	let disconnected = false;
	const disconnect = vi.fn(() => {
		if (disconnected) return;
		disconnected = true;
		for (const listener of disconnects) listener();
	});
	const port: chrome.runtime.Port = {
		name: 'exact-devtools-panel:4',
		onMessage: { addListener: (listener) => messages.push(listener) },
		onDisconnect: { addListener: (listener) => disconnects.push(listener) },
		postMessage: vi.fn((message: unknown) => sent.push(message)),
		disconnect
	};
	return {
		port,
		sent,
		disconnect,
		receive(message: unknown) {
			for (const listener of messages) listener(message);
		}
	};
}
