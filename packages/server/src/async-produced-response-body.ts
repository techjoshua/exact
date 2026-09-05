import { attachSuppressedCleanupFailure } from '@exactjs/core';
import type {
	ExactResponseBody,
	ExactResponseBodyScopeRelease,
	ExactResponseBodyWriter
} from './response-body.js';

const utf8Encoder = new TextEncoder();

/** Produces ordered response strings while honoring transport backpressure and cancellation. */
export type ExactAsyncResponseBodyProducer = (
	write: ExactResponseBodyWriter,
	signal: AbortSignal
) => Promise<void>;

/** Single-consumer asynchronous body used by scheduled and progressive renderers. */
export class AsyncProducedResponseBody implements ExactResponseBody {
	readonly kind = 'produced';
	private produce: ExactAsyncResponseBodyProducer | undefined;
	private readonly controller = new AbortController();
	private release: ExactResponseBodyScopeRelease | undefined;
	private signal: AbortSignal | undefined;
	private abort: (() => void) | undefined;
	private completion: Promise<void> | undefined;

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
		try {
			await produce(write, this.controller.signal);
		} catch (error) {
			failure = { error };
			throw error;
		} finally {
			await this.finish(failure ? failure.error : 'eXact produced response complete', failure);
		}
	}

	/** Rejects synchronous text access because production can await scheduled component work. */
	toText(): string {
		throw new TypeError('Asynchronous eXact response bodies require asynchronous consumption');
	}

	/** Exposes a demand-driven UTF-8 stream for Fetch-compatible response environments. */
	toReadableStream(): ReadableStream<Uint8Array> {
		const produce = this.claim();
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
		return new ReadableStream<Uint8Array>(
			{
				start: (controller) => {
					streamController = controller;
				},
				pull: () => {
					demand++;
					wake();
					if (started) return;
					started = true;
					const write = async (chunk: string): Promise<void> => {
						while (!closed && !this.controller.signal.aborted && demand <= 0)
							await new Promise<void>((resolve) => {
								resume = resolve;
							});
						if (closed || this.controller.signal.aborted)
							throw (
								this.controller.signal.reason ??
								new DOMException('eXact response body aborted', 'AbortError')
							);
						demand--;
						streamController!.enqueue(utf8Encoder.encode(chunk));
					};
					void (async () => {
						try {
							await produce(write, this.controller.signal);
							if (closed) return;
							await this.finish('eXact produced response stream complete');
							closed = true;
							streamController!.close();
						} catch (error) {
							if (closed) return;
							closed = true;
							try {
								await this.finish(error, { error });
							} catch (cleanup) {
								attachSuppressedCleanupFailure(error, cleanup);
							}
							streamController!.error(error);
						}
					})();
				},
				cancel: async (reason) => {
					closed = true;
					wake();
					this.controller.abort(reason);
					await this.finish(reason ?? 'eXact produced response cancelled');
				}
			},
			{ highWaterMark: 0 }
		);
	}

	/** Rejects synchronous blob access because production can await scheduled component work. */
	toBlob(): Blob {
		throw new TypeError('Asynchronous eXact response bodies require stream consumption');
	}

	/** Aborts pending production and releases retained request-owned resources. */
	async cancel(reason?: unknown): Promise<void> {
		this.produce = undefined;
		this.controller.abort(reason);
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
