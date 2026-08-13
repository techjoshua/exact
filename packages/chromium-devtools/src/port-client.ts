import {
	isExactRuntimeInspectionEvent,
	parseExactInspectionResponse,
	type ExactInspectionRequest,
	type ExactRuntimeInspectionEvent
} from '@exactjs/devtools-protocol';
import type {
	ExactExtensionBridgeStatus,
	ExactExtensionControlMessage,
	ExactExtensionQueryClient,
	ExactExtensionRequest,
	ExactExtensionResponse
} from './messages.js';

type RequestWithoutId = ExactExtensionRequest extends infer Request
	? Request extends ExactExtensionRequest
		? Omit<Request, 'id'>
		: never
	: never;

type PendingRequest = {
	message: ExactExtensionRequest;
	resolve(value: any): void;
	reject(error: unknown): void;
	timeout?: ReturnType<typeof setTimeout>;
	recoveries: number;
};

const defaultResponseTimeoutMs = 5_000;
const reconnectDelayMs = 100;
const maximumSilentRecoveries = 1;

/**
 * Creates a reconnecting request client for one inspected tab.
 *
 * Pending read-only requests survive service-worker port replacement. Their response clocks run
 * only while the background router has proved that the page bridge and runtime are ready.
 */
export function createExactExtensionQueryClient(
	tabId: number,
	responseTimeoutMs = defaultResponseTimeoutMs
): ExactExtensionQueryClient {
	const pending = new Map<string, PendingRequest>();
	const subscriptions = new Map<string, (event: ExactRuntimeInspectionEvent) => void>();
	const statusListeners = new Set<(status: ExactExtensionBridgeStatus) => void>();
	const requestPrefix = crypto.randomUUID();
	let nextId = 1;
	let port: chrome.runtime.Port | undefined;
	let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
	let status: ExactExtensionBridgeStatus = 'connecting';
	let closed = false;
	connectPort();

	const client: ExactExtensionQueryClient = {
		onStatus(listener) {
			statusListeners.add(listener);
			listener(status);
			return () => statusListeners.delete(listener);
		},
		connect: () => send({ type: 'connect' }) as Promise<{ id: string }>,
		request: async (request: ExactInspectionRequest) =>
			parseExactInspectionResponse(await send({ type: 'query', request })),
		async subscribe(sessionId, cursor, listener) {
			const result = (await send({
				type: 'subscribe',
				sessionId,
				...(cursor ? { cursor } : {})
			})) as { subscriptionId: string };
			subscriptions.set(result.subscriptionId, listener);
			let subscriptionClosed = false;
			return Object.freeze({
				async close() {
					if (subscriptionClosed) return;
					subscriptionClosed = true;
					subscriptions.delete(result.subscriptionId);
					await send({
						type: 'unsubscribe',
						subscriptionId: result.subscriptionId
					}).catch(() => undefined);
				}
			});
		},
		async disconnect() {
			subscriptions.clear();
			await send({ type: 'disconnect' }).catch(() => undefined);
			closed = true;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			port?.disconnect();
			port = undefined;
			rejectPending('DevTools panel disconnected');
		},
		async highlight(identity) {
			await send({ type: 'highlight', identity });
		}
	};
	return Object.freeze(client);

	function connectPort(): void {
		if (closed || port) return;
		try {
			const candidate = chrome.runtime.connect({ name: `exact-devtools-panel:${tabId}` });
			port = candidate;
			candidate.onMessage.addListener((message) => receive(candidate, message));
			candidate.onDisconnect.addListener(() => disconnectPort(candidate));
			for (const request of pending.values()) post(candidate, request);
		} catch {
			scheduleReconnect();
		}
	}

	function receive(
		candidate: chrome.runtime.Port,
		message: ExactExtensionControlMessage | ExactExtensionResponse
	): void {
		if (port !== candidate) return;
		if (isControlMessage(message)) {
			setStatus(message.status);
			return;
		}
		if (!('id' in message)) {
			if (isExactRuntimeInspectionEvent(message.event))
				subscriptions.get(message.subscriptionId)?.(message.event);
			return;
		}
		const request = pending.get(message.id);
		if (!request) return;
		pending.delete(message.id);
		clearRequestTimeout(request);
		if (message.ok) request.resolve(message.result);
		else request.reject(new Error(message.error));
	}

	function disconnectPort(candidate: chrome.runtime.Port): void {
		void chrome.runtime.lastError;
		replacePort(candidate, false);
	}

	function replacePort(candidate: chrome.runtime.Port, disconnect: boolean): void {
		if (port !== candidate || closed) return;
		port = undefined;
		for (const request of pending.values()) clearRequestTimeout(request);
		subscriptions.clear();
		setStatus('reconnecting');
		if (disconnect) {
			try {
				candidate.disconnect();
			} catch {
				// The local endpoint may already have observed the transport failure.
			}
		}
		scheduleReconnect();
	}

	function scheduleReconnect(): void {
		if (closed || reconnectTimer) return;
		reconnectTimer = setTimeout(() => {
			reconnectTimer = undefined;
			connectPort();
		}, reconnectDelayMs);
	}

	function send(message: RequestWithoutId): Promise<unknown> {
		if (closed) return Promise.reject(new Error('DevTools panel disconnected'));
		const id = `panel-${requestPrefix}-${nextId++}`;
		return new Promise((resolve, reject) => {
			const request: PendingRequest = {
				message: { id, ...message } as ExactExtensionRequest,
				resolve,
				reject,
				recoveries: 0
			};
			pending.set(id, request);
			if (port) post(port, request);
			else connectPort();
		});
	}

	function post(candidate: chrome.runtime.Port, request: PendingRequest): void {
		try {
			candidate.postMessage(request.message);
			if (status === 'ready') armResponseTimeout(request);
		} catch {
			replacePort(candidate, true);
		}
	}

	function setStatus(next: ExactExtensionBridgeStatus): void {
		if (status === next) return;
		status = next;
		if (status === 'ready') {
			for (const request of pending.values()) armResponseTimeout(request);
		} else {
			for (const request of pending.values()) clearRequestTimeout(request);
		}
		for (const listener of statusListeners) listener(status);
	}

	function armResponseTimeout(request: PendingRequest): void {
		if (request.timeout) return;
		request.timeout = setTimeout(() => {
			request.timeout = undefined;
			if (!pending.has(request.message.id)) return;
			if (request.recoveries < maximumSilentRecoveries && port) {
				request.recoveries++;
				replacePort(port, true);
				return;
			}
			pending.delete(request.message.id);
			request.reject(new Error('DevTools runtime remained unresponsive after reconnecting'));
		}, responseTimeoutMs);
	}

	function clearRequestTimeout(request: PendingRequest): void {
		if (request.timeout) clearTimeout(request.timeout);
		request.timeout = undefined;
	}

	function rejectPending(reason: string): void {
		for (const request of pending.values()) {
			clearRequestTimeout(request);
			request.reject(new Error(reason));
		}
		pending.clear();
	}
}

function isControlMessage(message: unknown): message is ExactExtensionControlMessage {
	return (
		typeof message === 'object' &&
		message !== null &&
		(message as ExactExtensionControlMessage).channel === 'exact-devtools-control'
	);
}
