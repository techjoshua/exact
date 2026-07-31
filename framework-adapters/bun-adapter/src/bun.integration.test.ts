import { defineExactOperationContract } from '@exactjs/server';
import { createExactBunHandler } from './index.js';

type SharedTestApi = Pick<typeof import('vitest'), 'describe' | 'it' | 'expect'>;

const runningInBun = Boolean((globalThis as { Bun?: unknown }).Bun);
const bunTestModule: string = 'bun:test';
const testApi = (
	runningInBun ? await import(bunTestModule) : await import('vitest')
) as SharedTestApi;
const describeBun = runningInBun ? testApi.describe : testApi.describe.skip;

describeBun('@exactjs/bun-adapter with Bun.serve', () => {
	testApi.it('serves an eXact action through Bun native HTTP', async () => {
		const handler = createExactBunHandler({
			contract: {
				version: 1,
				endpoint: '/__exact',
				actions: { ping: stateAction('ping') },
				boundaries: {}
			},
			actions: {
				ping: () => ({ state: { runtime: 'bun' } })
			}
		});
		const bun = (
			globalThis as unknown as {
				Bun: {
					serve(options: { port: number; fetch(request: Request): Response | Promise<Response> }): {
						url: URL;
						stop(force?: boolean): Promise<void>;
					};
				};
			}
		).Bun;
		const server = bun.serve({ port: 0, fetch: handler });
		try {
			const response = await fetch(new URL('/__exact', server.url), {
				method: 'POST',
				body: JSON.stringify({ type: 'action', id: 'ping' })
			});

			testApi.expect(response.status).toBe(200);
			testApi.expect(await response.json()).toEqual({
				ok: true,
				type: 'action',
				id: 'ping',
				state: { runtime: 'bun' }
			});
		} finally {
			await server.stop();
		}
	});
});

function stateAction(id: string) {
	return defineExactOperationContract(id, {
		writes: [{ path: '*', kind: 'write', confidence: 'exact' }]
	});
}
