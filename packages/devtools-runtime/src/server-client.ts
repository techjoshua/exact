import type {
	ExactDebugCapability,
	ExactInspectionRequest,
	ExactInspectionResponse,
	ExactInspectionSessionDescription
} from '@exactjs/devtools-protocol';

const responseTimeoutMilliseconds = 10_000;
const maximumResponseBytes = 8 * 1024 * 1024;

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
				const body = (await readJson(response)) as { session?: ExactInspectionSessionDescription };
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
			return (await readJson(response)) as ExactInspectionResponse;
		},
		async close(sessionId) {
			await send({ type: 'debug', version: 1, request: 'close', sessionId }).catch(() => undefined);
		}
	};
	return Object.freeze(client);

	function send(body: unknown, routedHeaders: Record<string, string> = {}): Promise<Response> {
		const signal = AbortSignal.timeout(responseTimeoutMilliseconds);
		return fetchImpl(endpoint, {
			method: 'POST',
			credentials: 'include',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json',
				...routedHeaders
			},
			body: JSON.stringify(body),
			signal
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

async function readJson(response: Response): Promise<unknown> {
	if (!response.body) throw new Error('DevTools server returned no response body');
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let length = 0;
	try {
		while (true) {
			const next = await reader.read();
			if (next.done) break;
			length += next.value.byteLength;
			if (length > maximumResponseBytes)
				throw new Error('DevTools server response exceeded its byte limit');
			chunks.push(next.value);
		}
		const bytes = new Uint8Array(length);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.byteLength;
		}
		return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
	} catch (error) {
		await reader.cancel(error).catch(() => undefined);
		throw error;
	} finally {
		reader.releaseLock();
	}
}
