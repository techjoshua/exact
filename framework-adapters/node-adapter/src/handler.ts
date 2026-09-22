import {
	exactResponseBodyOf,
	cancelExactResponseBody,
	handleExactRequest,
	type ExactResponseLike,
	type ExactServerContext
} from '@exactjs/server';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { reportNodeError } from './error-reporting.js';
import { writeNodeError } from './requests/error.js';
import { createNodeRequestAdmission, type NodeSchedulingOptions } from './requests/admission.js';

/** Node-owned immutable encoding capabilities used while consuming produced response bodies. */
const nodeSynchronousResponseEnvironment = Object.freeze({
	encodedByteLength: (value: string) => Buffer.byteLength(value)
});

/** Creates a Node endpoint handler with automatic adaptive admission and disconnect cancellation. */
export function createExactNodeHandler(
	context: ExactServerContext,
	options: NodeSchedulingOptions = {}
): (request: IncomingMessage, response: ServerResponse) => void {
	const admit = createNodeRequestAdmission(options);
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
		const execute = () =>
			handleExactRequest(
				{
					method: request.method ?? 'GET',
					url: request.url,
					headers: request.headers,
					text: () => body,
					signal: disconnect.signal,
					platformRequest: request
				},
				context
			);
		let result: Promise<ExactResponseLike>;
		try {
			const pending = admit(response, disconnect.signal);
			result = pending ? pending.then(execute) : execute();
		} catch (error) {
			result = Promise.reject(error);
		}
		void result
			.then((result) =>
				writeNodeResponse(response, result, disconnect.signal, context.logger).finally(cleanup)
			)
			.catch((error) => {
				cleanup();
				if (disconnect.signal.aborted && error === disconnect.signal.reason) return;
				try {
					writeNodeError(response, error, context.logger);
				} catch (writeError) {
					reportNodeError(writeError, 'response', context.logger);
					if (!response.destroyed) response.destroy();
				}
			});
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

/**
 * Writes an eXact response, reporting production, transport and cleanup failures through the
 * supplied logger or console. Error details never enter the generic failure response body.
 */
export async function writeNodeResponse(
	response: ServerResponse,
	result: ExactResponseLike,
	signal?: AbortSignal,
	logger?: ExactServerContext['logger']
): Promise<void> {
	response.statusCode = result.status;
	for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
	if (result.setCookies?.length) response.setHeader('set-cookie', [...result.setCookies]);
	if ([204, 205, 304].includes(result.status)) {
		try {
			await cancelExactResponseBody(result, 'HTTP status excludes a response body');
			response.end();
		} catch (error) {
			reportNodeError(error, 'cleanup', logger);
			if (!response.headersSent) {
				for (const name of response.getHeaderNames()) response.removeHeader(name);
				response.statusCode = 500;
				response.setHeader('content-type', 'application/json; charset=utf-8');
				response.end(JSON.stringify({ error: 'internal_error' }));
			} else if (!response.destroyed) response.destroy(error as Error);
		}
		return;
	}
	const body = exactResponseBodyOf(result);
	if (body?.kind === 'synchronous') {
		try {
			const collected = collectProducedBody(body, signal, response);
			const output = typeof collected === 'string' ? collected : await collected;
			throwIfAborted(signal);
			// Prepare known-length headers only after production and request-scope cleanup succeed.
			if (!response.headersSent && response.hasHeader('content-length'))
				response.writeHead(response.statusCode);
			response.end(output);
		} catch (error) {
			if (!signal?.aborted || error !== signal.reason) reportNodeError(error, 'response', logger);
			try {
				await body.cancel(error);
			} catch (cleanupError) {
				if (cleanupError !== error) reportNodeError(cleanupError, 'cleanup', logger);
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
		response.end(typeof result.body === 'string' ? result.body : '');
		return;
	}
	try {
		if (body?.kind === 'buffered') {
			throwIfAborted(signal);
			response.end(body.toText());
			return;
		}
		await writeNodeResponseBody(response, result, signal);
		throwIfAborted(signal);
		response.end();
	} catch (error) {
		if (!signal?.aborted || error !== signal.reason) reportNodeError(error, 'response', logger);
		try {
			await cancelNodeResponseBody(result, error);
		} catch (cleanupError) {
			if (cleanupError !== error) reportNodeError(cleanupError, 'cleanup', logger);
		}
		if (body && body.kind !== 'buffered' && !response.headersSent) {
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
		if (body.kind === 'synchronous') {
			const collected = collectProducedBody(body, signal);
			const output = typeof collected === 'string' ? collected : await collected;
			throwIfAborted(signal);
			if (!response.write(output)) await waitForDrain(response, signal);
			return;
		}
		let trailingSurrogate = '';
		await body.writeTo((chunk) => {
			throwIfAborted(signal);
			if (trailingSurrogate) {
				chunk = trailingSurrogate + chunk;
				trailingSurrogate = '';
			}
			const last = chunk.charCodeAt(chunk.length - 1);
			if (last >= 0xd800 && last <= 0xdbff) {
				trailingSurrogate = chunk.slice(-1);
				chunk = chunk.slice(0, -1);
			}
			if (chunk && !response.write(chunk)) return waitForDrain(response, signal);
		});
		if (trailingSurrogate) {
			throwIfAborted(signal);
			if (!response.write(trailingSurrogate)) await waitForDrain(response, signal);
		}
		return;
	}
	if (result.stream) {
		await pipeReadableStream(result.stream, response, signal);
		return;
	}
	throwIfAborted(signal);
	response.write(typeof result.body === 'string' ? result.body : '');
}

/** Collects output and optional complete-body byte facts before commitment and scope cleanup. */
function collectProducedBody(
	body: Extract<NonNullable<ReturnType<typeof exactResponseBodyOf>>, { kind: 'synchronous' }>,
	signal?: AbortSignal,
	lengthResponse?: ServerResponse
): string | Promise<string> {
	let output = '';
	const completion = body.writeSynchronously!(
		(chunk) => {
			throwIfAborted(signal);
			output += chunk;
		},
		lengthResponse
			? Object.freeze({
					...nodeSynchronousResponseEnvironment,
					setBodyByteLength(bytes: number) {
						if (!Number.isSafeInteger(bytes) || bytes < 0)
							throw new TypeError('Invalid produced body byte length');
						if (
							!lengthResponse.headersSent &&
							lengthResponse.statusCode >= 200 &&
							lengthResponse.statusCode !== 204 &&
							lengthResponse.statusCode !== 304 &&
							!lengthResponse.hasHeader('transfer-encoding')
						)
							lengthResponse.setHeader('content-length', bytes);
					}
				})
			: nodeSynchronousResponseEnvironment
	);
	return completion ? completion.then(() => output) : output;
}

/** Cancels an unconsumed eXact response body without forcing lazy stream construction. */
export async function cancelNodeResponseBody(
	result: ExactResponseLike,
	reason?: unknown
): Promise<void> {
	await cancelExactResponseBody(result, reason);
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
