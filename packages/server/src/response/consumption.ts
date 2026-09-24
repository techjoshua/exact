import { logFrameworkEvent } from '@exactjs/core';
import type { ExactResponseLike } from '../types.js';
import { exactResponseBodyOf, type ExactResponseStreamOptions } from './body.js';

/** Claims one explicit response representation for a Fetch-compatible transport. */
export function consumeExactResponseBody(
	response: ExactResponseLike,
	options?: ExactResponseStreamOptions
): string | ReadableStream<Uint8Array> | null {
	if ([204, 205, 304].includes(response.status)) {
		void cancelExactResponseBody(response, 'HTTP status excludes a response body').catch((error) =>
			logFrameworkEvent('error', 'server', 'response', 'bodyless response cleanup failed', error)
		);
		return null;
	}
	const body = exactResponseBodyOf(response);
	if (body) return body.kind === 'buffered' ? body.toText() : body.toReadableStream(options);
	return response.stream ?? (typeof response.body === 'string' ? response.body : '');
}

/** Cancels the response's sole body representation without starting unclaimed production. */
export async function cancelExactResponseBody(
	response: ExactResponseLike,
	reason?: unknown
): Promise<void> {
	const body = exactResponseBodyOf(response);
	if (body) await body.cancel(reason);
	else if (response.stream) await response.stream.cancel(reason);
}
