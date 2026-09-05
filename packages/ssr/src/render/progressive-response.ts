import type { Child } from '@exactjs/core';
import { createExactAsyncProducedResponse } from '@exactjs/server';
import type { ExactResponseLike, RenderToProgressiveHtmlResponseOptions } from '../types.js';
import { produceProgressiveHtml } from '../stream/production.js';
import { progressiveHtmlResponseHeaders } from '../stream/protocol.js';
import { streamDocumentRender } from './async-rendering.js';

/** Creates one adapter-owned progressive response from scheduled document events. */
export function createProgressiveProducedResponse(
	operation: Child,
	options: RenderToProgressiveHtmlResponseOptions
): ExactResponseLike {
	return createExactAsyncProducedResponse(
		options.status ?? 200,
		progressiveHtmlResponseHeaders(options),
		(write, signal) =>
			produceProgressiveHtml(
				(streamOptions, emit) => streamDocumentRender(operation, streamOptions, emit),
				options,
				write,
				signal
			)
	);
}
