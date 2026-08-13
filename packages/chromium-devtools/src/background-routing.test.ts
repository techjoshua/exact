import { describe, expect, it, vi } from 'vitest';
import { installExactExtensionBackgroundRouting } from './background-routing.js';

describe('Chromium DevTools background routing', () => {
	it('waits for proved page readiness before flushing panel work', () => {
		const runtime = runtimeConnections();
		installExactExtensionBackgroundRouting(runtime.api);
		const panel = extensionPort('exact-devtools-panel:7');
		runtime.connect(panel.port);
		panel.receive({ id: 'panel-1', type: 'connect' });
		expect(last(panel.sent)).toMatchObject({ status: 'waiting-for-page' });

		const content = extensionPort('exact-devtools-content', 7);
		runtime.connect(content.port);
		expect(content.sent).toEqual([]);
		content.receive(status('waiting-for-runtime', 'document-1', 'bridge-1'));
		expect(content.sent).toEqual([]);
		content.receive(status('ready', 'document-1', 'bridge-1'));
		expect(content.sent).toEqual([{ id: 'panel-1', type: 'connect' }]);
		content.receive({ id: 'panel-1', ok: true, result: { id: 'session' } });
		expect(last(panel.sent)).toEqual({ id: 'panel-1', ok: true, result: { id: 'session' } });
	});

	it('replays in-flight work after a content port is replaced', () => {
		const runtime = runtimeConnections();
		installExactExtensionBackgroundRouting(runtime.api);
		const panel = extensionPort('exact-devtools-panel:8');
		const first = extensionPort('exact-devtools-content', 8);
		runtime.connect(panel.port);
		runtime.connect(first.port);
		first.receive(status('ready', 'document-1', 'bridge-1'));
		panel.receive({ id: 'panel-1', type: 'connect' });
		expect(first.sent).toHaveLength(1);

		first.disconnect();
		expect(last(panel.sent)).toMatchObject({ status: 'reconnecting' });
		const replacement = extensionPort('exact-devtools-content', 8);
		runtime.connect(replacement.port);
		replacement.receive(status('ready', 'document-1', 'bridge-2'));
		expect(replacement.sent).toEqual([{ id: 'panel-1', type: 'connect' }]);
	});

	it('ignores responses from a superseded content generation', () => {
		const runtime = runtimeConnections();
		installExactExtensionBackgroundRouting(runtime.api);
		const panel = extensionPort('exact-devtools-panel:9');
		const stale = extensionPort('exact-devtools-content', 9);
		runtime.connect(panel.port);
		runtime.connect(stale.port);
		stale.receive(status('ready', 'document-1', 'bridge-1'));
		panel.receive({ id: 'panel-1', type: 'connect' });

		const current = extensionPort('exact-devtools-content', 9);
		runtime.connect(current.port);
		stale.receive({ id: 'panel-1', ok: true, result: { id: 'stale' } });
		expect(panel.sent).not.toContainEqual({ id: 'panel-1', ok: true, result: { id: 'stale' } });
	});

	it('removes queued ownership when its panel disconnects', () => {
		const runtime = runtimeConnections();
		installExactExtensionBackgroundRouting(runtime.api);
		const panel = extensionPort('exact-devtools-panel:10');
		runtime.connect(panel.port);
		panel.receive({ id: 'panel-1', type: 'connect' });
		panel.disconnect();

		const content = extensionPort('exact-devtools-content', 10);
		runtime.connect(content.port);
		content.receive(status('ready', 'document-1', 'bridge-1'));
		expect(content.sent).toEqual([]);
	});

	it('bounds all unresolved requests and reports overflow', () => {
		const runtime = runtimeConnections();
		installExactExtensionBackgroundRouting(runtime.api);
		const panel = extensionPort('exact-devtools-panel:11');
		runtime.connect(panel.port);
		for (let index = 0; index < 33; index++)
			panel.receive({ id: `panel-${index}`, type: 'connect' });

		expect(last(panel.sent)).toEqual({
			id: 'panel-32',
			ok: false,
			error: 'page-bridge-queue-full'
		});
	});
});

function status(value: 'waiting-for-runtime' | 'ready', documentId: string, bridgeId: string) {
	return {
		channel: 'exact-devtools-control',
		type: 'status',
		status: value,
		documentId,
		bridgeId
	};
}

function last<T>(values: readonly T[]): T | undefined {
	return values.at(-1);
}

function runtimeConnections() {
	let connect: ((port: chrome.runtime.Port) => void) | undefined;
	return {
		api: {
			onConnect: {
				addListener(listener: (port: chrome.runtime.Port) => void) {
					connect = listener;
				}
			}
		},
		connect(port: chrome.runtime.Port) {
			expect(connect).toBeDefined();
			connect!(port);
		}
	};
}

function extensionPort(name: string, tabId?: number) {
	const messages: Array<(message: any) => void> = [];
	const disconnects: Array<() => void> = [];
	const sent: unknown[] = [];
	const port: chrome.runtime.Port = {
		name,
		...(tabId === undefined ? {} : { sender: { tab: { id: tabId } } }),
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
