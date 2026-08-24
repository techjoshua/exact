import { createExactBufferedResponse, defineExactOperationContract } from '@exactjs/server';
import { describe, expect, it } from 'vitest';
import { createExactBunHandler, exactResponseToBunResponse } from './index.js';

describe('@exactjs/bun-adapter', () => {
	it('handles Bun Fetch-compatible requests', async () => {
		const handler = createExactBunHandler({
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
						runtime: 'bun',
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
			state: { runtime: 'bun', url: 'https://example.com/__exact', platform: true }
		});
	});
});

it('passes chunked SSR bodies to the Fetch runtime without materializing a Web stream', async () => {
	const exact = createExactBufferedResponse(200, { 'content-type': 'text/html' }, [
		'<main>',
		'Ready',
		'</main>'
	]);
	const response = exactResponseToBunResponse(exact);

	expect(await response.text()).toBe('<main>Ready</main>');
});

function stateAction(id: string) {
	return defineExactOperationContract(id, {
		writes: [{ path: '*', kind: 'write', confidence: 'exact' }]
	});
}
