import type {
	ExactDebugCapability,
	ExactInspectionRequest,
	ExactInspectionResponse,
	ExactInspectionSessionDescription,
	ExactInspectionSubscription,
	ExactInspectionSubscriptionHandle,
	ExactRuntimeInspectionEvent
} from '@exactjs/devtools-protocol';
import { isExactRuntimeInspectionEvent } from '@exactjs/devtools-protocol';

/** Same-origin browser client for debug messages at the configured eXact endpoint. */
export interface ExactBrowserServerInspectionClient {
	open(capabilities: readonly ExactDebugCapability[]): Promise<ExactInspectionSessionDescription | undefined>;
	query(sessionId: string, request: ExactInspectionRequest): Promise<ExactInspectionResponse>;
	subscribe(
		request: ExactInspectionSubscription,
		listener: (event: ExactRuntimeInspectionEvent) => void
	): ExactInspectionSubscriptionHandle;
	close(sessionId: string): Promise<void>;
}

/** Creates a browser-authenticated client without copying cookies or credentials. */
export function createExactBrowserServerInspectionClient(
	endpoint: string,
	fetchImpl: typeof fetch
): ExactBrowserServerInspectionClient {
	const client: ExactBrowserServerInspectionClient = {
		async open(capabilities) {
			try {
				const response = await send({ type: 'debug', version: 1, request: 'open', capabilities });
				if (!response.ok) return undefined;
				const body = (await response.json()) as { session?: ExactInspectionSessionDescription };
				return body.session;
			} catch {
				return undefined;
			}
		},
		async query(sessionId, request) {
			const response = await send({
				type: 'debug',
				version: 1,
				request: 'query',
				sessionId,
				query: request
			}, routeHeaders(request.params?.identity));
			return (await response.json()) as ExactInspectionResponse;
		},
		subscribe(request, listener) {
			const controller = new AbortController();
			let closed = false;
			void readEventStream(request, listener, controller.signal).finally(() => {
				closed = true;
			});
			return Object.freeze({
				get closed() {
					return closed;
				},
				close() {
					if (closed) return;
					closed = true;
					controller.abort();
				}
			});
		},
		async close(sessionId) {
			await send({ type: 'debug', version: 1, request: 'close', sessionId }).catch(
				() => undefined
			);
		}
	};
	return Object.freeze(client);

	function send(body: unknown, routedHeaders: Record<string, string> = {}): Promise<Response> {
		return fetchImpl(endpoint, {
			method: 'POST',
			credentials: 'include',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json',
				...routedHeaders
			},
			body: JSON.stringify(body)
		});
	}

	async function readEventStream(
		request: ExactInspectionSubscription,
		listener: (event: ExactRuntimeInspectionEvent) => void,
		signal: AbortSignal
	): Promise<void> {
		try {
			const response = await fetchImpl(endpoint, {
				method: 'POST',
				credentials: 'include',
				headers: {
					'content-type': 'application/json',
					accept: 'application/x-ndjson',
					...routeHeaders(request.filter)
				},
				body: JSON.stringify({
					type: 'debug',
					version: 1,
					request: 'subscribe',
					sessionId: request.sessionId,
					...(request.cursor ? { cursor: request.cursor } : {}),
					...(request.filter ? { filter: request.filter } : {})
				}),
				signal
			});
			if (!response.ok || !response.body) return;
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffered = '';
			for (;;) {
				const next = await reader.read();
				if (next.done) break;
				buffered += decoder.decode(next.value, { stream: true });
				if (buffered.length > 1024 * 1024) return;
				let newline = buffered.indexOf('\n');
				while (newline >= 0) {
					const line = buffered.slice(0, newline).trim();
					buffered = buffered.slice(newline + 1);
					if (line) {
						const event = JSON.parse(line) as unknown;
						if (
							isExactRuntimeInspectionEvent(event) &&
							event.id.sessionId === request.sessionId
						)
							listener(event);
					}
					newline = buffered.indexOf('\n');
				}
			}
		} catch {
			// Network failure and cancellation degrade to the attached client stream.
		}
	}

	function routeHeaders(
		route:
			| Readonly<{ binding?: string; buildKey?: string }>
			| undefined
	): Record<string, string> {
		return route?.binding && route.buildKey
			? {
					'x-exact-binding': route.binding,
					'x-exact-build': route.buildKey
				}
			: {};
	}
}
