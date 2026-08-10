import type { ExactExtensionRequest, ExactExtensionResponse } from './messages.js';

const maximumQueuedRequestsPerTab = 32;

type QueuedPanelRequest = Readonly<{
	panel: chrome.runtime.Port;
	message: ExactExtensionRequest;
}>;

/** Installs bounded, connection-order-independent routing between panels and inspected pages. */
export function installExactExtensionBackgroundRouting(
	runtime: Pick<typeof chrome.runtime, 'onConnect'>
): void {
	const contentPorts = new Map<number, chrome.runtime.Port>();
	const panelPorts = new Map<number, Set<chrome.runtime.Port>>();
	const queuedRequests = new Map<number, QueuedPanelRequest[]>();

	runtime.onConnect.addListener((port) => {
		const contentTab = port.sender?.tab?.id;
		const panelTab = panelTabId(port.name);
		if (port.name === 'exact-devtools-content' && contentTab !== undefined) {
			connectContentPort(contentTab, port);
			return;
		}
		if (panelTab === undefined) return;
		connectPanelPort(panelTab, port);
	});

	function connectContentPort(tabId: number, port: chrome.runtime.Port): void {
		try {
			contentPorts.get(tabId)?.disconnect();
		} catch {
			// Replacing an already-invalid port is safe; identity fencing protects the new connection.
		}
		contentPorts.set(tabId, port);
		port.onMessage.addListener((message) => {
			const panels = panelPorts.get(tabId);
			if (!panels) return;
			for (const panel of panels) {
				try {
					panel.postMessage(message);
				} catch {
					panels.delete(panel);
					removeQueuedPanelRequests(tabId, panel);
				}
			}
			if (!panels.size) panelPorts.delete(tabId);
		});
		port.onDisconnect.addListener(() => {
			if (contentPorts.get(tabId) === port) contentPorts.delete(tabId);
		});
		const queued = queuedRequests.get(tabId);
		if (!queued) return;
		queuedRequests.delete(tabId);
		for (const request of queued) forwardOrReject(tabId, request);
	}

	function connectPanelPort(tabId: number, port: chrome.runtime.Port): void {
		let panels = panelPorts.get(tabId);
		if (!panels) panelPorts.set(tabId, (panels = new Set()));
		panels.add(port);
		port.onMessage.addListener((message: ExactExtensionRequest) => {
			const request = { panel: port, message };
			if (!forwardToContent(tabId, message)) enqueue(tabId, request);
		});
		port.onDisconnect.addListener(() => {
			panels!.delete(port);
			if (!panels!.size) panelPorts.delete(tabId);
			removeQueuedPanelRequests(tabId, port);
		});
	}

	function enqueue(tabId: number, request: QueuedPanelRequest): void {
		let queued = queuedRequests.get(tabId);
		if (!queued) queuedRequests.set(tabId, (queued = []));
		if (queued.length >= maximumQueuedRequestsPerTab) {
			rejectPanelRequest(request, 'page-bridge-queue-full');
			return;
		}
		queued.push(request);
	}

	function forwardOrReject(tabId: number, request: QueuedPanelRequest): void {
		if (!forwardToContent(tabId, request.message))
			rejectPanelRequest(request, 'page-bridge-unavailable');
	}

	function forwardToContent(tabId: number, message: ExactExtensionRequest): boolean {
		const content = contentPorts.get(tabId);
		if (!content) return false;
		try {
			content.postMessage(message);
			return true;
		} catch {
			if (contentPorts.get(tabId) === content) contentPorts.delete(tabId);
			return false;
		}
	}

	function removeQueuedPanelRequests(tabId: number, panel: chrome.runtime.Port): void {
		const queued = queuedRequests.get(tabId);
		if (!queued) return;
		const retained = queued.filter((request) => request.panel !== panel);
		if (retained.length) queuedRequests.set(tabId, retained);
		else queuedRequests.delete(tabId);
	}
}

function panelTabId(name: string): number | undefined {
	if (!name.startsWith('exact-devtools-panel:')) return undefined;
	const tabId = Number(name.slice('exact-devtools-panel:'.length));
	return Number.isSafeInteger(tabId) && tabId >= 0 ? tabId : undefined;
}

function rejectPanelRequest(request: QueuedPanelRequest, error: string): void {
	const response: ExactExtensionResponse = { id: request.message.id, ok: false, error };
	try {
		request.panel.postMessage(response);
	} catch {
		// The panel owns request timeout and disconnect cleanup; a closed port needs no response.
	}
}
