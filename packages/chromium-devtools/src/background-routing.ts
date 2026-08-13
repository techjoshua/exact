import type {
	ExactExtensionBridgeStatus,
	ExactExtensionControlMessage,
	ExactExtensionRequest,
	ExactExtensionResponse
} from './messages.js';

const maximumPendingRequestsPerTab = 32;

type RoutedRequest = {
	panel: chrome.runtime.Port;
	message: ExactExtensionRequest;
	state: 'queued' | 'inflight';
};

type TabTransport = {
	content?: chrome.runtime.Port;
	panels: Set<chrome.runtime.Port>;
	requests: Map<string, RoutedRequest>;
	status: ExactExtensionBridgeStatus;
	documentId?: string;
	bridgeId?: string;
};

/**
 * Installs generation-aware routing between replaceable extension ports.
 *
 * Requests remain background-owned until their correlated response arrives. A content-port loss
 * moves in-flight requests back to the queue so reconnecting endpoints can safely replay the
 * read-only inspection operation.
 */
export function installExactExtensionBackgroundRouting(
	runtime: Pick<typeof chrome.runtime, 'onConnect'>
): void {
	const tabs = new Map<number, TabTransport>();
	runtime.onConnect.addListener((port) => {
		const contentTab = port.sender?.tab?.id;
		const panelTab = panelTabId(port.name);
		if (port.name === 'exact-devtools-content' && contentTab !== undefined) {
			connectContentPort(contentTab, port);
			return;
		}
		if (panelTab !== undefined) connectPanelPort(panelTab, port);
	});

	function transport(tabId: number): TabTransport {
		let state = tabs.get(tabId);
		if (!state) {
			state = {
				panels: new Set(),
				requests: new Map(),
				status: 'waiting-for-page'
			};
			tabs.set(tabId, state);
		}
		return state;
	}

	function connectContentPort(tabId: number, port: chrome.runtime.Port): void {
		const state = transport(tabId);
		const previous = state.content;
		state.content = port;
		state.status = 'waiting-for-page';
		state.documentId = undefined;
		state.bridgeId = undefined;
		requeueInflight(state);
		broadcastStatus(state);
		if (previous && previous !== port) safelyDisconnect(previous);
		port.onMessage.addListener((message) => receiveContentMessage(state, port, message));
		port.onDisconnect.addListener(() => disconnectContentPort(tabId, state, port));
	}

	function receiveContentMessage(
		state: TabTransport,
		port: chrome.runtime.Port,
		message: ExactExtensionControlMessage | ExactExtensionResponse
	): void {
		if (state.content !== port) return;
		if (isControlMessage(message)) {
			const documentChanged =
				state.documentId !== undefined && state.documentId !== message.documentId;
			const bridgeChanged = state.bridgeId !== undefined && state.bridgeId !== message.bridgeId;
			if (documentChanged || bridgeChanged) requeueInflight(state);
			state.status = message.status;
			state.documentId = message.documentId;
			state.bridgeId = message.bridgeId;
			broadcastStatus(state);
			if (message.status === 'ready') flushRequests(state);
			return;
		}
		if ('id' in message) {
			const request = state.requests.get(message.id);
			if (!request) return;
			state.requests.delete(message.id);
			safelyPost(request.panel, message);
			return;
		}
		for (const panel of state.panels) safelyPost(panel, message);
	}

	function disconnectContentPort(
		tabId: number,
		state: TabTransport,
		port: chrome.runtime.Port
	): void {
		if (state.content !== port) return;
		state.content = undefined;
		state.status = 'reconnecting';
		state.documentId = undefined;
		state.bridgeId = undefined;
		requeueInflight(state);
		broadcastStatus(state);
		if (!state.panels.size && !state.requests.size) tabs.delete(tabId);
	}

	function connectPanelPort(tabId: number, port: chrome.runtime.Port): void {
		const state = transport(tabId);
		state.panels.add(port);
		postStatus(port, state);
		port.onMessage.addListener((message: ExactExtensionRequest) => {
			const existing = state.requests.get(message.id);
			if (!existing && state.requests.size >= maximumPendingRequestsPerTab) {
				rejectPanelRequest(port, message, 'page-bridge-queue-full');
				return;
			}
			state.requests.set(message.id, { panel: port, message, state: 'queued' });
			flushRequests(state);
		});
		port.onDisconnect.addListener(() => {
			state.panels.delete(port);
			for (const [id, request] of state.requests) {
				if (request.panel === port) state.requests.delete(id);
			}
			if (!state.content && !state.panels.size && !state.requests.size) tabs.delete(tabId);
		});
	}

	function flushRequests(state: TabTransport): void {
		if (state.status !== 'ready' || !state.content) return;
		for (const request of state.requests.values()) {
			if (request.state !== 'queued') continue;
			try {
				state.content.postMessage(request.message);
				request.state = 'inflight';
			} catch {
				state.content = undefined;
				state.status = 'reconnecting';
				requeueInflight(state);
				broadcastStatus(state);
				return;
			}
		}
	}
}

function requeueInflight(state: TabTransport): void {
	for (const request of state.requests.values()) request.state = 'queued';
}

function broadcastStatus(state: TabTransport): void {
	for (const panel of state.panels) postStatus(panel, state);
}

function postStatus(port: chrome.runtime.Port, state: TabTransport): void {
	const message: ExactExtensionControlMessage = {
		channel: 'exact-devtools-control',
		type: 'status',
		status: state.status,
		...(state.documentId ? { documentId: state.documentId } : {}),
		...(state.bridgeId ? { bridgeId: state.bridgeId } : {})
	};
	safelyPost(port, message);
}

function isControlMessage(message: unknown): message is ExactExtensionControlMessage {
	return (
		typeof message === 'object' &&
		message !== null &&
		(message as ExactExtensionControlMessage).channel === 'exact-devtools-control'
	);
}

function panelTabId(name: string): number | undefined {
	if (!name.startsWith('exact-devtools-panel:')) return undefined;
	const tabId = Number(name.slice('exact-devtools-panel:'.length));
	return Number.isSafeInteger(tabId) && tabId >= 0 ? tabId : undefined;
}

function rejectPanelRequest(
	panel: chrome.runtime.Port,
	message: ExactExtensionRequest,
	error: string
): void {
	safelyPost(panel, { id: message.id, ok: false, error } satisfies ExactExtensionResponse);
}

function safelyPost(port: chrome.runtime.Port, message: unknown): void {
	try {
		port.postMessage(message);
	} catch {
		// The owning disconnect listener performs lifecycle cleanup when Chromium reports closure.
	}
}

function safelyDisconnect(port: chrome.runtime.Port): void {
	try {
		port.disconnect();
	} catch {
		// A superseded port may already be invalidated by Chromium.
	}
}
