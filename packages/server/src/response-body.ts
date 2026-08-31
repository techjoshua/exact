import { attachSuppressedCleanupFailure } from '@exactjs/core';
import type { ExactResponseLike } from './types.js';

const utf8Encoder = new TextEncoder();

/** Identifies an eXact-owned response body that an adapter can consume without a Web stream. */
export const exactResponseBody = Symbol.for('@exactjs/server/response-body');

/** Writes one buffered response chunk to a platform transport. */
export type ExactResponseBodyWriter = (chunk: string) => void | Promise<void>;

/** Produces settled response spans synchronously while request-owned values remain valid. */
export type ExactSynchronousResponseBodyProducer = (write: (chunk: string) => void) => void;

/** Releases ownership transferred from one request scope to its response body. */
export type ExactResponseBodyScopeRelease = (reason?: unknown) => Promise<void>;

/** Provides the single-consumer body operations shared by server renderers and adapters. */
export interface ExactResponseBody {
	/** Distinguishes retained chunks from a renderer that produces spans when the adapter claims it. */
	readonly kind: 'buffered' | 'produced';
	/** Claims and writes the body without encoding it into a Web stream first. */
	writeTo(write: ExactResponseBodyWriter): Promise<void>;
	/** Claims a synchronous producer without introducing an adapter-visible microtask. */
	writeSynchronously?(write: (chunk: string) => void): void | Promise<void>;
	/** Claims and joins the body for direct response consumers. */
	toText(): string;
	/** Claims the body as a lazily encoded Web stream. */
	toReadableStream(): ReadableStream<Uint8Array>;
	/** Claims the body as a platform-encoded Blob without joining buffered chunks. */
	toBlob(): Blob;
	/** Releases an unclaimed body without materializing it. */
	cancel(reason?: unknown): Promise<void>;
	/** Transfers request-scope cleanup to a body that must remain request-owned until consumption. */
	retainRequestScope?(release: ExactResponseBodyScopeRelease, signal?: AbortSignal): void;
}

/** Response shape carrying an adapter-consumable eXact body. */
export type ExactResponseWithBody = ExactResponseLike & {
	[exactResponseBody]: ExactResponseBody;
};

/** Creates a response whose buffered render is claimed only by the selected adapter path. */
export function createExactBufferedResponse(
	status: number,
	headers: Record<string, string>,
	body: string | readonly string[]
): ExactResponseWithBody {
	const source = new BufferedResponseBody(body);
	const response = {
		status,
		headers
	} as ExactResponseWithBody;
	Object.defineProperty(response, exactResponseBody, { value: source });
	Object.defineProperty(response, 'body', {
		enumerable: true,
		get: () => source.toText()
	});
	Object.defineProperty(response, 'stream', {
		enumerable: true,
		get: () => source.toReadableStream()
	});
	return response;
}

/** Creates a response whose synchronous renderer runs only after an adapter claims the body. */
export function createExactProducedResponse(
	status: number,
	headers: Record<string, string>,
	produce: ExactSynchronousResponseBodyProducer
): ExactResponseWithBody {
	const source = new ProducedResponseBody(produce);
	const response = {
		status,
		headers
	} as ExactResponseWithBody;
	Object.defineProperty(response, exactResponseBody, { value: source });
	Object.defineProperty(response, 'body', {
		enumerable: true,
		get: () => source.toText()
	});
	Object.defineProperty(response, 'stream', {
		enumerable: true,
		get: () => source.toReadableStream()
	});
	return response;
}

/** Returns an eXact-owned response body without observing a lazy stream getter. */
export function exactResponseBodyOf(response: ExactResponseLike): ExactResponseBody | undefined {
	return (response as Partial<ExactResponseWithBody>)[exactResponseBody];
}

class BufferedResponseBody implements ExactResponseBody {
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
		this.stream = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					if (chunks ? index >= chunks.length : index > 0) {
						controller.close();
						return;
					}
					const chunk = chunks ? chunks[index++]! : (body as string);
					if (!chunks) index++;
					controller.enqueue(utf8Encoder.encode(chunk));
				}
			},
			{ highWaterMark: 0 }
		);
		return this.stream;
	}

	toBlob(): Blob {
		const body = this.claim();
		return new Blob(typeof body === 'string' ? [body] : [...body]);
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

class ProducedResponseBody implements ExactResponseBody {
	readonly kind = 'produced';
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

	writeSynchronously(write: (chunk: string) => void): void | Promise<void> {
		const produce = this.claim();
		try {
			produce(write);
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

	toText(): string {
		this.assertNoRetainedScope('text');
		const produce = this.claim();
		let result = '';
		produce((chunk) => {
			result += chunk;
		});
		return result;
	}

	toReadableStream(): ReadableStream<Uint8Array> {
		const produce = this.claim();
		const encoder = new TextEncoder();
		return new ReadableStream<Uint8Array>({
			start: async (controller) => {
				try {
					produce((chunk) => controller.enqueue(encoder.encode(chunk)));
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

	toBlob(): Blob {
		this.assertNoRetainedScope('blob');
		const produce = this.claim();
		const chunks: string[] = [];
		produce((chunk) => chunks.push(chunk));
		return new Blob(chunks);
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

	private assertNoRetainedScope(target: string): void {
		if (this.release)
			throw new TypeError(
				`Request-owned eXact response body requires asynchronous ${target} consumption`
			);
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
