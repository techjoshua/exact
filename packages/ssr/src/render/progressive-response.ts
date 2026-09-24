import { attachSuppressedCleanupFailure, type Child } from '@exactjs/core';
import { createExactAsyncProducedResponse } from '@exactjs/server';
import { produceProgressiveHtml } from '../stream/production.js';
import { progressiveHtmlResponseHeaders } from '../stream/protocol.js';
import type { ExactResponseLike, RenderToProgressiveHtmlResponseOptions } from '../types.js';
import { streamDocumentRender } from './render-output.js';

/** Creates one adapter-owned progressive response from scheduled document events. */
export function createProgressiveProducedResponse(
	operation: Child,
	options: RenderToProgressiveHtmlResponseOptions
): ExactResponseLike {
	const response: ReturnType<typeof createExactAsyncProducedResponse> =
		createExactAsyncProducedResponse(
			options.status ?? 200,
			progressiveHtmlResponseHeaders(options),
			(write, signal) =>
				produceProgressiveHtml(
					(streamOptions, emit, abort) =>
						streamDocumentRender(operation, streamOptions, emit, true, abort),
					options,
					write,
					{
						signal,
						abort(reason) {
							// The body already owns cancellation and waits for this producer to unwind.
							// Do not await that completion from inside the producer itself.
							void response.body
								.cancel(reason)
								.catch((cleanup) => attachSuppressedCleanupFailure(reason, cleanup));
						}
					}
				)
		);
	return response;
}
