/** One request/response/event transport over the Chrome DevTools Protocol. */
export interface ExactCdpTransport {
	request<Result = unknown>(
		method: string,
		params?: Record<string, unknown>,
		signal?: AbortSignal
	): Promise<Result>;
	onEvent(listener: (method: string, params: unknown) => void): () => void;
	close(): Promise<void>;
}

/** Options for attaching to an existing Chromium target. */
export type ExactCdpConnectionOptions = Readonly<{
	webSocketUrl?: string;
	debugUrl?: string;
	targetId?: string;
	transport?: ExactCdpTransport;
	signal?: AbortSignal;
	connectTimeoutMs?: number;
	requestTimeoutMs?: number;
	maxDiscoveryBytes?: number;
	maxPendingRequests?: number;
	maxMessageBytes?: number;
}>;

type Pending = {
	resolve(value: unknown): void;
	reject(error: unknown): void;
	timer: ReturnType<typeof setTimeout>;
	cleanup(): void;
};

/** Opens a CDP WebSocket or returns the explicitly injected test transport. */
export async function connectExactCdp(
	options: ExactCdpConnectionOptions
): Promise<ExactCdpTransport> {
	if (options.transport) return options.transport;
	const connectTimeoutMs = positiveInteger(options.connectTimeoutMs, 10_000, 'connectTimeoutMs');
	const requestTimeoutMs = positiveInteger(options.requestTimeoutMs, 10_000, 'requestTimeoutMs');
	const maxDiscoveryBytes = positiveInteger(
		options.maxDiscoveryBytes,
		1024 * 1024,
		'maxDiscoveryBytes'
	);
	const maxPendingRequests = positiveInteger(options.maxPendingRequests, 128, 'maxPendingRequests');
	const maxMessageBytes = positiveInteger(
		options.maxMessageBytes,
		8 * 1024 * 1024,
		'maxMessageBytes'
	);
	const webSocketUrl =
		options.webSocketUrl ??
		(await discoverWebSocketUrl(
			options.debugUrl,
			options.targetId,
			maxDiscoveryBytes,
			connectTimeoutMs,
			options.signal
		));
	if (!webSocketUrl) throw new Error('No inspectable Chromium target was found');
	const socket = new WebSocket(webSocketUrl);
	try {
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(
				() => finish(() => reject(new Error('CDP WebSocket timed out'))),
				connectTimeoutMs
			);
			const opened = () => finish(resolve);
			const failed = () => finish(() => reject(new Error('CDP WebSocket failed')));
			const aborted = () =>
				finish(() =>
					reject(options.signal?.reason ?? new DOMException('CDP connection aborted', 'AbortError'))
				);
			const finish = (action: () => void) => {
				clearTimeout(timer);
				socket.removeEventListener('open', opened);
				socket.removeEventListener('error', failed);
				options.signal?.removeEventListener('abort', aborted);
				action();
			};
			socket.addEventListener('open', opened, { once: true });
			socket.addEventListener('error', failed, { once: true });
			options.signal?.addEventListener('abort', aborted, { once: true });
			if (options.signal?.aborted) aborted();
		});
	} catch (error) {
		socket.close();
		throw error;
	}
	let nextId = 1;
	const pending = new Map<number, Pending>();
	const listeners = new Set<(method: string, params: unknown) => void>();
	socket.addEventListener('message', (event) => {
		if (
			(typeof event.data === 'string' && utf8Length(event.data) > maxMessageBytes) ||
			(event.data instanceof Blob && event.data.size > maxMessageBytes) ||
			(event.data instanceof ArrayBuffer && event.data.byteLength > maxMessageBytes)
		) {
			socket.close();
			return;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(String(event.data));
		} catch {
			return;
		}
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
		const message = parsed as Record<string, unknown>;
		if (typeof message.id === 'number') {
			const request = pending.get(message.id);
			if (!request) return;
			pending.delete(message.id);
			request.cleanup();
			if (message.error) request.reject(new Error(cdpErrorMessage(message.error)));
			else request.resolve(message.result);
			return;
		}
		if (typeof message.method === 'string')
			for (const listener of listeners) listener(message.method, message.params);
	});
	socket.addEventListener('close', () => {
		for (const request of pending.values()) {
			request.cleanup();
			request.reject(new Error('CDP socket closed'));
		}
		pending.clear();
	});
	const transport: ExactCdpTransport = {
		request(method, params = {}, signal) {
			if (pending.size >= maxPendingRequests)
				return Promise.reject(new Error('CDP pending request limit exceeded'));
			const id = nextId++;
			return new Promise((resolve, reject) => {
				const abort = () =>
					settle(() =>
						reject(signal?.reason ?? new DOMException('CDP request aborted', 'AbortError'))
					);
				const timer = setTimeout(
					() => settle(() => reject(new Error(`CDP request timed out during ${method}`))),
					requestTimeoutMs
				);
				const cleanup = () => {
					clearTimeout(timer);
					signal?.removeEventListener('abort', abort);
				};
				const settle = (action: () => void) => {
					if (!pending.delete(id)) return;
					cleanup();
					action();
				};
				pending.set(id, { resolve, reject, timer, cleanup });
				if (signal?.aborted) return abort();
				signal?.addEventListener('abort', abort, { once: true });
				try {
					socket.send(JSON.stringify({ id, method, params }));
				} catch (error) {
					settle(() => reject(error));
				}
			});
		},
		onEvent(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		async close() {
			if (socket.readyState === WebSocket.CLOSED) return;
			socket.close();
			await new Promise<void>((resolve, reject) => {
				const timer = setTimeout(
					() => reject(new Error('CDP WebSocket close timed out')),
					connectTimeoutMs
				);
				socket.addEventListener(
					'close',
					() => {
						clearTimeout(timer);
						resolve();
					},
					{ once: true }
				);
			});
		}
	};
	return Object.freeze(transport);
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
	const resolved = value ?? fallback;
	if (!Number.isSafeInteger(resolved) || resolved <= 0)
		throw new Error(`CDP ${name} must be a positive integer`);
	return resolved;
}

function utf8Length(value: string): number {
	let bytes = 0;
	for (let index = 0; index < value.length; index++) {
		const code = value.charCodeAt(index);
		if (code < 0x80) bytes++;
		else if (code < 0x800) bytes += 2;
		else if (
			code >= 0xd800 &&
			code <= 0xdbff &&
			index + 1 < value.length &&
			value.charCodeAt(index + 1) >= 0xdc00 &&
			value.charCodeAt(index + 1) <= 0xdfff
		) {
			bytes += 4;
			index++;
		} else bytes += 3;
	}
	return bytes;
}

function cdpErrorMessage(value: unknown): string {
	return value && typeof value === 'object' && 'message' in value
		? String((value as { message: unknown }).message)
		: String(value);
}

async function discoverWebSocketUrl(
	debugUrl = 'http://127.0.0.1:9222',
	targetId?: string,
	maxBytes = 1024 * 1024,
	timeoutMs = 10_000,
	signal?: AbortSignal
): Promise<string | undefined> {
	const requestSignal = AbortSignal.any([
		AbortSignal.timeout(timeoutMs),
		...(signal ? [signal] : [])
	]);
	const response = await fetch(new URL('/json/list', debugUrl), { signal: requestSignal });
	if (!response.ok) throw new Error(`Chromium target discovery failed (${response.status})`);
	const text = await readBoundedText(response.body, maxBytes, requestSignal);
	const targets = JSON.parse(text) as Array<{
		id?: string;
		type?: string;
		webSocketDebuggerUrl?: string;
	}>;
	const target =
		targets.find((candidate) => candidate.id === targetId) ??
		targets.find((candidate) => candidate.type === 'page' && candidate.webSocketDebuggerUrl);
	return target?.webSocketDebuggerUrl;
}

async function readBoundedText(
	body: ReadableStream<Uint8Array> | null,
	maxBytes: number,
	signal: AbortSignal
): Promise<string> {
	if (!body) throw new Error('Chromium target discovery returned no body');
	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let length = 0;
	try {
		while (true) {
			if (signal.aborted) throw signal.reason;
			const next = await reader.read();
			if (next.done) break;
			length += next.value.byteLength;
			if (length > maxBytes) throw new Error('Chromium target discovery exceeded its byte limit');
			chunks.push(next.value);
		}
		const bytes = new Uint8Array(length);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.byteLength;
		}
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch (error) {
		await reader.cancel(error).catch(() => undefined);
		throw error;
	} finally {
		reader.releaseLock();
	}
}
