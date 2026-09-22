import {
	consumeExactResponseBody,
	exactResponseBodyOf,
	exactResponseHeaders,
	type ExactResponseLike
} from '@exactjs/server';

import { createBunProducedStream } from './produced-stream.js';

/** Converts buffered text and produced streams through Bun's native Fetch response body lanes. */
export function exactResponseToBunResponse(result: ExactResponseLike): Response {
	const body = exactResponseBodyOf(result);
	const content =
		![204, 205, 304].includes(result.status) && body?.kind === 'asynchronous'
			? createBunProducedStream(body)
			: consumeExactResponseBody(result);
	return new Response(content, {
		status: result.status,
		headers: exactResponseHeaders(result)
	});
}
