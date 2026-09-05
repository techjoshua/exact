import { attachSuppressedCleanupFailure, logFrameworkEvent } from '@exactjs/core';
import type { ExactResponseBodyWriter } from '@exactjs/server';
import type { ExactDocumentStreamEvent, RenderToProgressiveHtmlStreamOptions } from '../types.js';
import { utf8ByteLength } from '../render/utf8.js';
import type { ProgressiveDocumentStreamRender } from './creation.js';
import {
	cleanupAll,
	forwardAbort,
	positiveLimit,
	progressiveErrorScript,
	progressiveHtmlChunk,
	progressiveRootId,
	type ProgressiveDocumentState
} from './protocol.js';

/** Produces progressive HTML strings directly into an asynchronous environment writer. */
export async function produceProgressiveHtml(
	render: ProgressiveDocumentStreamRender,
	options: RenderToProgressiveHtmlStreamOptions,
	write: ExactResponseBodyWriter,
	bodySignal: AbortSignal
): Promise<void> {
	const streamOptions: RenderToProgressiveHtmlStreamOptions = {
		...options,
		rootId: progressiveRootId(options)
	};
	const controller = new AbortController();
	const unlinkOptions = forwardAbort(options.signal, controller);
	const unlinkBody = forwardAbort(bodySignal, controller);
	streamOptions.signal = controller.signal;
	const maxEvents = positiveLimit(options.maxStreamEvents, 100_000);
	const maxBytes = positiveLimit(options.maxStreamBytes, 16 * 1024 * 1024);
	const documentState: ProgressiveDocumentState = {};
	let events = 0;
	let bytes = 0;
	const emitChunk = async (chunk: string): Promise<void> => {
		throwIfProgressiveAborted(controller.signal);
		if (++events > maxEvents) throw new Error('SSR stream event limit exceeded');
		bytes += utf8ByteLength(chunk);
		if (bytes > maxBytes) throw new Error('SSR stream byte limit exceeded');
		await write(chunk);
		throwIfProgressiveAborted(controller.signal);
	};
	try {
		await render(streamOptions, async (event: ExactDocumentStreamEvent) => {
			throwIfProgressiveAborted(controller.signal);
			const chunk = progressiveHtmlChunk(event, streamOptions, documentState);
			if (chunk) await emitChunk(chunk);
		});
	} catch (error) {
		if (controller.signal.aborted) throw controller.signal.reason ?? error;
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
		cleanupAll(unlinkBody, unlinkOptions);
	}
}

function throwIfProgressiveAborted(signal: AbortSignal): void {
	if (!signal.aborted) return;
	throw signal.reason ?? new DOMException('SSR stream aborted', 'AbortError');
}
