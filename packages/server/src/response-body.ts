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
	/** Claims the body as a lazily encoded Web stream. */
	toReadableStream(): ReadableStream<Uint8Array>;
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
	body: string
): ExactResponseWithBody {
	const source = new BufferedResponseBody(body);
	const response = {
		status,
		headers,
		body: ''
	} as ExactResponseWithBody;
	Object.defineProperty(response, exactResponseBody, { value: source });
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
	private body: string | undefined;
	private stream: ReadableStream<Uint8Array> | undefined;

	constructor(body: string) {
		this.body = body;
	}

	async writeTo(write: ExactResponseBodyWriter): Promise<void> {
		const body = this.claim();
		await write(body);
	}

	toReadableStream(): ReadableStream<Uint8Array> {
		if (this.stream) return this.stream;
		const body = this.claim();
		let emitted = false;
		this.stream = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					if (emitted) {
						controller.close();
						return;
					}
					emitted = true;
					controller.enqueue(utf8Encoder.encode(body));
				}
			},
			{ highWaterMark: 0 }
		);
		return this.stream;
	}

	async cancel(): Promise<void> {
		if (this.stream) {
			await this.stream.cancel();
			return;
		}
		this.body = undefined;
	}

	private claim(): string {
		if (this.body === undefined) throw new TypeError('eXact response body was already claimed');
		const body = this.body;
		this.body = undefined;
		return body;
	}
}
