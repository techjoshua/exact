import { encodeReactiveProtocolValue, logFrameworkEvent } from '@exactjs/core';
import {
	consumeExactServerObservations,
	exactServerObservationRequestHeaders
} from '@exactjs/core/framework/inspection-transport';
import {
	parseExactBatchResponse,
	parseExactInvocationResponse,
	readExactStreamResponse
} from './responses.js';
import type {
	ExactInvocationRequest,
	ExactInvocationResult,
	ExactOperationResult,
	ExactResponseHeaders,
	ExactResponseMetadata,
	InvokeExactBatchOptions,
	InvokeExactOptions
} from './types.js';
import { positiveLimit, utf8ByteLength } from './limits.js';

/** Invokes a single eXact server task or boundary refresh endpoint operation. */
export async function invokeExact(options: InvokeExactOptions): Promise<ExactInvocationResult> {
	const fetchImpl = options.fetch ?? globalThis.fetch;
	if (!fetchImpl) throw new Error('eXact endpoint invocation requires fetch');

	const requestBody = encodeRequest(
		{
			type: options.type,
			root: options.root,
			id: options.id,
			partition: options.partition,
			payload: options.payload,
			state: options.state,
			publicContext: options.publicContext,
			boundaryHtml: options.boundaryHtml,
			boundaryHtmls: options.boundaryHtmls
		},
		options.streamLimits?.maxRequestBytes
	);
	const response = await withAbort(
		fetchImpl(options.endpoint, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(options.stream ? { accept: 'application/x-ndjson', 'x-exact-stream': '1' } : {}),
				...options.headers,
				...exactServerObservationRequestHeaders()
			},
			signal: options.signal,
			body: requestBody
		}),
		options.signal
	);
	notifyResponse(options.onResponse, response);

	if (!response.ok) {
		logFrameworkEvent(
			'warn',
			'hydrate',
			'request',
			`exact ${options.type} invocation failed with ${response.status}`,
			undefined,
			options.logger
		);
		throw await invocationFailure(response, `eXact ${options.type} invocation failed`, options);
	}
	const operation: ExactInvocationRequest = {
		type: options.type,
		root: options.root,
		id: options.id
	};
	if (options.stream) {
		const results = await readExactStreamResponse(response, [operation], {
			signal: options.signal,
			...options.streamLimits
		});
		const result = results[0];
		if (!result?.ok) throw new Error(`eXact ${options.type} invocation failed`);
		const { ok: _ok, type: _type, id: _id, ...body } = result;
		return body;
	}
	const body = await readJsonResponse(response, options.streamLimits, options.signal);
	return parseExactInvocationResponse(
		body,
		`eXact ${options.type} invocation returned malformed result`,
		operation,
		options.streamLimits
	);
}

/** Invokes multiple eXact operations as one batch request and returns per-operation results. */
export async function invokeExactBatch(
	options: InvokeExactBatchOptions
): Promise<ExactOperationResult[]> {
	const fetchImpl = options.fetch ?? globalThis.fetch;
	if (!fetchImpl) throw new Error('eXact endpoint invocation requires fetch');

	const requestBody = encodeRequest(
		{ type: 'batch', version: 1, operations: options.operations },
		options.streamLimits?.maxRequestBytes
	);
	const response = await withAbort(
		fetchImpl(options.endpoint, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(options.stream ? { accept: 'application/x-ndjson', 'x-exact-stream': '1' } : {}),
				...options.headers,
				...exactServerObservationRequestHeaders()
			},
			signal: options.signal,
			body: requestBody
		}),
		options.signal
	);
	notifyResponse(options.onResponse, response);

	if (!response.ok) {
		logFrameworkEvent(
			'warn',
			'hydrate',
			'request',
			`exact batch invocation failed with ${response.status}`,
			undefined,
			options.logger
		);
		throw await invocationFailure(response, 'eXact batch invocation failed', options);
	}
	if (options.stream)
		return readExactStreamResponse(response, options.operations, {
			signal: options.signal,
			...options.streamLimits
		});
	const body = await readJsonResponse(response, options.streamLimits, options.signal);
	return parseExactBatchResponse(body, options.operations, options.streamLimits);
}

/** Identifies the reserved top-level response that asks a remote root to replace its build. */
export class ExactBuildUnsupportedError extends Error {
	readonly status = 410;
	readonly code = 'exact_build_unsupported';

	constructor() {
		super('eXact remote build is no longer supported');
		this.name = 'ExactBuildUnsupportedError';
	}
}

async function invocationFailure(
	response: { status: number; json(): Promise<unknown>; text?(): Promise<string> },
	fallback: string,
	options: Pick<InvokeExactOptions, 'signal' | 'streamLimits'>
): Promise<Error> {
	try {
		const value = await readJsonResponse(response, options.streamLimits, options.signal);
		if (
			response.status === 410 &&
			value !== null &&
			typeof value === 'object' &&
			(value as { error?: unknown }).error === 'exact_build_unsupported'
		)
			return new ExactBuildUnsupportedError();
	} catch {
		// Malformed failure bodies retain the ordinary transport failure contract. Valid
		// failure bodies are still consumed so request-owned observations reach DevTools.
	}
	return new Error(fallback);
}

function notifyResponse(
	listener: ((response: ExactResponseMetadata) => void) | undefined,
	response: { status: number; headers?: ExactResponseHeaders | Readonly<Record<string, string>> }
): void {
	if (!listener) return;
	const preferredBuildKey = responseHeader(response.headers, 'x-exact-preferred-build');
	listener(
		Object.freeze({ status: response.status, ...(preferredBuildKey ? { preferredBuildKey } : {}) })
	);
}

function responseHeader(
	headers: ExactResponseHeaders | Readonly<Record<string, string>> | undefined,
	name: string
): string | undefined {
	if (!headers) return undefined;
	if ('get' in headers && typeof headers.get === 'function') return headers.get(name) ?? undefined;
	const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
	return key ? (headers as Readonly<Record<string, string>>)[key] : undefined;
}

function encodeRequest(value: unknown, maxBytes?: number): string {
	const body = JSON.stringify(encodeReactiveProtocolValue(value));
	if (utf8ByteLength(body) > positiveLimit(maxBytes, 4 * 1024 * 1024)) {
		throw new Error('eXact request exceeded maxRequestBytes');
	}
	return body;
}

async function readJsonResponse(
	response: {
		body?: ReadableStream<Uint8Array> | null;
		json(): Promise<unknown>;
		text?(): Promise<string>;
	},
	limits: InvokeExactOptions['streamLimits'],
	signal?: AbortSignal
): Promise<unknown> {
	if (response.body) {
		const text = await readBoundedResponseBody(
			response.body,
			positiveLimit(limits?.maxBytes, 16 * 1024 * 1024),
			signal
		);
		return consumeExactServerObservations(JSON.parse(text));
	}
	if (response.text) {
		const text = await withAbort(response.text(), signal);
		assertResponseBytes(text, limits?.maxBytes);
		return consumeExactServerObservations(JSON.parse(text));
	}
	// Runtime-neutral/custom fetch implementations may expose only json(). The
	// decoded value must still obey the same serialized byte contract; otherwise
	// adapter shape would silently disable maxBytes.
	const value = await withAbort(response.json(), signal);
	let encoded: string | undefined;
	try {
		encoded = JSON.stringify(value);
	} catch {
		/* parsed validators report malformed graphs */
	}
	if (encoded !== undefined) assertResponseBytes(encoded, limits?.maxBytes);
	return consumeExactServerObservations(value);
}

async function readBoundedResponseBody(
	body: ReadableStream<Uint8Array>,
	maxBytes: number,
	signal?: AbortSignal
): Promise<string> {
	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let length = 0;
	const abort = () => void reader.cancel(signal?.reason).catch(() => undefined);
	if (signal?.aborted) abort();
	else signal?.addEventListener('abort', abort, { once: true });
	try {
		while (true) {
			if (signal?.aborted)
				throw signal.reason ?? new DOMException('eXact request aborted', 'AbortError');
			const next = await reader.read();
			if (next.done) break;
			length += next.value.byteLength;
			if (length > maxBytes) throw new Error('eXact response exceeded maxBytes');
			chunks.push(next.value);
		}
		const bytes = new Uint8Array(length);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.byteLength;
		}
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch (error) {
		try {
			await reader.cancel(error);
		} catch {
			/* preserve the response validation failure */
		}
		throw error;
	} finally {
		signal?.removeEventListener('abort', abort);
		reader.releaseLock();
	}
}

function assertResponseBytes(value: string, configured?: number): void {
	if (utf8ByteLength(value) > positiveLimit(configured, 16 * 1024 * 1024)) {
		throw new Error('eXact response exceeded maxBytes');
	}
}

function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
	if (!signal) return promise;
	if (signal.aborted)
		return Promise.reject(signal.reason ?? new DOMException('eXact request aborted', 'AbortError'));
	return new Promise<T>((resolve, reject) => {
		const abort = () =>
			reject(signal.reason ?? new DOMException('eXact request aborted', 'AbortError'));
		signal.addEventListener('abort', abort, { once: true });
		promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
	});
}
