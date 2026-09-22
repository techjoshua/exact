import {
	consumeExactResponseBody,
	exactResponseHeaders,
	type ExactResponseLike
} from '@exactjs/server';

// Bun pulls completed spans in batches; this bounded queue avoids a promise per span.
const responseStreamOptions = Object.freeze({ highWaterMarkBytes: 32 * 1024 });

/** Converts buffered text and produced streams through Bun's native Fetch response body lanes. */
export function exactResponseToBunResponse(result: ExactResponseLike): Response {
	return new Response(consumeExactResponseBody(result, responseStreamOptions), {
		status: result.status,
		headers: exactResponseHeaders(result)
	});
}
