import { defineExactOperationContract } from '@exactjs/server';
import { describe, expect, it } from 'vitest';
import { createExactFetchHandler } from './index.js';

describe('@exactjs/fetch-adapter', () => {
	it('handles eXact requests through Fetch Request and Response objects', async () => {
		const handler = createExactFetchHandler({
			publicOrigin: 'https://example.com',
			contract: {
				version: 1,
				endpoint: '/__exact',
				actions: { save: stateAction('save') },
				boundaries: {}
			},
			actions: {
				save: (_input, context) => ({
					state: {
						method: context.requestContext?.method,
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
			state: { method: 'POST', url: 'https://example.com/__exact', platform: true }
		});
	});
});

function stateAction(id: string) {
	return defineExactOperationContract(id, {
		writes: [{ path: '*', kind: 'write', confidence: 'exact' }]
	});
}
