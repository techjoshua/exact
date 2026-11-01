import { expect, it } from 'vitest';
import { handleExactRequest, defineExactOperationContract } from './index.js';
import { context, readStreamEvents } from './test-support/server.js';

it.each(['single', 'batch'])(
	'retains declared public context writes in %s streamed results',
	async (mode) => {
		const operation = { type: 'invoke', id: 'allowed-action' };
		const contexts = { StatusContext: { message: 'ready' } };
		const base = context();
		const options = context({
			contract: {
				...base.contract,
				invocations: {
					'allowed-action': defineExactOperationContract('allowed-action', {
						contextWrites: ['StatusContext']
					})
				}
			},
			invocations: { 'allowed-action': () => ({ contexts, value: 42 }) }
		});
		const body = mode === 'single' ? operation : { type: 'batch', operations: [operation] };
		const buffered = await handleExactRequest({ method: 'POST', body }, options);
		expect(buffered.body).toContain('StatusContext');
		const streamed = await handleExactRequest(
			{ method: 'POST', headers: { accept: 'application/x-ndjson' }, body },
			options
		);
		const events = await readStreamEvents(streamed.stream!);
		expect(events).toContainEqual({
			event: 'result',
			version: 1,
			index: 0,
			result: { ok: true, ...operation, contexts, value: 42 }
		});
	}
);

it.each(['buffered', 'streamed'])(
	'rejects undeclared public-context writes in %s responses',
	async (mode) => {
		const result = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'invoke', id: 'allowed-action' },
				...(mode === 'streamed' ? { headers: { accept: 'application/x-ndjson' } } : {})
			},
			context({
				invocations: {
					'allowed-action': () => ({ contexts: { StatusContext: { message: 'private' } } })
				}
			})
		);
		if (mode === 'buffered') {
			expect(result.status).toBe(500);
			expect(result.body).not.toContain('StatusContext');
		} else {
			const events = await readStreamEvents(result.stream!);
			expect(events).toContainEqual({
				event: 'result',
				version: 1,
				index: 0,
				result: {
					ok: false,
					type: 'invoke',
					id: 'allowed-action',
					status: 500,
					error: 'internal_error'
				}
			});
			expect(JSON.stringify(events)).not.toContain('StatusContext');
		}
	}
);
