import { describe, expect, it, vi } from 'vitest';
import { createDocumentEventStream, createProgressiveHtmlStream } from './creation.js';
import { renderToDocumentStream, renderToProgressiveHtmlStream } from '../index.js';

describe('stream producer ownership', () => {
	it.each(['document', 'progressive', 'public-document', 'public-progressive'] as const)(
		'waits for %s producer cleanup before cancellation settles',
		async (kind) => {
			let beginProduction!: () => void;
			const started = new Promise<void>((resolve) => {
				beginProduction = resolve;
			});
			let beginCleanup!: () => void;
			const cleaning = new Promise<void>((resolve) => {
				beginCleanup = resolve;
			});
			let releaseCleanup!: () => void;
			const cleanupReady = new Promise<void>((resolve) => {
				releaseCleanup = resolve;
			});
			let finished = false;
			const produce = async (signal: AbortSignal) => {
				beginProduction();
				try {
					await new Promise<void>((resolve) => {
						if (signal.aborted) resolve();
						else signal.addEventListener('abort', () => resolve(), { once: true });
					});
				} finally {
					beginCleanup();
					await cleanupReady;
					finished = true;
				}
			};
			const stream =
				kind === 'document'
					? createDocumentEventStream(produce)
					: kind === 'progressive'
						? createProgressiveHtmlStream((options) => produce(options.signal!), {})
						: kind === 'public-document'
							? renderToDocumentStream(null, { scheduleRender: (signal) => produce(signal!) })
							: renderToProgressiveHtmlStream(null, {
									scheduleRender: (signal) => produce(signal!)
								});
			const reader = stream.getReader();
			let settled = false;
			let cancelled: Promise<void> | undefined;
			try {
				await started;
				cancelled = reader.cancel(new Error('reader cancelled')).then(() => {
					settled = true;
				});
				await cleaning;
				await Promise.resolve();
				expect(settled).toBe(false);
			} finally {
				releaseCleanup();
				await (cancelled ?? reader.cancel());
				reader.releaseLock();
			}
			expect(finished).toBe(true);
		}
	);

	it('publishes a synchronous document producer failure and releases the request signal', async () => {
		const request = new AbortController();
		const remove = vi.spyOn(request.signal, 'removeEventListener');
		const failure = new Error('producer failed');
		const report = vi.fn();
		const stream = createDocumentEventStream(
			() => {
				throw failure;
			},
			{
				signal: request.signal,
				onError: report
			}
		);
		const reader = stream.getReader();
		try {
			const first = await reader.read();
			expect(JSON.parse(new TextDecoder().decode(first.value))).toEqual({
				event: 'error',
				version: 1,
				message: 'Document rendering failed'
			});
			expect((await reader.read()).done).toBe(true);
			expect(report).toHaveBeenCalledExactlyOnceWith(failure);
			expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
		} finally {
			await reader.cancel();
			reader.releaseLock();
		}
	});
});

it.each(['document', 'progressive'] as const)(
	'allows a consumed %s stream to outlive a default event-count threshold',
	async (kind) => {
		let finished = false;
		const produce = async (
			emit: (event: { event: 'body'; version: 1; html: string }) => void | Promise<void>
		) => {
			try {
				for (let index = 0; index < 100_001; index++)
					await emit({ event: 'body', version: 1, html: 'x' });
			} finally {
				finished = true;
			}
		};
		const stream =
			kind === 'document'
				? createDocumentEventStream((_signal, emit) => produce(emit))
				: createProgressiveHtmlStream((_options, emit) => produce(emit), {});
		const reader = stream.getReader();
		let bytes = 0;
		try {
			for (;;) {
				const next = await reader.read();
				if (next.done) break;
				bytes += next.value.byteLength;
			}
			expect(bytes).toBe(
				kind === 'document'
					? new TextEncoder().encode(
							JSON.stringify({ event: 'body', version: 1, html: 'x' }) + '\n'
						).byteLength * 100_001
					: 100_001
			);
			expect(finished).toBe(true);
		} finally {
			await reader.cancel().catch(() => undefined);
			reader.releaseLock();
		}
	}
);
