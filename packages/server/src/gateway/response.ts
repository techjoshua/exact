import { responseResourceBudget } from '../response-resources.js';
import type { ExactResponseLike, ExactResponseMetadata, ExactServerContext } from '../types.js';
import { gatewayHeaders } from './headers.js';

/** Relays status, headers and bounded response bytes without decoding JSON, NDJSON, or debug data. */
export function copyGatewayResponse(
	upstream: Response,
	context: ExactServerContext
): ExactResponseLike {
	const headers = gatewayHeaders(upstream.headers);
	const resources = responseResourceBudget(context.logger);
	// Fetch exposes decompressed bytes, so compressed wire metadata no longer describes this body.
	headers.delete('content-encoding');
	headers.delete('set-cookie');
	const setCookies = upstream.headers.getSetCookie();
	const result: ExactResponseMetadata = {
		status: upstream.status,
		headers: Object.fromEntries(headers),
		...(setCookies.length ? { setCookies } : {})
	};
	if (!upstream.body) return { ...result, body: '' };
	const streaming = upstream.headers
		.get('content-type')
		?.toLowerCase()
		.startsWith('application/x-ndjson');
	const option = streaming ? 'maxStreamBytes' : 'maxResponseBytes';
	return {
		...result,
		stream: boundedGatewayStream(upstream.body, (bytes) => {
			resources(
				option,
				context.limits?.[option],
				16 * 1024 * 1024,
				bytes,
				'gateway response relay',
				'upstream bytes'
			);
		})
	};
}

/** Retains backpressure and cancellation while counting bytes rather than protocol messages. */
function boundedGatewayStream(
	source: ReadableStream<Uint8Array>,
	check: (bytes: number) => void
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
					check(bytes);
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
