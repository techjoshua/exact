import { expect, it } from 'vitest';
import { readNdjsonEvents } from './ndjson.js';

it('observes cancellation when the source errors before the abort listener cancels its reader', async () => {
	const abort = new AbortController();
	const reason = new Error('superseded');
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			abort.signal.addEventListener('abort', () => controller.error(reason), { once: true });
		}
	});
	const reading = readNdjsonEvents(stream, 'invalid stream', () => {}, { signal: abort.signal });
	const rejected = expect(reading).rejects.toBe(reason);
	abort.abort(reason);
	await rejected;
	// Let any unobserved promise returned by reader.cancel surface in the runner.
	await new Promise((resolve) => setTimeout(resolve, 0));
});
