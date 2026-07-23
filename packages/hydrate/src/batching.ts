import { logFrameworkEvent, type Logger } from '@exactjs/core';
import { headersCacheKey } from './config.js';
import { invokeExact, invokeExactBatch } from './invocations.js';
import type {
	ExactBatchQueue,
	ExactInvocationRequest,
	ExactInvocationResult,
	ExactResponseMetadata,
	ExactStreamLimits,
	FetchLike
} from './types.js';

const batchQueues: ExactBatchQueue[] = [];

/** Queues an eXact operation for microtask batching by endpoint, transport, and headers. */
export function enqueueExactOperation(
	_container: Element,
	options: {
		endpoint: string;
		operation: ExactInvocationRequest;
		fetch?: FetchLike;
		headers?: Record<string, string>;
		logger?: Logger;
		stream?: boolean;
		streamLimits?: ExactStreamLimits;
		signal?: AbortSignal;
		onResponse?: (response: ExactResponseMetadata) => void;
	}
): Promise<ExactInvocationResult> {
	const headersKey = headersCacheKey(options.headers);
	let queue = batchQueues.find(
		(item) =>
			item.endpoint === options.endpoint &&
			item.fetch === options.fetch &&
			item.headersKey === headersKey &&
			item.logger === options.logger &&
			item.stream === options.stream &&
			item.streamLimits === options.streamLimits
	);
	if (!queue) {
		queue = {
			endpoint: options.endpoint,
			fetch: options.fetch,
			headers: options.headers,
			headersKey,
			logger: options.logger,
			stream: options.stream,
			streamLimits: options.streamLimits,
			pending: [],
			scheduled: false,
			active: 0
		};
		batchQueues.push(queue);
	}

	const promise = new Promise<ExactInvocationResult>((resolve, reject) => {
		queue!.pending.push({
			operation: options.operation,
			signal: options.signal,
			onResponse: options.onResponse,
			resolve,
			reject
		});
	});

	if (!queue.scheduled) {
		queue.scheduled = true;
		// Microtask batching groups operations triggered by the same user turn without
		// introducing a visible delay for isolated single operations.
		queueMicrotask(() => {
			void flushExactBatchQueue(queue!).finally(() => reclaimQueue(queue!));
		});
	}

	return promise;
}

async function flushExactBatchQueue(queue: ExactBatchQueue): Promise<void> {
	const pending = queue.pending.splice(0);
	queue.scheduled = false;
	if (!pending.length) return;
	const active = pending.filter((item) => {
		if (!item.signal?.aborted) return true;
		item.reject(abortReason(item.signal));
		return false;
	});
	if (!active.length) return;
	queue.active = (queue.active ?? 0) + 1;

	try {
		if (active.length === 1) {
			try {
				const result = await invokeExact({
					endpoint: queue.endpoint,
					...active[0]!.operation,
					fetch: queue.fetch,
					headers: queue.headers,
					logger: queue.logger,
					stream: queue.stream,
					streamLimits: queue.streamLimits,
					signal: active[0]!.signal,
					onResponse: active[0]!.onResponse
				});
				if (active[0]!.signal?.aborted) active[0]!.reject(abortReason(active[0]!.signal));
				else active[0]!.resolve(result);
			} catch (error) {
				active[0]!.reject(error);
			}
			return;
		}

		const combined = abortWhenAllAbort(active.map((item) => item.signal));
		try {
			const results = await invokeExactBatch({
				endpoint: queue.endpoint,
				operations: active.map((item) => item.operation),
				fetch: queue.fetch,
				headers: queue.headers,
				logger: queue.logger,
				stream: queue.stream,
				streamLimits: queue.streamLimits,
				signal: combined.signal,
				onResponse: (response) => {
					for (const item of active) item.onResponse?.(response);
				}
			});
			active.forEach((item, index) => {
				if (item.signal?.aborted) {
					item.reject(abortReason(item.signal));
					return;
				}
				const result = results[index];
				if (!result) {
					item.reject(new Error(`eXact ${item.operation.type} invocation failed`));
					return;
				}
				if (!result.ok) {
					logFrameworkEvent(
						'warn',
						'hydrate',
						'request',
						`exact ${item.operation.type} invocation failed with ${result.status}`,
						undefined,
						queue.logger
					);
					item.reject(new Error(`eXact ${item.operation.type} invocation failed`));
					return;
				}
				const { ok: _ok, type: _type, id: _id, ...body } = result;
				item.resolve(body);
			});
		} catch (error) {
			for (const item of active) item.reject(error);
		} finally {
			combined.dispose();
		}
	} finally {
		queue.active = Math.max(0, (queue.active ?? 1) - 1);
	}
}

function reclaimQueue(queue: ExactBatchQueue): void {
	if (queue.scheduled || queue.pending.length || queue.active) return;
	const index = batchQueues.indexOf(queue);
	if (index >= 0) batchQueues.splice(index, 1);
}

function abortWhenAllAbort(signals: readonly (AbortSignal | undefined)[]): {
	signal?: AbortSignal;
	dispose(): void;
} {
	const defined = signals.filter((signal): signal is AbortSignal => signal !== undefined);
	if (!defined.length) return { signal: undefined, dispose() {} };
	const controller = new AbortController();
	const abort = () => {
		if (defined.every((signal) => signal.aborted))
			controller.abort(defined.find((signal) => signal.reason !== undefined)?.reason);
	};
	for (const signal of defined) signal.addEventListener('abort', abort);
	abort();
	return {
		signal: controller.signal,
		dispose() {
			for (const signal of defined) signal.removeEventListener('abort', abort);
		}
	};
}

function abortReason(signal: AbortSignal): unknown {
	return signal.reason ?? new DOMException('eXact request aborted', 'AbortError');
}
