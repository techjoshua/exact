import { parseExactInspectionResponse } from '@exactjs/devtools-protocol';
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
				if (!response.ok) {
					await response.body?.cancel();
					return undefined;
				}
				const body = (await readJson(response)) as { session?: unknown };
				return validatedSessionDescription(body.session);
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
				{ ...routeHeaders(request.params?.identity), 'x-exact-debug-session': sessionId }
			);
			const parsed = parseExactInspectionResponse(await readJson(response));
			if (parsed.id !== request.id || (parsed.ok && parsed.identity.sessionId !== sessionId))
				throw new TypeError('DevTools server response does not match its query session');
			return parsed;
		},
		async close(sessionId) {
			await send({ type: 'debug', version: 1, request: 'close', sessionId })
				.then((response) => response.body?.cancel())
				.catch(() => undefined);
		}
	};
	return client;

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

/** Accepts only a bounded session that can own the browser's attached inspection resources. */
function validatedSessionDescription(
	value: unknown
): ExactInspectionSessionDescription | undefined {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
	const session = value as Record<string, unknown>;
	if (
		session.protocol !== 1 ||
		typeof session.id !== 'string' ||
		session.id.length === 0 ||
		session.id.length > 256 ||
		typeof session.openedAt !== 'number' ||
		!Number.isFinite(session.openedAt) ||
		session.openedAt < 0 ||
		typeof session.expiresAt !== 'number' ||
		!Number.isFinite(session.expiresAt) ||
		session.expiresAt <= session.openedAt ||
		!Array.isArray(session.capabilities) ||
		session.capabilities.length > 4 ||
		!session.capabilities.every(
			(capability) =>
				typeof capability === 'string' &&
				['catalog', 'snapshot', 'events', 'source'].includes(capability)
		)
	)
		return undefined;
	return value as ExactInspectionSessionDescription;
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
