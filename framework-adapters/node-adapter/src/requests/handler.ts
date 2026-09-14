import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ExactServerContext } from '@exactjs/server';
import { createNodeRequestAdmission, type NodeSchedulingOptions } from './admission.js';
import { writeNodeError } from './error.js';
import { reportNodeError } from '../error-reporting.js';

/** A Node page or application handler whose signal cancels when its client disconnects. */
export type NodeRequestHandler = (
	request: IncomingMessage,
	response: ServerResponse,
	signal: AbortSignal
) => void | Promise<void>;

/** Configures host-owned admission and unexpected handler error reporting. */
export interface NodeHandlerOptions extends NodeSchedulingOptions {
	/** Receives unexpected failures; errors sent to clients remain generic. */
	logger?: ExactServerContext['logger'];
}

/**
 * Wraps a Node page/application handler with automatic adaptive admission before rendering starts.
 * Create once per host. Quiet requests begin synchronously; queued disconnects never run the handler.
 * Successful completion and cancellation release listeners. The callback owns its response and must
 * observe the supplied signal for pending tasks or streaming work. Synchronous and asynchronous
 * failures are reported and terminate the response without exposing implementation details.
 */
export function createNodeHandler(
	handler: NodeRequestHandler,
	options: NodeHandlerOptions = {}
): (request: IncomingMessage, response: ServerResponse) => void {
	const admit = createNodeRequestAdmission(options);
	return (request, response) => {
		const disconnect = new AbortController();
		const cleanup = () => {
			request.off('aborted', abort);
			response.off('close', close);
			response.off('finish', cleanup);
		};
		const abort = () => {
			disconnect.abort(new DOMException('Client disconnected', 'AbortError'));
			cleanup();
		};
		const close = () => {
			if (!response.writableFinished) abort();
			else cleanup();
		};
		const fail = (error: unknown) => {
			cleanup();
			if (disconnect.signal.aborted && error === disconnect.signal.reason) return;
			try {
				writeNodeError(response, error, options.logger);
			} catch (writeError) {
				reportNodeError(writeError, 'response', options.logger);
				if (!response.destroyed) response.destroy();
			}
		};
		const run = () => {
			if (disconnect.signal.aborted) return;
			return handler(request, response, disconnect.signal);
		};
		request.once('aborted', abort);
		response.once('close', close);
		response.once('finish', cleanup);
		try {
			if (request.aborted || response.destroyed) {
				abort();
				return;
			}
			const pending = admit(response, disconnect.signal);
			const result = pending ? pending.then(run) : run();
			if (result) void result.catch(fail);
		} catch (error) {
			fail(error);
		}
	};
}
