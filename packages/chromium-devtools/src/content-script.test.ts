/* eslint-disable @typescript-eslint/no-explicit-any -- This test intentionally models external, private, or invalid values that production contracts reject. */
// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

it('handshakes until runtime readiness and reconnects a replaced extension port', async () => {
	vi.resetModules();
	const ports = [extensionPort(), extensionPort()];
	let connectionIndex = 0;
	let lastErrorReads = 0;
	Object.defineProperty(globalThis, 'chrome', {
		configurable: true,
		value: {
			runtime: {
				connect: () => ports[connectionIndex++]!.port,
				get lastError() {
					lastErrorReads++;
					return { message: 'Service worker stopped.' };
				}
			}
		}
	});
	const listeners = new Map<string, EventListener[]>();
	vi.spyOn(window, 'addEventListener').mockImplementation((type, listener) => {
		let values = listeners.get(type);
		if (!values) listeners.set(type, (values = []));
		values.push(listener as EventListener);
	});
	const posted: unknown[] = [];
	vi.spyOn(window, 'postMessage').mockImplementation((message) => {
		posted.push(message);
	});

	await import('./content-script.js');
	expect(ports[0]!.sent.map(readStatus)).toEqual(['connecting', 'waiting-for-page']);
	expect(pageControls(posted, 'hello')).toHaveLength(1);
	await vi.advanceTimersByTimeAsync(500);
	expect(pageControls(posted, 'hello')).toHaveLength(2);

	const documentId = pageControls(posted, 'hello')[0]!.documentId as string;
	receiveWindowMessage(listeners, {
		source: 'exact-devtools-page',
		control: {
			type: 'ready',
			documentId,
			bridgeId: 'bridge-1',
			runtimeReady: false
		}
	});
	expect(readStatus(ports[0]!.sent.at(-1))).toBe('waiting-for-runtime');
	receiveWindowMessage(listeners, {
		source: 'exact-devtools-page',
		control: {
			type: 'ready',
			documentId,
			bridgeId: 'bridge-1',
			runtimeReady: true,
			protocol: 1
		}
	});
	expect(readStatus(ports[0]!.sent.at(-1))).toBe('ready');
	const helloCount = pageControls(posted, 'hello').length;
	await vi.advanceTimersByTimeAsync(1_000);
	expect(pageControls(posted, 'hello')).toHaveLength(helloCount);

	ports[0]!.disconnect();
	expect(lastErrorReads).toBe(1);
	expect(pageControls(posted, 'transport-disconnect')).toHaveLength(1);
	await vi.advanceTimersByTimeAsync(100);
	expect(connectionIndex).toBe(2);
	expect(readStatus(ports[1]!.sent.at(-1))).toBe('waiting-for-page');
});

function extensionPort() {
	const messages: Array<(message: unknown) => void> = [];
	const disconnects: Array<() => void> = [];
	const sent: unknown[] = [];
	const port: chrome.runtime.Port = {
		name: 'exact-devtools-content',
		onMessage: { addListener: (listener) => messages.push(listener) },
		onDisconnect: { addListener: (listener) => disconnects.push(listener) },
		postMessage: vi.fn((message: unknown) => sent.push(message)),
		disconnect: vi.fn(() => disconnects.forEach((listener) => listener()))
	};
	return {
		port,
		sent,
		disconnect() {
			port.disconnect();
		}
	};
}

function receiveWindowMessage(listeners: Map<string, EventListener[]>, data: unknown): void {
	for (const listener of listeners.get('message') ?? [])
		listener(new MessageEvent('message', { source: window, data }));
}

function pageControls(messages: readonly any[], type: string): any[] {
	return messages.map((message) => message?.control).filter((control) => control?.type === type);
}

function readStatus(message: any): unknown {
	return message?.status;
}
