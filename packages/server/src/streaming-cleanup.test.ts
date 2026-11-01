import { expect, it } from 'vitest';
import { handleExactRequest } from './index.js';
import { context } from './test-support/server.js';

it('waits for a cancelled operation handler to unwind before releasing its response reader', async () => {
	let begin!: () => void;
	const started = new Promise<void>((resolve) => {
		begin = resolve;
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
	const response = await handleExactRequest(
		{
			method: 'POST',
			headers: { accept: 'application/x-ndjson' },
			body: { type: 'invoke', id: 'allowed-action' }
		},
		context({
			invocations: {
				'allowed-action': async (_input, request) => {
					begin();
					try {
						await new Promise<void>((resolve) =>
							request.signal!.addEventListener('abort', () => resolve(), { once: true })
						);
					} finally {
						beginCleanup();
						await cleanupReady;
						finished = true;
					}
					return {};
				}
			}
		})
	);
	const reader = response.stream!.getReader();
	let cancelled: Promise<void> | undefined;
	let settled = false;
	try {
		await reader.read();
		await started;
		cancelled = reader.cancel('disconnected').then(() => {
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
});
