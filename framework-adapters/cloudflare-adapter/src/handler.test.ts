import { defineExactOperationContract } from '@exactjs/server';
import { describe, expect, it } from 'vitest';
import { createExactCloudflareHandler } from './index.js';

describe('@exactjs/cloudflare-adapter', () => {
	it('handles Cloudflare Worker fetch requests', async () => {
		const handler = createExactCloudflareHandler({
			publicOrigin: 'https://example.com',
			contract: {
				version: 1,
				endpoint: '/__exact',
				invocations: { save: stateAction('save') },
				boundaries: {}
			},
			invocations: {
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
				body: JSON.stringify({ type: 'invoke', id: 'save' })
			}),
			{ name: 'production' },
			{ requestId: 'cf-1' }
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			ok: true,
			type: 'invoke',
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

function stateAction(id: string) {
	return defineExactOperationContract(id, {
		writes: [{ path: '*', kind: 'write', confidence: 'exact' }]
	});
}
