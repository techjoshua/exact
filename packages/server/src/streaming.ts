import {
	attachSuppressedCleanupFailure,
	attemptCleanup,
	createCleanupFailure,
	encodeReactiveProtocolValue,
	throwCleanupFailure
} from '@exactjs/core';
import type {
	ExactBatchRequest,
	ExactInvocationRequest,
	ExactOperationError,
	ExactOperationResult,
	ExactRequestLike,
	ExactResponseLike,
	ExactServerContext,
	ExactStreamEvent
} from './types.js';

/** Defines the exact operation dispatcher type contract. */
export type ExactOperationDispatcher = (
	request: ExactRequestLike,
	operation: ExactInvocationRequest,
	context: ExactServerContext
) => Promise<ExactOperationResult>;

/** Creates an NDJSON response for a single or batched eXact operation request. */
export function streamExactResponse(
	request: ExactRequestLike,
	input: ExactInvocationRequest | ExactBatchRequest,
	context: ExactServerContext,
	dispatch: ExactOperationDispatcher
): ExactResponseLike {
	const operations = input.type === 'batch' ? input.operations : [input];
	const operationAbort = new AbortController();
	const linked = linkAbortSignals(request.signal, operationAbort.signal);
	const streamRequest = { ...request, signal: linked.signal };
	const stream = createNdjsonStream(
		async (emit) => {
			await emit({ event: 'start', version: 1, operations: operations.length });
			if (input.type === 'batch') {
				await dispatchExactBatchStreaming(
					streamRequest,
					input.operations,
					context,
					dispatch,
					(index, result) => emitOperationStreamEvents(emit, index, result)
				);
			} else {
				const result = await dispatch(streamRequest, input, context);
				await emitOperationStreamEvents(emit, 0, result);
			}
			await emit({ event: 'complete', version: 1 });
		},
		linked.signal,
		(reason) => operationAbort.abort(reason),
		linked.dispose,
		{
			maxEvents: context.limits?.maxStreamEvents,
			maxBytes: context.limits?.maxStreamBytes
		}
	);
	return {
		status: 200,
		headers: {
			'content-type': 'application/x-ndjson; charset=utf-8',
			'cache-control': 'no-store'
		},
		body: '',
		stream
	};
}

/** Dispatches a batch and returns operation results in request order. */
export async function dispatchExactBatch(
	request: ExactRequestLike,
	operations: readonly ExactInvocationRequest[],
	context: ExactServerContext,
	dispatch: ExactOperationDispatcher
): Promise<ExactOperationResult[]> {
	const results: ExactOperationResult[] = new Array(operations.length);
	await dispatchReadyOperations(request, operations, context, dispatch, (index, result) => {
		results[index] = result;
	});
	return results;
}

/** Returns whether a request asks for eXact NDJSON streaming. */
export function wantsStreaming(request: ExactRequestLike): boolean {
	const accept = headerValue(request.headers, 'accept');
	const stream = headerValue(request.headers, 'x-exact-stream');
	return (
		stream === '1' ||
		Boolean(
			accept
				?.split(',')
				.some((value) => value.trim().toLowerCase().startsWith('application/x-ndjson'))
		)
	);
}

async function dispatchExactBatchStreaming(
	request: ExactRequestLike,
	operations: readonly ExactInvocationRequest[],
	context: ExactServerContext,
	dispatch: ExactOperationDispatcher,
	emitResult: (index: number, result: ExactOperationResult) => void | Promise<void>
): Promise<void> {
	await dispatchReadyOperations(request, operations, context, dispatch, emitResult);
}

async function dispatchReadyOperations(
	request: ExactRequestLike,
	operations: readonly ExactInvocationRequest[],
	context: ExactServerContext,
	dispatch: ExactOperationDispatcher,
	emitResult: (index: number, result: ExactOperationResult) => void | Promise<void>
): Promise<void> {
	const pending = new Set(operations.map((_operation, index) => index));
	const running = new Map<
		number,
		Promise<{ index: number; operation: ExactInvocationRequest; result: ExactOperationResult }>
	>();
	const successful = new Set<string>();
	const concurrency = positiveLimit(context.limits?.maxBatchConcurrency, 8);
	const batchAbort = new AbortController();
	const linked = linkAbortSignals(request.signal, batchAbort.signal);
	const ownedRequest = { ...request, signal: linked.signal };

	try {
		while (pending.size) {
			for (const index of pending) {
				if (running.size >= concurrency || linked.signal.aborted) break;
				if (running.has(index)) continue;
				const dependsOn = operations[index]!.dependsOn ?? [];
				if (!dependsOn.every((id) => successful.has(id))) continue;
				const operation = operations[index]!;
				running.set(
					index,
					dispatch(ownedRequest, operation, context).then((result) => ({
						index,
						operation,
						result
					}))
				);
			}

			if (!running.size) {
				if (linked.signal.aborted)
					throw linked.signal.reason ?? new DOMException('eXact batch aborted', 'AbortError');
				// Remaining operations are dependency-blocked. Fail them explicitly instead
				// of leaving the client waiting for results that can no longer run.
				for (const index of pending) {
					await emitResult(index, dependencyFailed(operations[index]!));
				}
				break;
			}

			let settled: {
				index: number;
				operation: ExactInvocationRequest;
				result: ExactOperationResult;
			};
			try {
				settled = await Promise.race(running.values());
			} catch (error) {
				batchAbort.abort(error);
				await Promise.allSettled(running.values());
				throw error;
			}
			const { index, operation, result } = settled;
			running.delete(index);
			pending.delete(index);
			if (result.ok && operation.opId) successful.add(operation.opId);
			await emitResult(index, result);
		}
	} finally {
		batchAbort.abort(new DOMException('eXact batch complete', 'AbortError'));
		await Promise.allSettled(running.values());
		linked.dispose();
	}
}

function positiveLimit(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

async function emitOperationStreamEvents(
	emit: (event: ExactStreamEvent) => Promise<void>,
	index: number,
	result: ExactOperationResult
): Promise<void> {
	if (!result.ok) {
		await emit({ event: 'result', version: 1, index, result });
		return;
	}
	for (const patch of result.patches ?? []) {
		await emit({
			event: 'patch',
			version: 1,
			index,
			type: result.type,
			id: result.id,
			...(result.opId === undefined ? {} : { opId: result.opId }),
			patch
		});
	}
	if ('state' in result) {
		await emit({
			event: 'state',
			version: 1,
			index,
			type: result.type,
			id: result.id,
			...(result.opId === undefined ? {} : { opId: result.opId }),
			value: result.state
		});
	}
	if (result.mutations?.length) {
		await emit({
			event: 'mutations',
			version: 1,
			index,
			type: result.type,
			id: result.id,
			...(result.opId === undefined ? {} : { opId: result.opId }),
			mutations: result.mutations
		});
	}
	if (result.html !== undefined) {
		await emit({
			event: 'html',
			version: 1,
			index,
			type: result.type,
			id: result.id,
			...(result.opId === undefined ? {} : { opId: result.opId }),
			html: result.html
		});
	}
	await emit({
		event: 'result',
		version: 1,
		index,
		result: {
			ok: true,
			type: result.type,
			id: result.id,
			...(result.opId === undefined ? {} : { opId: result.opId }),
			...('value' in result ? { value: result.value } : {})
		}
	});
}

function dependencyFailed(operation: ExactInvocationRequest): ExactOperationError {
	return {
		ok: false,
		type: operation.type,
		id: operation.id,
		opId: operation.opId,
		status: 424,
		error: 'dependency_failed'
	};
}

function createNdjsonStream(
	run: (emit: (event: ExactStreamEvent) => Promise<void>) => Promise<void> | void,
	signal?: AbortSignal,
	cancelRun?: (reason: unknown) => void,
	dispose?: () => void,
	limits: { maxEvents?: number; maxBytes?: number } = {}
): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	let active = true;
	let cleanup = () => {
		dispose?.();
	};
	let resume: (() => void) | undefined;
	let demand = 0;
	const maxEvents = positiveLimit(limits.maxEvents, 100_000);
	const maxBytes = positiveLimit(limits.maxBytes, 16 * 1024 * 1024);
	let events = 0;
	let bytes = 0;
	return new ReadableStream<Uint8Array>(
		{
			start(controller) {
				const emit = async (event: ExactStreamEvent): Promise<void> => {
					const chunk = encoder.encode(`${JSON.stringify(encodeReactiveProtocolValue(event))}\n`);
					if (++events > maxEvents) throw new Error('eXact stream event limit exceeded');
					bytes += chunk.byteLength;
					if (bytes > maxBytes) throw new Error('eXact stream byte limit exceeded');
					while (active && demand <= 0) {
						await new Promise<void>((resolve) => {
							resume = resolve;
						});
					}
					if (!active)
						throw signal?.reason ?? new DOMException('eXact stream cancelled', 'AbortError');
					demand--;
					controller.enqueue(chunk);
				};
				const abort = () => {
					if (!active) return;
					active = false;
					resume?.();
					resume = undefined;
					const reason = signal?.reason ?? new DOMException('eXact stream aborted', 'AbortError');
					cleanupWithPrimary(cleanup, reason);
					controller.error(reason);
				};
				cleanup = () => {
					signal?.removeEventListener('abort', abort);
					dispose?.();
				};
				if (signal?.aborted) {
					abort();
					return;
				}
				signal?.addEventListener('abort', abort, { once: true });
				Promise.resolve(run(emit)).then(
					() => {
						if (!active) return;
						active = false;
						try {
							cleanup();
							controller.close();
						} catch (cleanupError) {
							controller.error(cleanupError);
						}
					},
					(error) => {
						if (!active) return;
						active = false;
						cleanupWithPrimary(cleanup, error);
						controller.error(error);
					}
				);
			},
			pull() {
				demand++;
				const ready = resume;
				resume = undefined;
				ready?.();
			},
			cancel(reason) {
				if (!active) return;
				active = false;
				resume?.();
				resume = undefined;
				const failure = createCleanupFailure();
				attemptCleanup(failure, () => cancelRun?.(reason));
				attemptCleanup(failure, cleanup);
				throwCleanupFailure(failure);
			}
		},
		{ highWaterMark: 0 }
	);
}

function cleanupWithPrimary(cleanup: () => void, primary: unknown): void {
	try {
		cleanup();
	} catch (cleanupError) {
		attachSuppressedCleanupFailure(primary, cleanupError);
	}
}

function linkAbortSignals(...signals: Array<AbortSignal | undefined>): {
	signal: AbortSignal;
	dispose(): void;
} {
	const controller = new AbortController();
	const active = signals.filter((signal): signal is AbortSignal => !!signal);
	const listeners = new Map<AbortSignal, () => void>();
	for (const signal of active) {
		const abort = () => controller.abort(signal.reason);
		if (signal.aborted) {
			abort();
			break;
		}
		listeners.set(signal, abort);
		signal.addEventListener('abort', abort, { once: true });
	}
	return {
		signal: controller.signal,
		dispose() {
			for (const [signal, listener] of listeners) signal.removeEventListener('abort', listener);
			listeners.clear();
		}
	};
}

function headerValue(headers: ExactRequestLike['headers'], name: string): string | undefined {
	if (!headers) return undefined;
	if (typeof Headers !== 'undefined' && headers instanceof Headers) {
		return headers.get(name) ?? undefined;
	}
	const lower = name.toLowerCase();
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() !== lower) continue;
		return Array.isArray(value) ? value.join(',') : value;
	}
	return undefined;
}
