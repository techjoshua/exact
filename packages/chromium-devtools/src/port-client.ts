import type {
	ExactInspectionRequest,
	ExactInspectionResponse
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
	const pending = new Map<
		string,
		{ resolve(value: any): void; reject(error: unknown): void }
	>();
	let nextId = 1;
	port.onMessage.addListener((message: ExactExtensionResponse) => {
		if (!('id' in message)) return;
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
			(await send({ type: 'query', request })) as ExactInspectionResponse,
		disconnect: async () => {
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
