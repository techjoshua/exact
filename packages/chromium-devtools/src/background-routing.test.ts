import { describe, expect, it, vi } from 'vitest';
import { installExactExtensionBackgroundRouting } from './background-routing.js';

describe('Chromium DevTools background routing', () => {
	it('flushes panel requests that arrive before the inspected-page bridge', () => {
		const runtime = runtimeConnections();
		installExactExtensionBackgroundRouting(runtime.api);
		const panel = extensionPort('exact-devtools-panel:7');
		runtime.connect(panel.port);
		panel.receive({ id: 'panel-1', type: 'connect' });
		expect(panel.sent).toEqual([]);

		const content = extensionPort('exact-devtools-content', 7);
		runtime.connect(content.port);
		expect(content.sent).toEqual([{ id: 'panel-1', type: 'connect' }]);
		content.receive({ id: 'panel-1', ok: true, result: { id: 'session' } });
		expect(panel.sent).toEqual([{ id: 'panel-1', ok: true, result: { id: 'session' } }]);
	});

	it('removes queued ownership when its panel disconnects', () => {
		const runtime = runtimeConnections();
		installExactExtensionBackgroundRouting(runtime.api);
		const panel = extensionPort('exact-devtools-panel:9');
		runtime.connect(panel.port);
		panel.receive({ id: 'panel-1', type: 'connect' });
		panel.disconnect();

		const content = extensionPort('exact-devtools-content', 9);
		runtime.connect(content.port);
		expect(content.sent).toEqual([]);
	});

	it('bounds queued requests and reports overflow to the owning panel', () => {
		const runtime = runtimeConnections();
		installExactExtensionBackgroundRouting(runtime.api);
		const panel = extensionPort('exact-devtools-panel:11');
		runtime.connect(panel.port);
		for (let index = 0; index < 33; index++)
			panel.receive({ id: `panel-${index}`, type: 'connect' });

		expect(panel.sent).toEqual([{ id: 'panel-32', ok: false, error: 'page-bridge-queue-full' }]);
		const content = extensionPort('exact-devtools-content', 11);
		runtime.connect(content.port);
		expect(content.sent).toHaveLength(32);
	});
});

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
