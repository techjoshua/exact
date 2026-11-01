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

it.each([
	['open', 403],
	['close', 200],
	['close', 403]
] as const)('cancels an unused %s response body with HTTP status %s', async (method, status) => {
	let cancelled = 0;
	const body = new ReadableStream<Uint8Array>({
		pull(controller) {
			controller.enqueue(new Uint8Array([1]));
		},
		cancel() {
			cancelled++;
		}
	});
	const client = createExactBrowserServerInspectionClient(
		'/__exact',
		async () => new Response(body, { status })
	);
	try {
		if (method === 'open') await expect(client.open(['catalog'])).resolves.toBeUndefined();
		else await client.close('session');
		expect(cancelled).toBe(1);
	} finally {
		await body.cancel();
	}
});
