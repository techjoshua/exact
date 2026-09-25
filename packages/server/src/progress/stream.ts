import { encodeReactiveProtocolValue, attachSuppressedCleanupFailure } from '@exactjs/core';
import { normalizeProtocolLimit } from '@exactjs/core/framework/protocol-records';
import type { ExactStreamEvent } from '../types.js';

/** Operation-scoped snapshot event emitted only to a client which requested progress support. */
export type ExactProgressEvent = Extract<ExactStreamEvent, { event: 'progress' }>;

/** Ordered terminal output and replaceable progress share a single backpressured writer. */
export interface ExactProgressStreamWriter {
	emit(event: ExactStreamEvent): Promise<void>;
	report(event: ExactProgressEvent): void;
	finishProgress(index: number): void;
}

/**
 * Creates a demand-driven response. Progress stays replaceable until a reader requests bytes;
 * ordinary events take precedence. Cancellation releases a blocked producer and aborts its work.
 */
export function createProgressStream(
	run: (writer: ExactProgressStreamWriter) => Promise<void>,
	options: {
		signal: AbortSignal;
		cancel(reason: unknown): void;
		dispose(): void;
		maxEvents?: number;
		maxBytes?: number;
	}
): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	const progress = new Map<number, Map<string, ExactProgressEvent>>();
	const maxEvents = normalizeProtocolLimit(options.maxEvents, 100_000);
	const maxBytes = normalizeProtocolLimit(options.maxBytes, 16 * 1024 * 1024);
	let events = 0;
	let bytes = 0;
	let active = true;
	let demand = false;
	let pending:
		| { event: ExactStreamEvent; resolve(): void; reject(error: unknown): void }
		| undefined;
	let controller: ReadableStreamDefaultController<Uint8Array>;
	const cleanup = () => {
		progress.clear();
		options.signal.removeEventListener('abort', abort);
		options.dispose();
	};
	const fail = (reason: unknown, cancelled = false) => {
		if (!active) return;
		active = false;
		pending?.reject(reason);
		pending = undefined;
		try {
			options.cancel(reason);
		} catch (error) {
			attachSuppressedCleanupFailure(reason, error);
		}
		try {
			cleanup();
		} catch (error) {
			attachSuppressedCleanupFailure(reason, error);
		}
		if (!cancelled) controller.error(reason);
	};
	const abort = () =>
		fail(options.signal.reason ?? new DOMException('Stream aborted', 'AbortError'));
	const pump = () => {
		if (!active || !demand) return;
		const next = pending;
		let event = next?.event;
		if (!event) {
			const first = progress.entries().next().value;
			if (!first) return;
			const [index, snapshots] = first;
			const [receiver, snapshot] = snapshots.entries().next().value!;
			event = snapshot;
			snapshots.delete(receiver);
			if (!snapshots.size) progress.delete(index);
		}
		try {
			const chunk = encoder.encode(`${JSON.stringify(encodeReactiveProtocolValue(event))}\n`);
			if (
				event.event === 'progress' &&
				(events + 1 > maxEvents / 2 || bytes + chunk.byteLength > maxBytes / 2)
			) {
				progress.clear();
				return;
			}
			if (events + 1 > maxEvents || bytes + chunk.byteLength > maxBytes) {
				if (event.event === 'observations' || event.event === 'progress') {
					if (next) {
						pending = undefined;
						next.resolve();
					}
					return;
				}
				throw new Error(
					events + 1 > maxEvents
						? 'eXact stream event limit exceeded'
						: 'eXact stream byte limit exceeded'
				);
			}
			events++;
			bytes += chunk.byteLength;
			demand = false;
			controller.enqueue(chunk);
			if (next) {
				pending = undefined;
				next.resolve();
			}
		} catch (error) {
			fail(error);
		}
	};
	return new ReadableStream<Uint8Array>(
		{
			start(target) {
				controller = target;
				if (options.signal.aborted) {
					abort();
					return;
				}
				options.signal.addEventListener('abort', abort, { once: true });
				const writer: ExactProgressStreamWriter = {
					emit(event) {
						if (!active)
							return Promise.reject(
								options.signal.reason ?? new DOMException('Stream closed', 'AbortError')
							);
						if (pending)
							return Promise.reject(new Error('Concurrent ordinary stream writes are unsupported'));
						return new Promise<void>((resolve, reject) => {
							pending = { event, resolve, reject };
							pump();
						});
					},
					report(event) {
						if (!active) return;
						let snapshots = progress.get(event.index);
						if (!snapshots) progress.set(event.index, (snapshots = new Map()));
						snapshots.set(event.receiver, event);
						pump();
					},
					finishProgress(index) {
						progress.delete(index);
					}
				};
				void Promise.resolve()
					.then(() => run(writer))
					.then(
						() => {
							if (!active) return;
							active = false;
							try {
								cleanup();
								controller.close();
							} catch (error) {
								controller.error(error);
							}
						},
						(error: unknown) => fail(error)
					);
			},
			pull() {
				demand = true;
				pump();
			},
			cancel(reason) {
				fail(reason, true);
			}
		},
		{ highWaterMark: 0 }
	);
}
