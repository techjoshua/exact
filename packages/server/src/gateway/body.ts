import {
	normalizeProtocolLimit,
	protocolUtf8ByteLength
} from '@exactjs/core/framework/protocol-records';
import type { ExactRequestLike } from '../types.js';

/** Reads original transport data with a byte ceiling, without invoking a JSON decoder. */
export async function readGatewayBody(
	request: ExactRequestLike,
	maximum?: number
): Promise<string | Uint8Array> {
	const limit = normalizeProtocolLimit(maximum, 4 * 1024 * 1024);
	if (request.signal?.aborted) throw request.signal.reason;
	if (request.body !== undefined) return validateBody(request.body, limit);
	if (!request.bodyStream) {
		if (request.text) {
			const body = await request.text();
			if (request.signal?.aborted) throw request.signal.reason;
			return validateBody(body, limit);
		}
		throw new TypeError('Gateway forwarding requires raw request text or bytes');
	}
	const reader = request.bodyStream.getReader();
	const abort = () => void reader.cancel(request.signal?.reason).catch(() => undefined);
	request.signal?.addEventListener('abort', abort, { once: true });
	const chunks: Uint8Array[] = [];
	let bytes = 0;
	try {
		while (true) {
			if (request.signal?.aborted) throw request.signal.reason;
			const next = await reader.read();
			if (request.signal?.aborted) throw request.signal.reason;
			if (next.done) break;
			bytes += next.value.byteLength;
			if (bytes > limit) throw new RangeError('Gateway request byte limit exceeded');
			chunks.push(next.value);
		}
		const result = new Uint8Array(bytes);
		let offset = 0;
		for (const chunk of chunks) {
			result.set(chunk, offset);
			offset += chunk.byteLength;
		}
		return result;
	} catch (error) {
		await reader.cancel(error).catch(() => undefined);
		throw error;
	} finally {
		request.signal?.removeEventListener('abort', abort);
		reader.releaseLock();
	}
}

function validateBody(body: unknown, limit: number): string | Uint8Array {
	if (typeof body !== 'string' && !(body instanceof Uint8Array)) {
		throw new TypeError(
			'Gateway forwarding requires raw request text or bytes, not a parsed object'
		);
	}
	if ((typeof body === 'string' ? protocolUtf8ByteLength(body) : body.byteLength) > limit) {
		throw new RangeError('Gateway request byte limit exceeded');
	}
	return body;
}
