import { type ResponseLimits } from './json.js';
import { responseResourceBudget } from '../response-resources.js';

export { positiveLimit } from '../limits.js';

/** Delivers parsed stream events in order and stops delivery when the invocation is cancelled. */
export async function readNdjsonEvents(
	stream: ReadableStream<Uint8Array>,
	message: string,
	receive: (event: unknown) => void,
	options: { signal?: AbortSignal; maxEvents?: number } & ResponseLimits
): Promise<void> {
	const reader = stream.getReader();
	const decoder = new TextDecoder('utf-8', { fatal: true });
	const signal = options.signal;
	const resources = options.resources ?? responseResourceBudget(options.logger);
	let buffer = '';
	let bytes = 0;
	let events = 0;
	const abort = () => {
		// The transport may have errored this stream first in response to the same signal.
		// The read loop owns the primary failure. Observe the cancellation promise as well.
		void reader.cancel(signal?.reason).catch(() => undefined);
	};
	if (signal?.aborted) abort();
	else signal?.addEventListener('abort', abort, { once: true });
	try {
		while (true) {
			if (signal?.aborted) throw signal.reason;
			const next = await reader.read();
			if (signal?.aborted) throw signal.reason;
			if (next.done) break;
			bytes += next.value.byteLength;
			resources(
				'maxBytes',
				options.maxBytes,
				16 * 1024 * 1024,
				bytes,
				'NDJSON response',
				'encoded UTF-8 bytes'
			);
			buffer += decodeNdjsonText(decoder, next.value, message, true);
			let newline: number;
			while ((newline = buffer.indexOf('\n')) >= 0) {
				// A delivered event can cancel its owner before the next buffered event.
				if (signal?.aborted) throw signal.reason;
				const line = buffer.slice(0, newline).replace(/\r$/, '');
				buffer = buffer.slice(newline + 1);
				if (!line.trim()) continue;
				resources('maxEvents', options.maxEvents, 100_000, ++events, 'NDJSON response', 'events');
				receive(parseNdjsonLine(line, message));
			}
		}
		buffer += decodeNdjsonText(decoder, undefined, message, false);
		if (buffer.trim()) {
			resources('maxEvents', options.maxEvents, 100_000, ++events, 'NDJSON response', 'events');
			receive(parseNdjsonLine(buffer.replace(/\r$/, ''), message));
		}
		if (signal?.aborted) throw signal.reason;
	} catch (error) {
		const failure = signal?.aborted ? signal.reason : error;
		try {
			await reader.cancel(failure);
		} catch {
			/* preserve the primary failure */
		}
		throw failure;
	} finally {
		signal?.removeEventListener('abort', abort);
		reader.releaseLock();
	}
}

/** Only decoding failures represent invalid UTF-8, receiver and transport failures keep their identity. */
function decodeNdjsonText(
	decoder: TextDecoder,
	bytes: Uint8Array | undefined,
	message: string,
	stream: boolean
): string {
	try {
		return decoder.decode(bytes, { stream });
	} catch {
		throw new Error(message);
	}
}

/** Reads a ndjson line from its source representation. */
export function parseNdjsonLine(line: string, message: string): unknown {
	try {
		return JSON.parse(line);
	} catch {
		throw new Error(message);
	}
}

export { isAbortSignal } from '@exactjs/core/framework/async-values';
