import { normalizeProtocolLimit } from '@exactjs/core/framework/protocol-records';
import type { ExactResponseLike, ExactServerContext } from '../types.js';
import { gatewayHeaders } from './headers.js';

/** Relays status, headers and bounded response bytes without decoding JSON, NDJSON, or debug data. */
export function copyGatewayResponse(
	upstream: Response,
	context: ExactServerContext
): ExactResponseLike {
	const headers = gatewayHeaders(upstream.headers);
	// Fetch exposes decompressed bytes, so compressed wire metadata no longer describes this body.
	headers.delete('content-encoding');
	headers.delete('set-cookie');
	const setCookies = upstream.headers.getSetCookie();
	const result: ExactResponseLike = {
		status: upstream.status,
		headers: Object.fromEntries(headers),
		body: '',
		...(setCookies.length ? { setCookies } : {})
	};
	if (!upstream.body) return result;
	const streaming = upstream.headers
		.get('content-type')
		?.toLowerCase()
		.startsWith('application/x-ndjson');
	const limit = normalizeProtocolLimit(
		streaming ? context.limits?.maxStreamBytes : context.limits?.maxResponseBytes,
		16 * 1024 * 1024
	);
	result.stream = boundedGatewayStream(upstream.body, limit);
	return result;
}

/** Retains backpressure and cancellation while counting bytes rather than protocol messages. */
function boundedGatewayStream(
	source: ReadableStream<Uint8Array>,
	maximum: number
): ReadableStream<Uint8Array> {
	const reader = source.getReader();
	let bytes = 0;
	let released = false;
	const release = () => {
		if (!released) {
			released = true;
			reader.releaseLock();
		}
	};
	return new ReadableStream<Uint8Array>(
		{
			async pull(controller) {
				try {
					const next = await reader.read();
					if (next.done) {
						release();
						controller.close();
						return;
					}
					bytes += next.value.byteLength;
					if (bytes > maximum) throw new RangeError('Gateway response byte limit exceeded');
					controller.enqueue(next.value);
				} catch (error) {
					await reader.cancel(error).catch(() => undefined);
					release();
					controller.error(error);
				}
			},
			async cancel(reason) {
				try {
					await reader.cancel(reason);
				} finally {
					release();
				}
			}
		},
		{ highWaterMark: 0 }
	);
}
