import type { ExactAsyncProducedResponseBody } from '@exactjs/server';
import { createResponseEncoder } from '@exactjs/server/framework/response-encoding';

/**
 * Lets Bun drain a bounded batch of produced bytes without suspending every rendered span.
 * The body owns production and request cleanup; this adapter owns native stream demand.
 */
export function createBunProducedStream(
	body: ExactAsyncProducedResponseBody
): ReadableStream<Uint8Array> {
	const encoder = createResponseEncoder();
	const signal = body.signal;
	let closed = false;
	let resume: (() => void) | undefined;
	let controller: ReadableStreamDefaultController<Uint8Array>;
	const wake = () => {
		const ready = resume;
		resume = undefined;
		ready?.();
	};
	const abort = () => {
		wake();
		if (closed) return;
		closed = true;
		controller.error(signal.reason);
	};
	return new ReadableStream<Uint8Array>(
		{
			start(streamController) {
				controller = streamController;
				const waitForDemand = (): void | Promise<void> => {
					if (closed || signal.aborted)
						throw signal.reason ?? new DOMException('Bun response cancelled', 'AbortError');
					if ((controller.desiredSize ?? 0) > 0) return;
					return new Promise<void>((resolve) => {
						resume = resolve;
					}).then(waitForDemand);
				};
				const writeBytes = (bytes: Uint8Array): void | Promise<void> => {
					const ready = waitForDemand();
					if (ready)
						return ready.then(() => {
							controller.enqueue(bytes);
						});
					controller.enqueue(bytes);
				};
				signal.addEventListener('abort', abort, { once: true });
				const complete = () => {
					signal.removeEventListener('abort', abort);
					if (closed) return;
					closed = true;
					controller.close();
				};
				// Match the native progressive lane: publish the stream before starting its renderer.
				void Promise.resolve()
					.then(() => {
						if (closed) return;
						return body.writeTo((chunk) => {
							const bytes = encoder.encode(chunk);
							if (bytes.length) return writeBytes(bytes);
						});
					})
					.then(() => {
						if (closed) {
							complete();
							return;
						}
						const tail = encoder.finish();
						const pending = tail.length ? writeBytes(tail) : undefined;
						if (pending) return pending.then(complete);
						complete();
					})
					.catch((error) => {
						signal.removeEventListener('abort', abort);
						if (closed) return;
						closed = true;
						controller.error(error);
					});
			},
			pull: wake,
			async cancel(reason) {
				closed = true;
				wake();
				await body.cancel(reason);
			}
		},
		{ highWaterMark: 32 * 1024, size: (chunk) => chunk.byteLength }
	);
}
