import { jsonResponse } from './protocol.js';
import {
	exactDebugCapabilityForRequest,
	type ExactDebugCapability
} from '@exactjs/devtools-protocol';
import type {
	ExactBindingGateway,
	ExactBindingGatewayOptions,
	ExactGatewayRejectEvent,
	ExactProtocolRequest,
	ExactRequestLike,
	ExactResponseLike,
	ExactServerContext
} from './types.js';
import { debugRoute, remoteDebugRequest, translateDebugResponse } from './gateway-debug.js';

const hopByHopHeaders = new Set([
	'connection',
	'keep-alive',
	'proxy-authenticate',
	'proxy-authorization',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade'
]);

/** Creates page-host forwarding behavior consumed by handleExactRequest after security. */
export function createExactBindingGateway(
	options: ExactBindingGatewayOptions
): ExactBindingGateway {
	const bindings = Object.freeze({ ...options.bindings });
	const maximumBindingLength = positiveLimit(options.maxBindingLength, 128);
	const children = new Map<
		string,
		{
			parentSessionId: string;
			childSessionId: string;
			binding: string;
			buildKey: string;
			capabilities: Set<ExactDebugCapability>;
		}
	>();
	const gateway: ExactBindingGateway = {
		async forward(request, input, context) {
			const binding = headerValue(request.headers, 'x-exact-binding');
			if (!validBinding(binding, maximumBindingLength))
				return reject(options, 'invalid_binding', undefined, 400);
			const target = bindings[binding];
			if (!target) return reject(options, 'unknown_binding', binding, 404);
			const buildKey = headerValue(request.headers, 'x-exact-build');
			if (!buildKey || !/^[0-9a-f]{40}$/i.test(buildKey))
				return reject(options, 'invalid_build', binding, 400);
			if (input.type !== 'debug')
				return forwardEnvelope(request, input, binding, buildKey, target.endpoint, context);
			if (input.request === 'open' || input.request === 'close')
				return reject(options, 'invalid_binding', binding, 400);
			const route = debugRoute(input);
			if (!route || route.buildKey !== buildKey)
				return reject(options, 'invalid_build', binding, 400);
			const allowedRoots = target.debugBuilds?.[buildKey];
			if (!allowedRoots?.includes(route.executionRoot))
				return reject(options, 'invalid_build', binding, 404);
			const capability = exactDebugCapabilityForRequest(input);
			const child = await ensureChildSession(
				request,
				input.sessionId,
				binding,
				buildKey,
				target.endpoint,
				capability,
				context
			);
			if (!child) return reject(options, 'upstream_unavailable', binding, 404);
			const translated = remoteDebugRequest(input, child.childSessionId);
			const response = await forwardEnvelope(
				request,
				translated,
				binding,
				buildKey,
				target.endpoint,
				context
			);
			return translateDebugResponse(
				response,
				child.childSessionId,
				input.sessionId,
				binding,
				buildKey
			);
		},
		async closeDebugSession(sessionId, context) {
			const owned = [...children.entries()].filter(
				([, child]) => child.parentSessionId === sessionId
			);
			for (const [key, child] of owned) {
				children.delete(key);
				const target = bindings[child.binding];
				if (!target) continue;
				await forwardEnvelope(
					{
						method: 'POST',
						headers: { 'x-exact-build': child.buildKey },
						body: ''
					},
					{
						type: 'debug',
						version: 1,
						request: 'close',
						sessionId: child.childSessionId
					},
					child.binding,
					child.buildKey,
					target.endpoint,
					context
				).catch(() => undefined);
			}
		}
	};
	return Object.freeze(gateway);

	async function ensureChildSession(
		request: ExactRequestLike,
		parentSessionId: string,
		binding: string,
		buildKey: string,
		endpoint: string,
		capability: ExactDebugCapability,
		context: ExactServerContext
	): Promise<
		| {
				parentSessionId: string;
				childSessionId: string;
				binding: string;
				buildKey: string;
				capabilities: Set<ExactDebugCapability>;
		  }
		| undefined
	> {
		const key = `${parentSessionId}\0${binding}\0${buildKey}`;
		const existing = children.get(key);
		if (existing) {
			existing.capabilities.add(capability);
			return existing;
		}
		const response = await forwardEnvelope(
			request,
			{ type: 'debug', version: 1, request: 'open', capabilities: [capability] },
			binding,
			buildKey,
			endpoint,
			context
		);
		if (response.status !== 200) return undefined;
		try {
			const parsed = JSON.parse(response.body) as {
				session?: { id?: unknown };
			};
			if (typeof parsed.session?.id !== 'string') return undefined;
			const child = {
				parentSessionId,
				childSessionId: parsed.session.id,
				binding,
				buildKey,
				capabilities: new Set([capability])
			};
			children.set(key, child);
			return child;
		} catch {
			return undefined;
		}
	}

	async function forwardEnvelope(
		request: ExactRequestLike,
		input: ExactProtocolRequest,
		binding: string,
		buildKey: string,
		endpoint: string,
		context: ExactServerContext
	): Promise<ExactResponseLike> {
		const body = JSON.stringify(input);
		const forwardedHeaders = sanitizedRequestHeaders(request.headers);
		forwardedHeaders.set('content-type', 'application/json');
		forwardedHeaders.set('x-exact-build', buildKey);
		const base: ExactRequestLike = {
			method: 'POST',
			url: endpoint,
			headers: forwardedHeaders,
			body,
			signal: request.signal
		};
		let transformed = base;
		if (options.transformForwardedRequest) {
			try {
				transformed = await options.transformForwardedRequest(
					base,
					{ binding, buildKey, endpoint },
					context
				);
				assertSafeTransform(transformed, base, endpoint, buildKey);
			} catch {
				return reject(options, 'transform_failed', binding, 502);
			}
		}
		const fetchImpl = options.fetch ?? globalThis.fetch;
		if (!fetchImpl) return reject(options, 'upstream_unavailable', binding, 502);
		let upstream: Response;
		try {
			upstream = await fetchImpl(endpoint, {
				method: 'POST',
				headers: new Headers(transformed.headers as HeadersInit),
				body,
				signal: request.signal,
				redirect: 'follow'
			});
		} catch {
			return reject(options, 'upstream_unavailable', binding, 502);
		}
		try {
			return await copyValidatedResponse(upstream, context);
		} catch {
			return reject(options, 'upstream_invalid_response', binding, 502);
		}
	}
}

function assertSafeTransform(
	transformed: ExactRequestLike,
	base: ExactRequestLike,
	endpoint: string,
	buildKey: string
): void {
	if (
		!transformed ||
		transformed.method.toUpperCase() !== 'POST' ||
		String(transformed.url) !== endpoint ||
		transformed.body !== base.body ||
		transformed.signal !== base.signal ||
		headerValue(transformed.headers, 'x-exact-binding') !== undefined ||
		headerValue(transformed.headers, 'x-exact-build') !== buildKey
	)
		throw new Error('Unsafe forwarded eXact request transform');
}

async function copyValidatedResponse(
	upstream: Response,
	context: ExactServerContext
): Promise<ExactResponseLike> {
	const contentType = upstream.headers.get('content-type')?.toLowerCase() ?? '';
	const headers = responseHeaders(upstream.headers);
	if (contentType.startsWith('application/x-ndjson')) {
		if (!upstream.body) throw new Error('Missing upstream stream');
		return {
			status: upstream.status,
			headers,
			body: '',
			stream: validateNdjsonStream(upstream.body, {
				maxBytes: positiveLimit(context.limits?.maxStreamBytes, 16 * 1024 * 1024),
				maxEvents: positiveLimit(context.limits?.maxStreamEvents, 100_000)
			})
		};
	}
	if (!contentType.startsWith('application/json')) throw new Error('Invalid upstream content type');
	const body = await upstream.text();
	if (
		new TextEncoder().encode(body).byteLength >
		positiveLimit(context.limits?.maxResponseBytes, 16 * 1024 * 1024)
	)
		throw new Error('Upstream response too large');
	JSON.parse(body);
	return { status: upstream.status, headers, body };
}

function validateNdjsonStream(
	source: ReadableStream<Uint8Array>,
	limits: { maxBytes: number; maxEvents: number }
): ReadableStream<Uint8Array> {
	const reader = source.getReader();
	const decoder = new TextDecoder('utf-8', { fatal: true });
	let buffer = '';
	let bytes = 0;
	let events = 0;
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const next = await reader.read();
				if (next.done) {
					buffer += decoder.decode();
					validateLines(true);
					controller.close();
					reader.releaseLock();
					return;
				}
				bytes += next.value.byteLength;
				if (bytes > limits.maxBytes) throw new Error('Upstream stream too large');
				buffer += decoder.decode(next.value, { stream: true });
				validateLines(false);
				controller.enqueue(next.value);
			} catch (error) {
				await reader.cancel(error).catch(() => undefined);
				controller.error(error);
			}
		},
		async cancel(reason) {
			await reader.cancel(reason);
		}
	});

	function validateLines(final: boolean): void {
		let newline: number;
		while ((newline = buffer.indexOf('\n')) >= 0) {
			validateLine(buffer.slice(0, newline).replace(/\r$/, ''));
			buffer = buffer.slice(newline + 1);
		}
		if (final && buffer.trim()) validateLine(buffer.replace(/\r$/, ''));
	}

	function validateLine(line: string): void {
		if (!line.trim()) return;
		if (++events > limits.maxEvents) throw new Error('Upstream stream has too many events');
		JSON.parse(line);
	}
}

function sanitizedRequestHeaders(headers: ExactRequestLike['headers']): Headers {
	const result = new Headers(headers as HeadersInit | undefined);
	result.delete('x-exact-binding');
	result.delete('cookie');
	result.delete('authorization');
	result.delete('origin');
	result.delete('referer');
	result.delete('host');
	result.delete('content-length');
	for (const header of hopByHopHeaders) result.delete(header);
	return result;
}

function responseHeaders(headers: Headers): Record<string, string> {
	const result: Record<string, string> = {};
	headers.forEach((value, name) => {
		if (
			hopByHopHeaders.has(name.toLowerCase()) ||
			name.toLowerCase() === 'content-length' ||
			name.toLowerCase() === 'content-encoding'
		)
			return;
		result[name] = value;
	});
	return result;
}

function reject(
	options: ExactBindingGatewayOptions,
	reason: ExactGatewayRejectEvent['reason'],
	binding: string | undefined,
	status: number
): ExactResponseLike {
	options.onReject?.(Object.freeze({ reason, ...(binding ? { binding } : {}) }));
	return jsonResponse(status, { error: reason });
}

function validBinding(value: string | undefined, maximum: number): value is string {
	return !!value && value.length <= maximum && /^[A-Za-z0-9._-]+$/.test(value);
}

function headerValue(headers: ExactRequestLike['headers'], name: string): string | undefined {
	if (!headers) return undefined;
	if (headers instanceof Headers) return headers.get(name) ?? undefined;
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() !== name) continue;
		return Array.isArray(value) ? value[0] : value;
	}
	return undefined;
}

function positiveLimit(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
