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

/** Creates request/response ownership over the inspected tab's extension port. */
export function createExactExtensionQueryClient(tabId: number): ExactExtensionQueryClient {
	const port = chrome.runtime.connect({ name: `exact-devtools-panel:${tabId}` });
	const pending = new Map<string, { resolve(value: any): void; reject(error: unknown): void }>();
	const subscriptions = new Map<string, (event: ExactRuntimeInspectionEvent) => void>();
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
		if (message.ok) request.resolve(message.result);
		else request.reject(new Error(message.error));
	});
	port.onDisconnect.addListener(() => {
		for (const request of pending.values()) request.reject(new Error('DevTools port disconnected'));
		pending.clear();
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
		const id = `panel-${nextId++}`;
		return new Promise((resolve, reject) => {
			pending.set(id, { resolve, reject });
			port.postMessage({ id, ...message });
		});
	}
}
