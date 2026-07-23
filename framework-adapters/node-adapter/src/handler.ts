import { handleExactRequest, type ExactResponseLike, type ExactServerContext } from '@exactjs/server';
import type { IncomingMessage, ServerResponse } from 'node:http';

/** Creates a Node http.createServer-compatible eXact endpoint handler. */
export function createExactNodeHandler(
	context: ExactServerContext
): (request: IncomingMessage, response: ServerResponse) => void {
	return (request, response) => {
		const disconnect = new AbortController();
		const abort = () => disconnect.abort(new DOMException('Client disconnected', 'AbortError'));
		request.once('aborted', abort);
		response.once('close', abort);
		const cleanup = () => {
			request.off('aborted', abort);
			response.off('close', abort);
		};
		// Begin consuming the evented request body before asynchronous context
		// factories run so early data/end events cannot be missed.
		const body = readNodeRequestBody(request);
		void handleExactRequest(
			{
				method: request.method ?? 'GET',
				url: request.url,
				headers: request.headers,
				text: () => body,
				signal: disconnect.signal,
				platformRequest: request
			},
			context
		).then(
			(result) => writeNodeResponse(response, result, disconnect.signal).finally(cleanup),
			(error) => {
				cleanup();
				writeNodeError(response, error);
			}
		);
	};
}

/** Reads a Node IncomingMessage body as UTF-8 text. */
export function readNodeRequestBody(request: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		request.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
		request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
		request.on('error', reject);
	});
}

/** Writes an eXact response object to a Node ServerResponse. */
export async function writeNodeResponse(
	response: ServerResponse,
	result: ExactResponseLike,
	signal?: AbortSignal
): Promise<void> {
	response.statusCode = result.status;
	for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
	if (result.stream) {
		await pipeReadableStream(result.stream, response, signal);
	} else {
		response.end(result.body ?? '');
	}
}

function writeNodeError(response: ServerResponse, error: unknown): void {
	response.statusCode = 500;
	response.setHeader('content-type', 'application/json; charset=utf-8');
	response.end(JSON.stringify({ error: 'internal_error' }));
	if (error instanceof Error) process.emitWarning(error);
}

async function pipeReadableStream(
	stream: ReadableStream<Uint8Array>,
	response: ServerResponse,
	signal?: AbortSignal
): Promise<void> {
	const reader = stream.getReader();
	try {
		while (true) {
			throwIfAborted(signal);
			const next = await reader.read();
			if (next.done) break;
			throwIfAborted(signal);
			if (!response.write(next.value)) await waitForDrain(response, signal);
		}
		throwIfAborted(signal);
		response.end();
	} catch (error) {
		try {
			await reader.cancel(error);
		} catch {
			/* preserve the transport failure */
		}
		if (!response.destroyed) response.destroy(error as Error);
	} finally {
		try {
			reader.releaseLock();
		} catch {
			/* reader cleanup is best-effort */
		}
	}
}

function waitForDrain(response: ServerResponse, signal?: AbortSignal): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		let settled = false;
		const cleanup = () => {
			response.off('drain', drain);
			signal?.removeEventListener('abort', abort);
		};
		const finish = (callback: () => void) => {
			if (settled) return;
			settled = true;
			cleanup();
			callback();
		};
		const drain = () => finish(resolve);
		const abort = () =>
			finish(() => reject(signal?.reason ?? new DOMException('Client disconnected', 'AbortError')));
		if (signal?.aborted) {
			abort();
			return;
		}
		response.once('drain', drain);
		signal?.addEventListener('abort', abort, { once: true });
	});
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) throw signal.reason ?? new DOMException('Client disconnected', 'AbortError');
}

export { createExactNodeHandler as createNodeHandler };
