import { describe, expect, it } from 'vitest';
import { createExactBrowserServerInspectionClient } from './server-client.js';

describe('browser DevTools server transport', () => {
	it('cancels an oversized response before retaining the full body', async () => {
		let cancelled = false;
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				controller.enqueue(new Uint8Array(5 * 1024 * 1024));
			},
			cancel() {
				cancelled = true;
			}
		});
		const client = createExactBrowserServerInspectionClient(
			'/__exact',
			async () => new Response(body)
		);

		await expect(client.open(['catalog'])).resolves.toBeUndefined();
		expect(cancelled).toBe(true);
	});
});
