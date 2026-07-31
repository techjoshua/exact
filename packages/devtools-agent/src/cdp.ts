/** One request/response/event transport over the Chrome DevTools Protocol. */
export interface ExactCdpTransport {
	request<Result = unknown>(method: string, params?: Record<string, unknown>): Promise<Result>;
	onEvent(listener: (method: string, params: unknown) => void): () => void;
	close(): Promise<void>;
}

/** Options for attaching to an existing Chromium target. */
export type ExactCdpConnectionOptions = Readonly<{
	webSocketUrl?: string;
	debugUrl?: string;
	targetId?: string;
	transport?: ExactCdpTransport;
}>;

type Pending = {
	resolve(value: unknown): void;
	reject(error: unknown): void;
};

/** Opens a CDP WebSocket or returns the explicitly injected test transport. */
export async function connectExactCdp(
	options: ExactCdpConnectionOptions
): Promise<ExactCdpTransport> {
	if (options.transport) return options.transport;
	const webSocketUrl =
		options.webSocketUrl ?? (await discoverWebSocketUrl(options.debugUrl, options.targetId));
	if (!webSocketUrl) throw new Error('No inspectable Chromium target was found');
	const socket = new WebSocket(webSocketUrl);
	await new Promise<void>((resolve, reject) => {
		socket.addEventListener('open', () => resolve(), { once: true });
		socket.addEventListener('error', () => reject(new Error('CDP WebSocket failed')), {
			once: true
		});
	});
	let nextId = 1;
	const pending = new Map<number, Pending>();
	const listeners = new Set<(method: string, params: unknown) => void>();
	socket.addEventListener('message', (event) => {
		let message: any;
		try {
			message = JSON.parse(String(event.data));
		} catch {
			return;
		}
		if (typeof message.id === 'number') {
			const request = pending.get(message.id);
			if (!request) return;
			pending.delete(message.id);
			if (message.error) request.reject(new Error(String(message.error.message)));
			else request.resolve(message.result);
			return;
		}
		if (typeof message.method === 'string')
			for (const listener of listeners) listener(message.method, message.params);
	});
	socket.addEventListener('close', () => {
		for (const request of pending.values()) request.reject(new Error('CDP socket closed'));
		pending.clear();
	});
	const transport: ExactCdpTransport = {
		request(method, params = {}) {
			const id = nextId++;
			return new Promise((resolve, reject) => {
				pending.set(id, { resolve, reject });
				socket.send(JSON.stringify({ id, method, params }));
			});
		},
		onEvent(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		async close() {
			if (socket.readyState === WebSocket.CLOSED) return;
			socket.close();
			await new Promise<void>((resolve) =>
				socket.addEventListener('close', () => resolve(), { once: true })
			);
		}
	};
	return Object.freeze(transport);
}

async function discoverWebSocketUrl(
	debugUrl = 'http://127.0.0.1:9222',
	targetId?: string
): Promise<string | undefined> {
	const response = await fetch(new URL('/json/list', debugUrl));
	if (!response.ok) throw new Error(`Chromium target discovery failed (${response.status})`);
	const targets = (await response.json()) as Array<{
		id?: string;
		type?: string;
		webSocketDebuggerUrl?: string;
	}>;
	const target =
		targets.find((candidate) => candidate.id === targetId) ??
		targets.find((candidate) => candidate.type === 'page' && candidate.webSocketDebuggerUrl);
	return target?.webSocketDebuggerUrl;
}
