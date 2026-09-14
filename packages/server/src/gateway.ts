import { jsonResponse } from './protocol.js';
import { normalizeProtocolLimit } from '@exactjs/core/framework/protocol-records';
import type {
	ExactBindingGateway,
	ExactBindingGatewayOptions,
	ExactGatewayRejectEvent,
	ExactResponseLike
} from './types.js';
import { copyGatewayResponse } from './gateway/response.js';
import { gatewayHeaders } from './gateway/headers.js';

/** Routes raw authenticated requests to an application-configured service without interpreting its protocol. */
export function createExactBindingGateway(
	options: ExactBindingGatewayOptions
): ExactBindingGateway {
	const bindings = Object.freeze({ ...options.bindings });
	const maximum = normalizeProtocolLimit(options.maxBindingLength, 128);
	return Object.freeze({
		async forward(request, body, context) {
			const headers = gatewayHeaders(request.headers);
			const binding = headers.get('x-exact-binding') ?? undefined;
			if (!validBinding(binding, maximum))
				return reject(options, 'invalid_binding', undefined, 400);
			const target = Object.hasOwn(bindings, binding) ? bindings[binding] : undefined;
			if (!target) return reject(options, 'unknown_binding', binding, 404);
			const buildKey = headers.get('x-exact-build') ?? undefined;
			headers.delete('x-exact-binding');
			// Preserve correlation without leaving a routing instruction for a downstream gateway.
			headers.delete('x-exact-debug-binding');
			if (headers.has('x-exact-debug-session')) headers.set('x-exact-debug-binding', binding);
			headers.delete('host');
			const base = { method: 'POST', url: target.endpoint, headers, body, signal: request.signal };
			let forwarded = base;
			if (options.transformForwardedRequest) {
				try {
					const transformed = await options.transformForwardedRequest(
						base,
						{ binding, buildKey, endpoint: target.endpoint },
						context
					);
					if (
						!transformed ||
						transformed.method.toUpperCase() !== 'POST' ||
						String(transformed.url) !== target.endpoint ||
						transformed.body !== body ||
						transformed.signal !== request.signal
					)
						throw new TypeError('Forwarding transforms may change headers only');
					const transformedHeaders = gatewayHeaders(transformed.headers);
					transformedHeaders.delete('x-exact-binding');
					transformedHeaders.delete('host');
					forwarded = { ...base, headers: transformedHeaders };
				} catch {
					return reject(options, 'transform_failed', binding, 502);
				}
			}
			try {
				const upstream = await (options.fetch ?? globalThis.fetch)(target.endpoint, {
					method: 'POST',
					headers: forwarded.headers,
					body: body as BodyInit,
					signal: request.signal,
					// A downstream redirect is a response to relay, not permission to send credentials elsewhere.
					redirect: 'manual'
				});
				return copyGatewayResponse(upstream, context);
			} catch {
				return reject(options, 'upstream_unavailable', binding, 502);
			}
		}
	} satisfies ExactBindingGateway);
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
