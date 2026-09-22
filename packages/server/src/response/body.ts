import { attachSuppressedCleanupFailure } from '@exactjs/core';
import type { ExactResponseLike, ExactResponseMetadata } from '../types.js';
import {
	AsyncProducedResponseBody,
	type ExactAsyncResponseBodyProducer
} from './async-produced-body.js';

export type { ExactAsyncResponseBodyProducer } from './async-produced-body.js';

import { createResponseEncoder } from './encoding.js';

/** Writes one buffered response chunk to a platform transport. */
export type ExactResponseBodyWriter = (chunk: string) => void | Promise<void>;

/** Immutable encoding and output-metadata capabilities supplied by a synchronous response adapter. */
export type ExactSynchronousResponseEnvironment = Readonly<{
	/** Returns the exact UTF-8 byte length without materializing encoded output. */
	encodedByteLength?: (value: string) => number;
	/**
	 * Publishes the exact UTF-8 size of the complete body after its final write. The producer must
	 * include every span and account for cross-span surrogate pairs. Call only during production.
	 */
	setBodyByteLength?: (bytes: number) => void;
}>;

/** Produces settled response spans synchronously while request-owned values remain valid. */
export type ExactSynchronousResponseBodyProducer = (
	write: (chunk: string) => void,
	environment?: ExactSynchronousResponseEnvironment
) => void;

/** Releases ownership transferred from one request scope to its response body. */
export type ExactResponseBodyScopeRelease = (reason?: unknown) => Promise<void>;

/** Adapter-selected byte queue budget; zero keeps strict consumer-driven production. */
export type ExactResponseStreamOptions = Readonly<{ highWaterMarkBytes?: number }>;

/** Common single-consumer operations; synchronous collection is not advertised for producers. */
export interface ExactResponseBodyOperations {
	/** Claims and writes the body directly to an adapter, honoring asynchronous writes. */
	writeTo(write: ExactResponseBodyWriter): Promise<void>;
	/** Claims the body as a lazily encoded Web stream. */
	toReadableStream(options?: ExactResponseStreamOptions): ReadableStream<Uint8Array>;
	/** Releases an unclaimed body or cancels active production. */
	cancel(reason?: unknown): Promise<void>;
	/** Retains request resources until consumption or cancellation settles. */
	retainRequestScope?(release: ExactResponseBodyScopeRelease, signal?: AbortSignal): void;
}

/** Buffered text can be collected synchronously without running a renderer. */
export interface ExactBufferedResponseBody extends ExactResponseBodyOperations {
	readonly kind: 'buffered';
	/** Claims and joins retained chunks; repeated text reads return the same value. */
	toText(): string;
	/** Claims retained chunks for platform encoding without joining them. */
	toBlob(): Blob;
}

/** Synchronous production can publish byte metadata, but cleanup may still complete asynchronously. */
export interface ExactProducedResponseBody extends ExactResponseBodyOperations {
	readonly kind: 'synchronous';
	/** Claims the producer and settles any transferred request scope after production. */
	writeSynchronously(
		write: (chunk: string) => void,
		environment?: ExactSynchronousResponseEnvironment
	): void | Promise<void>;
}

/** Scheduled production is consumed only through an asynchronous writer or stream. */
export interface ExactAsyncProducedResponseBody extends ExactResponseBodyOperations {
	readonly kind: 'asynchronous';
	/** Cancellation lifetime observed by adapters while transport writes are blocked. */
	readonly signal: AbortSignal;
}

/** Explicit consumption capabilities of a single owned response body. */
export type ExactResponseBody =
	| ExactBufferedResponseBody
	| ExactProducedResponseBody
	| ExactAsyncProducedResponseBody;

/** An owned response exposes its body directly without lazy string or stream aliases. */
export type ExactResponseWithBody<Body extends ExactResponseBody = ExactResponseBody> =
	ExactResponseMetadata & {
		body: Body;
		stream?: never;
	};

/** Creates a response whose buffered render is claimed only by the selected adapter path. */
export function createExactBufferedResponse(
	status: number,
	headers: Record<string, string>,
	body: string | readonly string[]
): ExactResponseWithBody<ExactBufferedResponseBody> {
	return { status, headers, body: new BufferedResponseBody(body) };
}

/** Creates a response whose synchronous renderer runs only after an adapter claims the body. */
export function createExactProducedResponse(
	status: number,
	headers: Record<string, string>,
	produce: ExactSynchronousResponseBodyProducer
): ExactResponseWithBody<ExactProducedResponseBody> {
	return { status, headers, body: new ProducedResponseBody(produce) };
}

/** Creates a response whose scheduled producer awaits transport backpressure. */
export function createExactAsyncProducedResponse(
	status: number,
	headers: Record<string, string>,
	produce: ExactAsyncResponseBodyProducer
): ExactResponseWithBody<ExactAsyncProducedResponseBody> {
	return { status, headers, body: new AsyncProducedResponseBody(produce) };
}

/** Reads explicit body capabilities without claiming or materializing the response. */
export function exactResponseBodyOf<Body extends ExactResponseBody>(
	response: ExactResponseWithBody<Body>
): Body;
export function exactResponseBodyOf(response: ExactResponseLike): ExactResponseBody | undefined;
export function exactResponseBodyOf(response: ExactResponseLike): ExactResponseBody | undefined {
	return typeof response.body === 'object' ? response.body : undefined;
}

class BufferedResponseBody implements ExactBufferedResponseBody {
	readonly kind = 'buffered';
	private body: string | readonly string[] | undefined;
	private text: string | undefined;
	private stream: ReadableStream<Uint8Array> | undefined;

	constructor(body: string | readonly string[]) {
		this.body = body;
	}

	async writeTo(write: ExactResponseBodyWriter): Promise<void> {
		const body = this.claim();
		if (typeof body === 'string') {
			const pending = write(body);
			if (pending) await pending;
			return;
		}
		for (const chunk of body) {
			const pending = write(chunk);
			if (pending) await pending;
		}
	}

	toText(): string {
		if (this.text !== undefined) return this.text;
		const body = this.claim();
		this.text = typeof body === 'string' ? body : body.join('');
		return this.text;
	}

	toReadableStream(): ReadableStream<Uint8Array> {
		if (this.stream) return this.stream;
		const body = this.claim();
		const chunks = typeof body === 'string' ? undefined : body;
		let index = 0;
		const encoder = createResponseEncoder();
		this.stream = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					while (chunks ? index < chunks.length : index === 0) {
						const chunk = chunks ? chunks[index++]! : (body as string);
						if (!chunks) index++;
						const bytes = encoder.encode(chunk);
						if (bytes.length) {
							controller.enqueue(bytes);
							return;
						}
					}
					const tail = encoder.finish();
					if (tail.length) controller.enqueue(tail);
					controller.close();
				}
			},
			{ highWaterMark: 0 }
		);
		return this.stream;
	}

	toBlob(): Blob {
		const body = this.claim();
		if (typeof body === 'string') return new Blob([body]);
		const encoder = createResponseEncoder();
		const parts = body.map((chunk) => encoder.encode(chunk));
		parts.push(encoder.finish());
		return new Blob(parts);
	}

	async cancel(): Promise<void> {
		if (this.stream) {
			await this.stream.cancel();
			return;
		}
		this.body = undefined;
	}

	private claim(): string | readonly string[] {
		if (this.body === undefined) throw new TypeError('eXact response body was already claimed');
		const body = this.body;
		this.body = undefined;
		return body;
	}
}

class ProducedResponseBody implements ExactProducedResponseBody {
	readonly kind = 'synchronous';
	private produce: ExactSynchronousResponseBodyProducer | undefined;
	private release: ExactResponseBodyScopeRelease | undefined;
	private signal: AbortSignal | undefined;
	private abort: (() => void) | undefined;
	private completion: Promise<void> | undefined;

	constructor(produce: ExactSynchronousResponseBodyProducer) {
		this.produce = produce;
	}

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

	async writeTo(write: ExactResponseBodyWriter): Promise<void> {
		const produce = this.claim();
		let pending: Promise<void> | undefined;
		let failure: { error: unknown } | undefined;
		try {
			produce((chunk) => {
				if (pending) {
					pending = pending.then(() => write(chunk));
					return;
				}
				const result = write(chunk);
				if (result) pending = Promise.resolve(result);
			});
			if (pending) await pending;
		} catch (error) {
			failure = { error };
			throw error;
		} finally {
			await this.finish(failure ? failure.error : 'eXact produced response complete', failure);
		}
	}

	writeSynchronously(
		write: (chunk: string) => void,
		environment?: ExactSynchronousResponseEnvironment
	): void | Promise<void> {
		const produce = this.claim();
		try {
			produce(write, environment);
		} catch (error) {
			const failure = { error };
			const completion = this.finish(error, failure);
			if (completion)
				return completion.then(() => {
					throw error;
				});
			throw error;
		}
		return this.finish('eXact produced response complete');
	}

	toReadableStream(): ReadableStream<Uint8Array> {
		const produce = this.claim();
		const encoder = createResponseEncoder();
		return new ReadableStream<Uint8Array>({
			start: async (controller) => {
				try {
					produce((chunk) => {
						const bytes = encoder.encode(chunk);
						if (bytes.length) controller.enqueue(bytes);
					});
					const tail = encoder.finish();
					if (tail.length) controller.enqueue(tail);
					await this.finish('eXact produced response stream complete');
					controller.close();
				} catch (error) {
					await this.finish(error, { error });
					controller.error(error);
				}
			},
			cancel: (reason) => this.finish(reason)
		});
	}

	async cancel(reason?: unknown): Promise<void> {
		this.produce = undefined;
		await this.finish(reason ?? 'eXact produced response cancelled');
	}

	private claim(): ExactSynchronousResponseBodyProducer {
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
