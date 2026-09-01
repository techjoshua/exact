import {
	exactResponseBodyOf,
	handleExactRequest,
	type ExactResponseLike,
	type ExactServerContext
} from '@exactjs/server';
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
		const body = readNodeRequestBody(request, requestLimit(context));
		// The server runtime may initialize asynchronous request contexts before it
		// asks for text. Observe an early transport rejection immediately while
		// preserving the original rejected promise for readBody().
		void body.catch(() => undefined);
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

/** Reads a Node request body while enforcing the configured byte limit during transport. */
export function readNodeRequestBody(
	request: IncomingMessage,
	maxBytes = 4 * 1024 * 1024
): Promise<string> {
	const declaredLength = Number(request.headers?.['content-length']);
	if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
		request.resume();
		return Promise.reject(new Error(`eXact request exceeded ${maxBytes} bytes`));
	}
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let bytes = 0;
		let settled = false;
		const cleanup = () => {
			request.off('data', onData);
			request.off('end', onEnd);
			request.off('error', onError);
		};
		const finish = (callback: () => void) => {
			if (settled) return;
			settled = true;
			cleanup();
			callback();
		};
		const onData = (chunk: Buffer | string) => {
			const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			bytes += value.byteLength;
			if (bytes > maxBytes) {
				finish(() => reject(new Error(`eXact request exceeded ${maxBytes} bytes`)));
				request.resume();
				return;
			}
			chunks.push(value);
		};
		const onEnd = () => finish(() => resolve(Buffer.concat(chunks).toString('utf8')));
		const onError = (error: Error) => finish(() => reject(error));
		request.on('data', onData);
		request.on('end', onEnd);
		request.on('error', onError);
	});
}

function requestLimit(context: ExactServerContext): number {
	const configured = context.limits?.maxRequestBytes;
	return typeof configured === 'number' && Number.isSafeInteger(configured) && configured > 0
		? configured
		: 4 * 1024 * 1024;
}

/** Writes an eXact response object to a Node ServerResponse. */
export async function writeNodeResponse(
	response: ServerResponse,
	result: ExactResponseLike,
	signal?: AbortSignal
): Promise<void> {
	response.statusCode = result.status;
	for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
	const body = exactResponseBodyOf(result);
	if (body?.kind === 'produced' && body.writeSynchronously) {
		try {
			const collected = collectProducedBody(body, signal);
			const output = typeof collected === 'string' ? collected : await collected;
			throwIfAborted(signal);
			response.end(output);
		} catch (error) {
			try {
				await body.cancel(error);
			} catch {
				/* preserve the production or request-scope failure */
			}
			if (!response.headersSent) {
				for (const name of response.getHeaderNames()) response.removeHeader(name);
				response.statusCode = 500;
				response.setHeader('content-type', 'application/json; charset=utf-8');
				response.end(JSON.stringify({ error: 'internal_error' }));
			} else if (!response.destroyed) response.destroy(error as Error);
		}
		return;
	}
	if (!body && !result.stream) {
		throwIfAborted(signal);
		response.end(result.body ?? '');
		return;
	}
	try {
		await writeNodeResponseBody(response, result, signal);
		throwIfAborted(signal);
		response.end();
	} catch (error) {
		await cancelNodeResponseBody(result, error);
		if (body?.kind === 'produced' && !response.headersSent) {
			for (const name of response.getHeaderNames()) response.removeHeader(name);
			response.statusCode = 500;
			response.setHeader('content-type', 'application/json; charset=utf-8');
			response.end(JSON.stringify({ error: 'internal_error' }));
		} else if (!response.destroyed) response.destroy(error as Error);
	}
}

/** Writes only an eXact response body, preserving Node backpressure without Web-stream allocation. */
export async function writeNodeResponseBody(
	response: ServerResponse,
	result: ExactResponseLike,
	signal?: AbortSignal
): Promise<void> {
	const body = exactResponseBodyOf(result);
	if (body) {
		if (body.kind === 'produced' && body.writeSynchronously) {
			const collected = collectProducedBody(body, signal);
			const output = typeof collected === 'string' ? collected : await collected;
			throwIfAborted(signal);
			if (!response.write(output)) await waitForDrain(response, signal);
			return;
		}
		await body.writeTo((chunk) => {
			throwIfAborted(signal);
			if (!response.write(chunk)) return waitForDrain(response, signal);
		});
		return;
	}
	if (result.stream) {
		await pipeReadableStream(result.stream, response, signal);
		return;
	}
	throwIfAborted(signal);
	response.write(result.body ?? '');
}

function collectProducedBody(
	body: NonNullable<ReturnType<typeof exactResponseBodyOf>>,
	signal?: AbortSignal
): string | Promise<string> {
	let output = '';
	const completion = body.writeSynchronously!((chunk) => {
		throwIfAborted(signal);
		output += chunk;
	});
	return completion ? completion.then(() => output) : output;
}

/** Cancels an unconsumed eXact response body without forcing lazy stream construction. */
export async function cancelNodeResponseBody(
	result: ExactResponseLike,
	reason?: unknown
): Promise<void> {
	const body = exactResponseBodyOf(result);
	if (body) await body.cancel(reason);
	else if (result.stream) await result.stream.cancel(reason);
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
	} catch (error) {
		try {
			await reader.cancel(error);
		} catch {
			/* preserve the transport failure */
		}
		throw error;
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
