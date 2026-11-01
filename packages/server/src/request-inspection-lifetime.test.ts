import { context } from './test-support/server.js';
import { expect, it } from 'vitest';
import {
	createExactServerDebugRuntime,
	defineExactOperationContract,
	handleExactRequest
} from './index.js';
import {
	verifyServerRequestInspectionLifetime,
	verifyServerObservationByteBounds
} from '../../component-composition-corpus/test-support/server-request-inspection-journey.mjs';

const api = { createExactServerDebugRuntime, defineExactOperationContract, handleExactRequest };
it('retires request observation authority independently of ongoing business work', async () => {
	expect(await verifyServerRequestInspectionLifetime(api)).toBe(true);
});
it('retains the newest complete observations within the final UTF-8 byte budget', async () => {
	expect(await verifyServerObservationByteBounds(api)).toBe(true);
});

it.each([NaN, Infinity])(
	'keeps near-limit response observations within the fallback budget for %s',
	async (invalid) => {
		const maximum = 16 * 1024 * 1024;
		const configured = context({
			allowDebug: true,
			limits: { maxResponseBytes: invalid },
			invocations: {
				'allowed-action': (_input, scoped) => {
					scoped.requestDebugRuntime!.observe({
						kind: 'state.change',
						buildKey: 'a'.repeat(40),
						executionRoot: 'page',
						componentTypeId: 'component:Page',
						attributes: { text: 'x'.repeat(512) }
					});
					return { value: 'x'.repeat(maximum - 180) };
				}
			}
		});
		const runtime = (configured.debugRuntime = createExactServerDebugRuntime(configured));
		const request = {
			method: 'POST',
			url: 'https://app.test/__exact',
			headers: { origin: 'https://app.test' }
		};
		try {
			const opened = await runtime.handle(request, {
				type: 'debug',
				version: 1,
				request: 'open',
				capabilities: ['events']
			});
			if (typeof opened.body !== 'string') throw new Error('Expected debug session response');
			const sessionId = (JSON.parse(opened.body) as { session: { id: string } }).session.id;
			const response = await handleExactRequest(
				{
					...request,
					headers: { ...request.headers, 'x-exact-debug-session': sessionId },
					body: { type: 'invoke', id: 'allowed-action' }
				},
				configured
			);
			expect(response.status).toBe(200);
			expect(response.body).toBeTypeOf('string');
			expect(new TextEncoder().encode(response.body as string).byteLength).toBeLessThanOrEqual(
				maximum
			);
			expect((JSON.parse(response.body as string) as { value: string }).value.length).toBe(
				maximum - 180
			);
		} finally {
			await runtime.close();
		}
	}
);
