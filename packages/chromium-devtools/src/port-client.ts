import {
	isExactRuntimeInspectionEvent,
	parseExactInspectionResponse,
	type ExactInspectionRequest,
	type ExactRuntimeInspectionEvent
} from '@exactjs/devtools-protocol';
import type {
	ExactExtensionQueryClient,
	ExactExtensionRequest,
	ExactExtensionResponse
} from './messages.js';

type ExactExtensionRequestWithoutId = ExactExtensionRequest extends infer Request
	? Request extends ExactExtensionRequest
		? Omit<Request, 'id'>
		: never
	: never;

type PendingRequest = {
	resolve(value: any): void;
	reject(error: unknown): void;
	timeout: ReturnType<typeof setTimeout>;
};

const defaultResponseTimeoutMs = 5_000;

/** Creates request/response ownership over the inspected tab's extension port. */
export function createExactExtensionQueryClient(
	tabId: number,
	responseTimeoutMs = defaultResponseTimeoutMs
): ExactExtensionQueryClient {
	const port = chrome.runtime.connect({ name: `exact-devtools-panel:${tabId}` });
	const pending = new Map<string, PendingRequest>();
	const subscriptions = new Map<string, (event: ExactRuntimeInspectionEvent) => void>();
	const requestPrefix = crypto.randomUUID();
	let nextId = 1;
	port.onMessage.addListener((message: ExactExtensionResponse) => {
		if (!('id' in message)) {
			if (isExactRuntimeInspectionEvent(message.event))
				subscriptions.get(message.subscriptionId)?.(message.event);
			return;
		}
		const request = pending.get(message.id);
		if (!request) return;
		pending.delete(message.id);
		clearTimeout(request.timeout);
		if (message.ok) request.resolve(message.result);
		else request.reject(new Error(message.error));
	});
	port.onDisconnect.addListener(() => {
		void chrome.runtime.lastError;
		for (const request of pending.values()) {
			clearTimeout(request.timeout);
			request.reject(new Error('DevTools port disconnected'));
		}
		pending.clear();
		subscriptions.clear();
	});
	const client: ExactExtensionQueryClient = {
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
			let closed = false;
			return Object.freeze({
				async close() {
					if (closed) return;
					closed = true;
					subscriptions.delete(result.subscriptionId);
					await send({
						type: 'unsubscribe',
						subscriptionId: result.subscriptionId
					}).catch(() => undefined);
				}
			});
		},
		disconnect: async () => {
			subscriptions.clear();
			await send({ type: 'disconnect' }).catch(() => undefined);
			port.disconnect();
		},
		highlight: async (identity) => {
			await send({ type: 'highlight', identity });
		}
	};
	return Object.freeze(client);

	function send(message: ExactExtensionRequestWithoutId): Promise<unknown> {
		const id = `panel-${requestPrefix}-${nextId++}`;
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				if (!pending.delete(id)) return;
				reject(new Error('DevTools page bridge did not respond; reload the inspected page'));
			}, responseTimeoutMs);
			pending.set(id, { resolve, reject, timeout });
			try {
				port.postMessage({ id, ...message });
			} catch (error) {
				pending.delete(id);
				clearTimeout(timeout);
				reject(error);
			}
		});
	}
}
