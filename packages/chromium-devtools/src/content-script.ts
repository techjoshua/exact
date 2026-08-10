import type {
	ExactExtensionBridgeStatus,
	ExactExtensionControlMessage,
	ExactExtensionResponse,
	ExactPageBridgeDisconnect,
	ExactPageBridgeHello,
	ExactPageBridgeReady
} from './messages.js';

const extensionSource = 'exact-devtools-extension';
const pageSource = 'exact-devtools-page';
const handshakeIntervalMs = 500;
const reconnectDelayMs = 100;
const documentId = crypto.randomUUID();
let port: chrome.runtime.Port | undefined;
let handshakeTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let currentStatus: ExactExtensionBridgeStatus = 'connecting';
let pageVisible = true;

window.addEventListener('message', receivePageMessage);
window.addEventListener('pageshow', resumeDocument);
window.addEventListener('pagehide', suspendDocument);
connectPort();

/** Opens the replaceable service-worker port while window listeners remain document-owned. */
function connectPort(): void {
	if (port) return;
	try {
		const candidate = chrome.runtime.connect({ name: 'exact-devtools-content' });
		port = candidate;
		candidate.onMessage.addListener((message) => {
			if (port !== candidate || !pageVisible) return;
			window.postMessage({ source: extensionSource, message }, '*');
		});
		candidate.onDisconnect.addListener(() => disconnectPort(candidate));
		publishStatus(currentStatus === 'ready' ? 'reconnecting' : currentStatus);
		beginHandshake();
	} catch {
		scheduleReconnect();
	}
}

function disconnectPort(candidate: chrome.runtime.Port): void {
	void chrome.runtime.lastError;
	if (port !== candidate) return;
	port = undefined;
	publishPageDisconnect();
	currentStatus = 'reconnecting';
	stopHandshake();
	scheduleReconnect();
}

function scheduleReconnect(): void {
	if (reconnectTimer) return;
	reconnectTimer = setTimeout(() => {
		reconnectTimer = undefined;
		connectPort();
	}, reconnectDelayMs);
}

function beginHandshake(): void {
	if (!pageVisible) return;
	stopHandshake();
	currentStatus = 'waiting-for-page';
	publishStatus(currentStatus);
	sendHello();
}

function sendHello(): void {
	const control: ExactPageBridgeHello = { type: 'hello', documentId };
	window.postMessage({ source: extensionSource, control }, '*');
	handshakeTimer = setTimeout(sendHello, handshakeIntervalMs);
}

function receivePageMessage(event: MessageEvent): void {
	if (event.source !== window || event.data?.source !== pageSource) return;
	const control = event.data.control as ExactPageBridgeReady | undefined;
	if (control?.type === 'ready') {
		if (control.documentId !== documentId) return;
		currentStatus = control.runtimeReady ? 'ready' : 'waiting-for-runtime';
		publishStatus(currentStatus, control.bridgeId);
		if (control.runtimeReady) stopHandshake();
		return;
	}
	const message = event.data.message as ExactExtensionResponse | undefined;
	if (!message) return;
	if ('id' in message && !message.ok && message.error === 'runtime-not-instrumented')
		beginHandshake();
	try {
		port?.postMessage(message);
	} catch {
		if (port) replacePort(port);
	}
}

function publishStatus(status: ExactExtensionBridgeStatus, bridgeId?: string): void {
	currentStatus = status;
	const control: ExactExtensionControlMessage = {
		channel: 'exact-devtools-control',
		type: 'status',
		status,
		documentId,
		...(bridgeId ? { bridgeId } : {})
	};
	try {
		port?.postMessage(control);
	} catch {
		if (port) replacePort(port);
	}
}

function replacePort(candidate: chrome.runtime.Port): void {
	if (port !== candidate) return;
	port = undefined;
	try {
		candidate.disconnect();
	} catch {
		// The local endpoint may already have observed the transport failure.
	}
	publishPageDisconnect();
	currentStatus = 'reconnecting';
	stopHandshake();
	scheduleReconnect();
}

function publishPageDisconnect(): void {
	const control: ExactPageBridgeDisconnect = { type: 'transport-disconnect', documentId };
	window.postMessage({ source: extensionSource, control }, '*');
}

function suspendDocument(event: PageTransitionEvent): void {
	if (event.target !== document) return;
	pageVisible = false;
	stopHandshake();
	publishStatus('reconnecting');
	publishPageDisconnect();
}

function resumeDocument(event: PageTransitionEvent): void {
	if (event.target !== document) return;
	pageVisible = true;
	beginHandshake();
}

function stopHandshake(): void {
	if (handshakeTimer) clearTimeout(handshakeTimer);
	handshakeTimer = undefined;
}
