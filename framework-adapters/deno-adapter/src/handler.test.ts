import { defineExactOperationContract } from '@exactjs/server';
import { describe, expect, it } from 'vitest';
import { createExactDenoHandler } from './index.js';

describe('@exactjs/deno-adapter', () => {
	it('handles Deno Fetch-compatible requests', async () => {
		const handler = createExactDenoHandler({
			publicOrigin: 'https://example.com',
			contract: {
				version: 1,
				endpoint: '/__exact',
				invocations: { save: stateAction('save') },
				boundaries: {}
			},
			invocations: {
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
				body: JSON.stringify({ type: 'invoke', id: 'save' })
			})
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			ok: true,
			type: 'invoke',
			id: 'save',
			state: { runtime: 'deno', url: 'https://example.com/__exact', platform: true }
		});
	});
});

function stateAction(id: string) {
	return defineExactOperationContract(id, {
		writes: [{ path: '*', kind: 'write', confidence: 'exact' }]
	});
}
