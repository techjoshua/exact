import type { ExactResponseLike } from './types.js';

const utf8Encoder = new TextEncoder();

/** Identifies an eXact-owned response body that an adapter can consume without a Web stream. */
export const exactResponseBody = Symbol.for('@exactjs/server/response-body');

/** Writes one buffered response chunk to a platform transport. */
export type ExactResponseBodyWriter = (chunk: string) => void | Promise<void>;

/** Provides the single-consumer body operations shared by server renderers and adapters. */
export interface ExactResponseBody {
	/** Claims and writes the body without encoding it into a Web stream first. */
	writeTo(write: ExactResponseBodyWriter): Promise<void>;
	/** Claims and joins the body for direct response consumers. */
	toText(): string;
	/** Claims the body as a lazily encoded Web stream. */
	toReadableStream(): ReadableStream<Uint8Array>;
	/** Claims the body as a platform-encoded Blob without joining buffered chunks. */
	toBlob(): Blob;
	/** Releases an unclaimed body without materializing it. */
	cancel(reason?: unknown): Promise<void>;
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

/** Returns an eXact-owned response body without observing a lazy stream getter. */
export function exactResponseBodyOf(response: ExactResponseLike): ExactResponseBody | undefined {
	return (response as Partial<ExactResponseWithBody>)[exactResponseBody];
}

class BufferedResponseBody implements ExactResponseBody {
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
