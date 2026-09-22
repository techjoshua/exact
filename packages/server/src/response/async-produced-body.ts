import { attachSuppressedCleanupFailure } from '@exactjs/core';
import type {
	ExactAsyncProducedResponseBody,
	ExactResponseStreamOptions,
	ExactResponseBodyScopeRelease,
	ExactResponseBodyWriter
} from './body.js';

import { createResponseEncoder } from './encoding.js';

/** Produces ordered response strings while honoring transport backpressure and cancellation. */
export type ExactAsyncResponseBodyProducer = (
	write: ExactResponseBodyWriter,
	signal: AbortSignal
) => Promise<void>;

/** Single-consumer asynchronous body used by scheduled and progressive renderers. */
export class AsyncProducedResponseBody implements ExactAsyncProducedResponseBody {
	readonly kind = 'asynchronous';
	private produce: ExactAsyncResponseBodyProducer | undefined;
	private readonly controller = new AbortController();
	private release: ExactResponseBodyScopeRelease | undefined;
	private signal: AbortSignal | undefined;
	private abort: (() => void) | undefined;
	private completion: Promise<void> | undefined;
	private production: Promise<void> | undefined;
	private starting = false;

	constructor(produce: ExactAsyncResponseBodyProducer) {
		this.produce = produce;
	}

	/** Retains request-owned resources until consumption, cancellation, or failure completes. */
	retainRequestScope(release: ExactResponseBodyScopeRelease, signal?: AbortSignal): void {
		if (this.release) throw new TypeError('eXact response body already owns a request scope');
		this.release = release;
		this.signal = signal;
		this.abort = () => {
			const reason =
				signal?.reason ?? new DOMException('eXact response body aborted', 'AbortError');
			void this.cancel(reason).catch((cleanup) => attachSuppressedCleanupFailure(reason, cleanup));
		};
		if (signal?.aborted) this.abort();
		else signal?.addEventListener('abort', this.abort, { once: true });
	}

	/** Produces ordered string spans into an asynchronous transport writer exactly once. */
	async writeTo(write: ExactResponseBodyWriter): Promise<void> {
		const produce = this.claim();
		let failure: { error: unknown } | undefined;
		this.starting = true;
		try {
			this.production = produce(write, this.controller.signal);
			this.starting = false;
			await this.production;
		} catch (error) {
			failure = { error };
			throw error;
		} finally {
			this.starting = false;
			const completion = this.finish(
				failure
					? failure.error
					: (this.controller.signal.reason ?? 'eXact produced response complete'),
				failure
			);
			if (completion) await completion;
		}
	}

	/** Exposes a demand-driven UTF-8 stream for Fetch-compatible response environments. */
	toReadableStream(options: ExactResponseStreamOptions = {}): ReadableStream<Uint8Array> {
		const highWaterMark = options.highWaterMarkBytes ?? 0;
		if (!Number.isSafeInteger(highWaterMark) || highWaterMark < 0)
			throw new RangeError('Response stream byte budget must be a nonnegative safe integer');
		const produce = this.claim();
		const encoder = createResponseEncoder();
		let demand = 0;
		let resume: (() => void) | undefined;
		let closed = false;
		let started = false;
		let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
		const wake = () => {
			const ready = resume;
			resume = undefined;
			ready?.();
		};
		this.controller.signal.addEventListener('abort', wake, { once: true });
		return new ReadableStream<Uint8Array>(
			{
				start: (controller) => {
					streamController = controller;
				},
				pull: () => {
					if (this.controller.signal.aborted) {
						streamController!.error(this.controller.signal.reason);
						return;
					}
					if (highWaterMark === 0) demand++;
					wake();
					if (started) return;
					started = true;
					const writeBytes = (bytes: Uint8Array): void | Promise<void> => {
						if (closed || this.controller.signal.aborted)
							throw (
								this.controller.signal.reason ??
								new DOMException('eXact response body aborted', 'AbortError')
							);
						if (demand > 0 || (streamController!.desiredSize ?? 0) > 0) {
							if (demand > 0) demand--;
							streamController!.enqueue(bytes);
							return;
						}
						return new Promise<void>((resolve, reject) => {
							resume = () => {
								try {
									resolve(writeBytes(bytes));
								} catch (error) {
									reject(error);
								}
							};
						});
					};
					const write: ExactResponseBodyWriter = (chunk) => {
						const bytes = encoder.encode(chunk);
						if (bytes.length) return writeBytes(bytes);
					};
					this.starting = true;
					this.production = (async () => {
						try {
							await produce(write, this.controller.signal);
							const tail = encoder.finish();
							if (tail.length) await writeBytes(tail);
							if (closed) return;
							const completion = this.finish('eXact produced response stream complete');
							if (completion) await completion;
							closed = true;
							streamController!.close();
							this.controller.signal.removeEventListener('abort', wake);
						} catch (error) {
							if (closed) return;
							closed = true;
							try {
								await this.finish(error, { error });
							} catch (cleanup) {
								attachSuppressedCleanupFailure(error, cleanup);
							}
							streamController!.error(error);
							this.controller.signal.removeEventListener('abort', wake);
						}
					})();
					this.starting = false;
				},
				cancel: async (reason) => {
					closed = true;
					await this.cancel(reason);
				}
			},
			{ highWaterMark, size: (chunk) => chunk.byteLength }
		);
	}

	/** Aborts pending production and releases retained request-owned resources. */
	async cancel(reason?: unknown): Promise<void> {
		this.produce = undefined;
		this.controller.abort(reason);
		// A producer may synchronously abort its request before returning its promise. Wait until
		// that call has returned before releasing resources it may still be using while unwinding.
		if (this.starting) await Promise.resolve();
		await this.production?.catch(() => undefined);
		await this.finish(reason ?? 'eXact produced response cancelled');
	}

	private claim(): ExactAsyncResponseBodyProducer {
		if (!this.produce) throw new TypeError('eXact response body was already claimed');
		const produce = this.produce;
		this.produce = undefined;
		return produce;
	}

	private finish(reason: unknown, failure?: { error: unknown }): Promise<void> | undefined {
		if (this.completion) return this.completion;
		const release = this.release;
		this.release = undefined;
		if (this.abort) this.signal?.removeEventListener('abort', this.abort);
		this.abort = undefined;
		this.signal = undefined;
		if (!release) return undefined;
		this.completion = release(reason).catch((cleanup) => {
			if (failure) {
				attachSuppressedCleanupFailure(failure.error, cleanup);
				return;
			}
			throw cleanup;
		});
		return this.completion;
	}
}
