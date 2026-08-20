import type {
	ExactDebugCapability,
	ExactInspectionRequest,
	ExactInspectionResponse,
	ExactInspectionSessionDescription
} from '@exactjs/devtools-protocol';

/** Same-origin browser client for debug messages at the configured eXact endpoint. */
export interface ExactBrowserServerInspectionClient {
	open(
		capabilities: readonly ExactDebugCapability[]
	): Promise<ExactInspectionSessionDescription | undefined>;
	query(sessionId: string, request: ExactInspectionRequest): Promise<ExactInspectionResponse>;
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
			const response = await send(
				{
					type: 'debug',
					version: 1,
					request: 'query',
					sessionId,
					query: request
				},
				routeHeaders(request.params?.identity)
			);
			return (await response.json()) as ExactInspectionResponse;
		},
		async close(sessionId) {
			await send({ type: 'debug', version: 1, request: 'close', sessionId }).catch(() => undefined);
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

	function routeHeaders(
		route: Readonly<{ binding?: string; buildKey?: string }> | undefined
	): Record<string, string> {
		return route?.binding && route.buildKey
			? {
					'x-exact-binding': route.binding,
					'x-exact-build': route.buildKey
				}
			: {};
	}
}
