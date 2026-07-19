import { describe, expect, it } from 'vitest';
import { createExactCloudflareHandler } from './index.js';

describe('@exact/cloudflare-adapter', () => {
	it('handles Cloudflare Worker fetch requests', async () => {
		const handler = createExactCloudflareHandler({
			manifest: {
				version: 1,
				endpoint: '/__exact',
				actions: { save: { id: 'save', placement: 'server' } }
			},
			actions: {
				save: (_input, context) => {
					const platform = context.platformRequest as {
						env: { name: string };
						context: { requestId: string };
					};
					return {
						state: {
							runtime: 'cloudflare',
							url: context.requestContext?.url.href,
							env: platform.env.name,
							requestId: platform.context.requestId
						}
					};
				}
			}
		});

		const response = await handler(
			new Request('https://example.com/__exact', {
				method: 'POST',
				body: JSON.stringify({ type: 'action', id: 'save' })
			}),
			{ name: 'production' },
			{ requestId: 'cf-1' }
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			ok: true,
			type: 'action',
			id: 'save',
			state: {
				runtime: 'cloudflare',
				url: 'https://example.com/__exact',
				env: 'production',
				requestId: 'cf-1'
			}
		});
	});
});
