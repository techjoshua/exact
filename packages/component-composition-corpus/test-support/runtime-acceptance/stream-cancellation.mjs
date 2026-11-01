import { renderToDocumentStream, renderToProgressiveHtmlStream } from '@exactjs/ssr';
import { defineExactOperationContract, handleExactRequest } from '@exactjs/server';

/** Checks public reader cancellation retains each producer until asynchronous cleanup completes. */
export async function streamCancellationJourney() {
	const results = [];
	const sources = [
		(produce) => renderToDocumentStream(null, { scheduleRender: produce }),
		(produce) => renderToProgressiveHtmlStream(null, { scheduleRender: produce }),
		async (produce) => {
			const response = await handleExactRequest(
				{
					method: 'POST',
					headers: { accept: 'application/x-ndjson' },
					body: { type: 'invoke', id: 'cleanup' }
				},
				{
					contract: {
						version: 1,
						invocations: { cleanup: defineExactOperationContract('cleanup') },
						boundaries: {}
					},
					invocations: {
						cleanup: async (_input, context) => {
							await produce(context.signal);
							return {};
						}
					},
					logger: { log() {} }
				}
			);
			if (response.status !== 200 || !response.stream) throw new Error('Missing operation stream');
			return response.stream;
		}
	];
	for (const source of sources) {
		let beginProduction;
		const started = new Promise((resolve) => {
			beginProduction = resolve;
		});
		let beginCleanup;
		const cleaning = new Promise((resolve) => {
			beginCleanup = resolve;
		});
		let releaseCleanup;
		const cleanupReady = new Promise((resolve) => {
			releaseCleanup = resolve;
		});
		let finished = false;
		const stream = await source(async (signal) => {
			beginProduction();
			try {
				await new Promise((resolve) => {
					if (signal.aborted) resolve();
					else signal.addEventListener('abort', () => resolve(), { once: true });
				});
			} finally {
				beginCleanup();
				await cleanupReady;
				finished = true;
			}
		});
		const reader = stream.getReader();
		let settled = false;
		let premature;
		let cancelled;
		const first = reader.read();
		try {
			await started;
			cancelled = reader.cancel(new Error('reader cancelled')).then(() => {
				settled = true;
			});
			await cleaning;
			await Promise.resolve();
			premature = settled;
		} finally {
			releaseCleanup();
			await (cancelled ?? reader.cancel());
			await first;
			reader.releaseLock();
		}
		results.push({ premature, finished });
	}
	return results;
}
