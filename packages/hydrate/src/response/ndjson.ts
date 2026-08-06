import { type ResponseLimits } from './json.js';
import { positiveLimit } from '../limits.js';

export { positiveLimit } from '../limits.js';

/** Reads a ndjson events from its source representation. */
export async function readNdjsonEvents(
	stream: ReadableStream<Uint8Array>,
	message: string,
	receive: (event: unknown) => void,
	options: { signal?: AbortSignal; maxEvents?: number } & ResponseLimits
): Promise<void> {
	const reader = stream.getReader();
	const decoder = new TextDecoder('utf-8', { fatal: true });
	const signal = options.signal;
	const maxBytes = positiveLimit(options.maxBytes, 16 * 1024 * 1024);
	const maxEvents = positiveLimit(options.maxEvents, 100_000);
	let buffer = '';
	let bytes = 0;
	let events = 0;
	const abort = () => {
		void reader.cancel(signal?.reason);
	};
	if (signal?.aborted) abort();
	else signal?.addEventListener('abort', abort, { once: true });
	try {
		while (true) {
			if (signal?.aborted)
				throw signal.reason ?? new DOMException('eXact request aborted', 'AbortError');
			const next = await reader.read();
			if (signal?.aborted)
				throw signal.reason ?? new DOMException('eXact request aborted', 'AbortError');
			if (next.done) break;
			bytes += next.value.byteLength;
			if (bytes > maxBytes) throw new Error('eXact stream response exceeded maxBytes');
			buffer += decoder.decode(next.value, { stream: true });
			let newline: number;
			while ((newline = buffer.indexOf('\n')) >= 0) {
				const line = buffer.slice(0, newline).replace(/\r$/, '');
				buffer = buffer.slice(newline + 1);
				if (!line.trim()) continue;
				if (++events > maxEvents) throw new Error('eXact stream response exceeded maxEvents');
				receive(parseNdjsonLine(line, message));
			}
		}
		buffer += decoder.decode();
		if (buffer.trim()) {
			if (++events > maxEvents) throw new Error('eXact stream response exceeded maxEvents');
			receive(parseNdjsonLine(buffer.replace(/\r$/, ''), message));
		}
	} catch (error) {
		const failure = error instanceof TypeError ? new Error(message) : error;
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

/** Reads a ndjson line from its source representation. */
export function parseNdjsonLine(line: string, message: string): unknown {
	try {
		return JSON.parse(line);
	} catch {
		throw new Error(message);
	}
}

export { isAbortSignal } from '@exactjs/core/framework/async-values';
