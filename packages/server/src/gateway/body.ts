import { reportDefaultRequestSize } from '../request-body-size.js';
import type { Logger } from '@exactjs/core';
import {
	normalizeProtocolLimit,
	protocolUtf8ByteLength
} from '@exactjs/core/framework/protocol-records';
import type { ExactRequestLike } from '../types.js';

/** Reads original transport data with a byte ceiling, without invoking a JSON decoder. */
export async function readGatewayBody(
	request: ExactRequestLike,
	maximum?: number,
	logger?: Logger
): Promise<string | Uint8Array> {
	const limit = normalizeProtocolLimit(maximum, Number.MAX_SAFE_INTEGER);
	if (request.signal?.aborted) throw request.signal.reason;
	if (request.body !== undefined) return validateBody(request.body, limit, maximum, logger);
	if (!request.bodyStream) {
		if (request.text) {
			const body = await request.text();
			if (request.signal?.aborted) throw request.signal.reason;
			return validateBody(body, limit, maximum, logger);
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
		reportDefaultRequestSize(bytes, maximum, logger);
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

function validateBody(
	body: unknown,
	limit: number,
	maximum: number | undefined,
	logger: Logger | undefined
): string | Uint8Array {
	if (typeof body !== 'string' && !(body instanceof Uint8Array)) {
		throw new TypeError(
			'Gateway forwarding requires raw request text or bytes, not a parsed object'
		);
	}
	const bytes = typeof body === 'string' ? protocolUtf8ByteLength(body) : body.byteLength;
	if (bytes > limit) {
		throw new RangeError('Gateway request byte limit exceeded');
	}
	reportDefaultRequestSize(bytes, maximum, logger);
	return body;
}
