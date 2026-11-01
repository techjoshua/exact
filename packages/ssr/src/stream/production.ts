import { deriveRuntimeConfiguration } from '@exactjs/core/framework/configuration';
import { attachSuppressedCleanupFailure, logFrameworkEvent } from '@exactjs/core';
import type { ExactResponseBodyWriter } from '@exactjs/server';
import { utf8ByteLength } from '../render/utf8.js';
import type { ExactDocumentStreamEvent, RenderToProgressiveHtmlStreamOptions } from '../types.js';
import type { ProgressiveDocumentStreamRender } from './creation.js';
import {
	forwardAbort,
	positiveLimit,
	progressiveErrorScript,
	progressiveHtmlChunk,
	progressiveRootId,
	type ProgressiveDocumentState
} from './protocol.js';

/** Produces progressive HTML spans using the response body's existing cancellation lifetime. */
export async function produceProgressiveHtml(
	render: ProgressiveDocumentStreamRender,
	options: RenderToProgressiveHtmlStreamOptions,
	write: ExactResponseBodyWriter,
	controller: Pick<AbortController, 'signal' | 'abort'>
): Promise<void> {
	const streamOptions: RenderToProgressiveHtmlStreamOptions = deriveRuntimeConfiguration(
		options,
		() => ({ rootId: progressiveRootId(options) })
	);
	const maxEvents = positiveLimit(options.maxStreamEvents, Infinity);
	const maxBytes = positiveLimit(options.maxStreamBytes, Infinity);
	const unlinkOptions = forwardAbort(options.signal, controller);
	streamOptions.signal = controller.signal;
	const documentState: ProgressiveDocumentState = {};
	let events = 0;
	let bytes = 0;
	const emitChunk = (chunk: string): void | Promise<void> => {
		throwIfProgressiveAborted(controller.signal);
		if (++events > maxEvents) throw new Error('SSR stream event limit exceeded');
		bytes += utf8ByteLength(chunk);
		if (bytes > maxBytes) throw new Error('SSR stream byte limit exceeded');
		const pending = write(chunk);
		if (pending instanceof Promise)
			return pending.then(() => throwIfProgressiveAborted(controller.signal));
		throwIfProgressiveAborted(controller.signal);
	};
	try {
		await render(
			streamOptions,
			(event: ExactDocumentStreamEvent) => {
				throwIfProgressiveAborted(controller.signal);
				const chunk = progressiveHtmlChunk(event, streamOptions, documentState);
				if (chunk) return emitChunk(chunk);
			},
			(reason) => controller.abort(reason)
		);
	} catch (error) {
		if (controller.signal.aborted) throw controller.signal.reason;
		logFrameworkEvent(
			'error',
			'ssr',
			'stream',
			'progressive document render failed',
			error,
			options.logger
		);
		try {
			await emitChunk(progressiveErrorScript(error, streamOptions));
		} catch (emitError) {
			attachSuppressedCleanupFailure(emitError, error);
			throw emitError;
		}
	} finally {
		unlinkOptions();
	}
}

function throwIfProgressiveAborted(signal: AbortSignal): void {
	if (!signal.aborted) return;
	throw signal.reason;
}
