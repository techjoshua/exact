import { responseResourceBudget, responseGraphLimits } from './response-resources.js';
import type { ResponseLimits } from './response/json.js';
import { logFrameworkEvent } from '@exactjs/core';
import { encodeInvocationProtocolValue } from '@exactjs/reactive/framework/protocol';
import {
	attachExactObservationOwner,
	readExactObservationOwner,
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
import { isJsonSafe } from './validation.js';

/** Invokes a single eXact server task or boundary refresh endpoint operation. */
export async function invokeExact(options: InvokeExactOptions): Promise<ExactInvocationResult> {
	return invokePreparedExact(options);
}

/** Encoded submission owned by one pending operation. It contains no original live receivers. */
export type PreparedExactState = Readonly<{
	encoded: unknown;
	valueDepth: number;
	transportError?: TypeError;
}>;

/** Internal submission path inserts already encoded state exactly once at its real envelope depth. */
export async function invokePreparedExact(
	options: InvokeExactOptions,
	preparedState?: PreparedExactState
): Promise<ExactInvocationResult> {
	const responseLimits = {
		arrayCompletion: options.arrayParser,
		...options.streamLimits,
		logger: options.logger,
		resources: responseResourceBudget(options.logger)
	};
	const fetchImpl = options.fetch ?? globalThis.fetch;
	if (!fetchImpl) throw new Error('eXact endpoint invocation requires fetch');

	const requestBody = encodeRequest(
		invocationEnvelope({
			type: options.type,
			arrayCompletion: options.arrayCompletion,
			root: options.root,
			id: options.id,
			partition: options.partition,
			payload: options.payload,
			state: options.state,
			publicContext: options.publicContext,
			boundaryHtml: options.boundaryHtml,
			boundaryHtmls: options.boundaryHtmls
		}),
		options,
		preparedState
	);
	const response = await withAbort(
		fetchImpl(options.endpoint, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(options.stream ? { accept: 'application/x-ndjson', 'x-exact-stream': '1' } : {}),
				...(options.progress ? { 'x-exact-progress': '1' } : {}),
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
		arrayCompletion: options.arrayCompletion,
		root: options.root,
		id: options.id
	};
	if (options.stream) {
		const results = await readExactStreamResponse(response, [operation], {
			signal: options.signal,
			progress: options.progress ? [options.progress] : undefined,
			...responseLimits
		});
		const result = results[0];
		if (!result?.ok) throw new Error(`eXact ${options.type} invocation failed`);
		const { ok: _ok, type: _type, id: _id, ...body } = result;
		return body;
	}
	const body = await readJsonResponse(response, responseLimits, options.signal);
	return parseExactInvocationResponse(
		body,
		`eXact ${options.type} invocation returned malformed result`,
		operation,
		responseLimits
	);
}

/** Invokes multiple eXact operations as one batch request and returns per-operation results. */
export async function invokeExactBatch(
	options: InvokeExactBatchOptions
): Promise<ExactOperationResult[]> {
	return invokePreparedExactBatch(options);
}

/** Internal batch path preserves alignment with cancellation-filtered active operations. */
export async function invokePreparedExactBatch(
	options: InvokeExactBatchOptions,
	preparedStates?: readonly (PreparedExactState | undefined)[]
): Promise<ExactOperationResult[]> {
	const responseLimits = {
		arrayCompletions: options.arrayParsers,
		...options.streamLimits,
		logger: options.logger,
		resources: responseResourceBudget(options.logger)
	};
	const fetchImpl = options.fetch ?? globalThis.fetch;
	if (!fetchImpl) throw new Error('eXact endpoint invocation requires fetch');

	const requestBody = encodeRequest(
		{ type: 'batch', version: 1, operations: options.operations.map(invocationEnvelope) },
		options,
		preparedStates
	);
	const response = await withAbort(
		fetchImpl(options.endpoint, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(options.stream ? { accept: 'application/x-ndjson', 'x-exact-stream': '1' } : {}),
				...(options.progress ? { 'x-exact-progress': '1' } : {}),
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
			progress: options.progress,
			...responseLimits
		});
	const body = await readJsonResponse(response, responseLimits, options.signal);
	return parseExactBatchResponse(body, options.operations, responseLimits);
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
	options: Pick<InvokeExactOptions, 'signal' | 'streamLimits' | 'logger'>
): Promise<Error> {
	try {
		const value = await readJsonResponse(
			response,
			{
				...options.streamLimits,
				logger: options.logger,
				resources: responseResourceBudget(options.logger)
			},
			options.signal
		);
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
		attachExactObservationOwner(
			{ status: response.status, ...(preferredBuildKey ? { preferredBuildKey } : {}) },
			readExactObservationOwner(response)
		)
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

/** Omits absent protocol fields while leaving nested authored data for lossless encoding. */
function invocationEnvelope(value: ExactInvocationRequest): ExactInvocationRequest {
	return Object.fromEntries(
		Object.entries(value).filter(([, item]) => item !== undefined)
	) as ExactInvocationRequest;
}

/** Encodes one envelope with an application-owned cap and a diagnostic default threshold. */
function encodeRequest(
	value: unknown,
	options: Pick<InvokeExactOptions, 'streamLimits' | 'logger'>,
	prepared?: PreparedExactState | readonly (PreparedExactState | undefined)[]
): string {
	let envelope = value;
	if (prepared && value && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		if (Array.isArray(prepared))
			envelope = {
				...record,
				operations: (record.operations as ExactInvocationRequest[]).map((operation, i) => {
					if (!prepared[i]) return operation;
					const copy = { ...operation };
					delete copy.state;
					return copy;
				})
			};
		else {
			const copy = { ...record };
			delete copy.state;
			envelope = copy;
		}
	}
	const encoded = encodeInvocationProtocolValue(envelope) as Record<string, unknown>;
	const insert = (
		target: Record<string, unknown>,
		state: PreparedExactState | undefined,
		depth: number
	) => {
		if (!state) return;
		if (state.transportError) throw state.transportError;
		if (state.valueDepth + depth > 100) throw new TypeError('Encoded state exceeds request depth');
		target.state = state.encoded;
	};
	if (Array.isArray(prepared)) {
		const operations = encoded.operations as Record<string, unknown>[];
		if (prepared.length !== operations.length)
			throw new TypeError('Misaligned prepared state vector');
		for (let i = 0; i < operations.length; i++) insert(operations[i]!, prepared[i], 3);
	} else insert(encoded, prepared as PreparedExactState | undefined, 1);
	const body = JSON.stringify(encoded);
	const bytes = utf8ByteLength(body);
	const maximum = options.streamLimits?.maxRequestBytes;
	if (bytes > positiveLimit(maximum, Number.MAX_SAFE_INTEGER)) {
		throw new Error('eXact request exceeded maxRequestBytes');
	}
	if (!positiveLimit(maximum, 0) && bytes > 4 * 1024 * 1024)
		logFrameworkEvent(
			'warn',
			'hydrate',
			'request-size',
			'Request body exceeds 4 MiB. Set streamLimits.maxRequestBytes to enforce an application-owned cap.',
			{ bytes, threshold: 4 * 1024 * 1024 },
			options.logger
		);
	return body;
}

async function readJsonResponse(
	response: {
		body?: ReadableStream<Uint8Array> | null;
		json(): Promise<unknown>;
		text?(): Promise<string>;
	},
	limits: ResponseLimits | undefined,
	signal?: AbortSignal
): Promise<unknown> {
	limits = { ...limits, resources: limits?.resources ?? responseResourceBudget(limits?.logger) };
	if (response.body) {
		const text = await readBoundedResponseBody(response.body, limits, signal);
		return consumeExactServerObservations(JSON.parse(text));
	}
	if (response.text) {
		const text = await withAbort(response.text(), signal);
		assertResponseBytes(text, limits);
		return consumeExactServerObservations(JSON.parse(text));
	}
	// Runtime-neutral/custom fetch implementations may expose only json(). The
	// decoded value must still obey the same serialized byte contract; otherwise
	// adapter shape would silently disable maxBytes.
	const value = await withAbort(response.json(), signal);
	// Byte accounting must not execute serialization hooks on values the parser will reject.
	// Leave encoded byte rejection to the exact serializer below, including JSON punctuation.
	if (
		!isJsonSafe(
			value,
			responseGraphLimits(limits, limits.resources!, 'buffered custom response graph')
		)
	)
		return null;
	let encoded: string | undefined;
	try {
		encoded = JSON.stringify(value);
	} catch {
		/* parsed validators report malformed graphs */
	}
	if (encoded !== undefined) assertResponseBytes(encoded, limits);
	return consumeExactServerObservations(value);
}

async function readBoundedResponseBody(
	body: ReadableStream<Uint8Array>,
	limits: ResponseLimits,
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
			if (signal?.aborted) throw signal.reason;
			const next = await reader.read();
			if (signal?.aborted) throw signal.reason;
			if (next.done) break;
			length += next.value.byteLength;
			limits.resources!(
				'maxBytes',
				limits.maxBytes,
				16 * 1024 * 1024,
				length,
				'buffered response body',
				'encoded UTF-8 bytes'
			);
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

function assertResponseBytes(value: string, limits: ResponseLimits): void {
	limits.resources!(
		'maxBytes',
		limits.maxBytes,
		16 * 1024 * 1024,
		utf8ByteLength(value),
		'buffered response body',
		'encoded UTF-8 bytes'
	);
}

function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
	if (!signal) return promise;
	if (signal.aborted) {
		// A custom fetcher can cancel its owner before returning already-started work.
		void promise.catch(() => {});
		return Promise.reject(signal.reason);
	}
	return new Promise<T>((resolve, reject) => {
		const abort = () => {
			signal.removeEventListener('abort', abort);
			reject(signal.reason);
		};
		signal.addEventListener('abort', abort, { once: true });
		promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
	});
}
