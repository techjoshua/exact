import { describe, expect, it } from 'vitest';
import { createExactDenoHandler } from './index.js';

describe('@exact/deno-adapter', () => {
	it('handles Deno Fetch-compatible requests', async () => {
		const handler = createExactDenoHandler({
			manifest: {
				version: 1,
				endpoint: '/__exact',
				actions: { save: { id: 'save', placement: 'server' } }
			},
			actions: {
				save: (_input, context) => ({
					state: {
						runtime: 'deno',
						url: context.requestContext?.url.href,
						platform: context.platformRequest instanceof Request
					}
				})
			}
		});

		const response = await handler(
			new Request('https://example.com/__exact', {
				method: 'POST',
				body: JSON.stringify({ type: 'action', id: 'save' })
			})
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			ok: true,
			type: 'action',
			id: 'save',
			state: { runtime: 'deno', url: 'https://example.com/__exact', platform: true }
		});
	});
});
