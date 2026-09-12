import { inheritRequestRenderScheduler } from '@exactjs/server/framework/render-scheduling';
import { publishExactProfile } from '@exactjs/instrumentation';
import { positiveLimit } from '../stream/protocol.js';
import type { Child, RenderToStringOptions, RenderToStringResult } from '../types.js';
import { htmlChunksOf } from './output-buffer.js';
import { renderStringOutput } from './render-output.js';
import { encodeSsrUtf8 } from './utf8-encoding.js';

/**
 * Lazily publishes the shared renderer's output under consumer backpressure.
 * Cancellation reaches pending task work and waits for its render-owned cleanup.
 */
export function renderToStream(
	operation: Child,
	options: RenderToStringOptions = {}
): ReadableStream<Uint8Array> {
	const started = options.onProfile ? performance.now() : undefined;
	const owner = new AbortController();
	inheritRequestRenderScheduler(options.signal, owner.signal);
	let render: Promise<RenderToStringResult> | undefined;
	let chunks: readonly string[] | undefined;
	let index = 0;
	let bytes = 0;
	let closed = false;
	let controller: ReadableStreamDefaultController<Uint8Array>;
	const maxBytes = positiveLimit(options.maxStreamBytes, 16 * 1024 * 1024);
	const maxChunks = positiveLimit(options.maxStreamChunks, 100_000);
	const unlink = () => options.signal?.removeEventListener('abort', abort);
	const abort = () => {
		if (closed) return;
		closed = true;
		const reason = options.signal?.reason ?? new DOMException('SSR stream aborted', 'AbortError');
		owner.abort(reason);
		chunks = undefined;
		unlink();
		controller.error(reason);
	};
	const stream = new ReadableStream<Uint8Array>(
		{
			start(target) {
				controller = target;
				if (options.signal?.aborted) abort();
				else options.signal?.addEventListener('abort', abort, { once: true });
			},
			async pull(target) {
				if (closed) return;
				try {
					if (!chunks) {
						render = renderStringOutput(
							operation,
							{ ...options, onProfile: undefined, signal: owner.signal },
							false,
							'stream'
						);
						const result = await render;
						if (closed) return;
						chunks = htmlChunksOf(result) ?? [result.html];
					}
					if (index === chunks.length) {
						closed = true;
						chunks = undefined;
						unlink();
						target.close();
						return;
					}
					if (index >= maxChunks) throw new Error('SSR stream chunk limit exceeded');
					const encoded = encodeSsrUtf8(chunks[index++]!);
					bytes += encoded.byteLength;
					if (bytes > maxBytes) throw new Error('SSR stream byte limit exceeded');
					target.enqueue(encoded);
				} catch (error) {
					if (closed) return;
					closed = true;
					chunks = undefined;
					unlink();
					target.error(error);
				}
			},
			async cancel(reason) {
				closed = true;
				chunks = undefined;
				owner.abort(reason);
				unlink();
				await render?.then(
					() => undefined,
					() => undefined
				);
			}
		},
		{ highWaterMark: 0 }
	);
	if (started !== undefined)
		publishExactProfile(
			options.onProfile,
			Object.freeze({
				subsystem: 'ssr',
				phase: 'create-stream',
				elapsedMs: performance.now() - started
			})
		);
	return stream;
}
