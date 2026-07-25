import { createContext, type ExactComponentContinuationContract } from '@exactjs/core';
import { describe, expect, it } from 'vitest';
import { createExactContinuationHandler } from './continuation-execution.js';
import { dispatchExactOperation } from './operations.js';
import { context } from './test-support/server.js';

const DatabaseContext = createContext<{
	find(id: string): Promise<{ title: string; secret: string }>;
}>('database', { scope: 'request' });

const contract: ExactComponentContinuationContract = {
	id: 'task:load',
	componentId: 'component:Page',
	dependencies: [{ source: 'state' }],
	stateReads: [{ path: 'id', kind: 'read', confidence: 'exact' }],
	stateWrites: [{ path: 'title', kind: 'write', confidence: 'exact' }],
	publicContexts: [],
	serverContexts: ['DatabaseContext'],
	contextWrites: [],
	boundaries: []
};

describe('@exactjs/server generated continuation execution', () => {
	it('resolves server context locally and returns only declared state writes', async () => {
		const contextAccesses: unknown[] = [];
		const handler = createExactContinuationHandler(contract, {
			id: contract.id,
			componentId: contract.componentId,
			async execute(activation, execution) {
				const row = await execution
					.getContext(DatabaseContext, 'DatabaseContext')
					.find(String(activation.dependencies[0]));
				activation.state.title = row.title;
				activation.state.secret = row.secret;
				return { state: activation.state };
			}
		});
		const result = await handler(
			{
				type: 'action',
				id: contract.id,
				payload: { dependencies: ['p1'] },
				state: { id: 'p1' }
			},
			context({
				onContextAccess: (observation) => contextAccesses.push(observation),
				contexts: {
					kind: 'request',
					componentValues: new Map(),
					get: async (token) => {
						if (token !== DatabaseContext) throw new Error('unexpected context');
						return { find: async () => ({ title: 'Visible', secret: 'hidden' }) } as never;
					},
					getSync: (token) => {
						if (token !== DatabaseContext) throw new Error('unexpected context');
						return { find: async () => ({ title: 'Visible', secret: 'hidden' }) } as never;
					}
				}
			})
		);

		expect(result).toEqual({ state: { title: 'Visible' } });
		expect(contextAccesses).toEqual([
			{
				operationId: contract.id,
				componentId: contract.componentId,
				token: 'DatabaseContext',
				scope: 'request'
			}
		]);
		expect(JSON.stringify(contextAccesses)).not.toContain('Visible');
	});

	it('rejects malformed dependency activation before executing authored work', async () => {
		let executed = false;
		const handler = createExactContinuationHandler(contract, {
			id: contract.id,
			componentId: contract.componentId,
			execute(activation) {
				executed = true;
				return { state: activation.state };
			}
		});

		await expect(
			handler(
				{ type: 'action', id: contract.id, payload: { dependencies: [] }, state: { id: 'p1' } },
				context()
			)
		).rejects.toThrow('Malformed activation record');
		expect(executed).toBe(false);
	});

	it('returns only declared public component-context writes', async () => {
		const contextContract: ExactComponentContinuationContract = {
			...contract,
			contextWrites: ['StatusContext']
		};
		const handler = createExactContinuationHandler(contextContract, {
			id: contract.id,
			componentId: contract.componentId,
			execute(activation) {
				return {
					state: activation.state,
					contexts: { StatusContext: { message: 'ready' } }
				};
			}
		});

		await expect(
			handler(
				{
					type: 'action',
					id: contract.id,
					payload: { dependencies: ['p1'] },
					state: { id: 'p1' }
				},
				context()
			)
		).resolves.toEqual({
			contexts: { StatusContext: { message: 'ready' } }
		});
	});

	it('dispatches an imported executor without an application action table', async () => {
		const executor = {
			id: contract.id,
			componentId: contract.componentId,
			execute(activation: { state: Record<string, unknown> }) {
				activation.state.title = 'Generated';
				return { state: activation.state };
			}
		};
		const server = context({
			contract: {
				version: 1,
				actions: { [contract.id]: contract },
				executors: { [contract.id]: executor },
				boundaries: {}
			},
			actions: {}
		});

		await expect(
			dispatchExactOperation(
				{ method: 'POST' },
				{
					type: 'action',
					id: contract.id,
					payload: { dependencies: ['p1'] },
					state: { id: 'p1' }
				},
				server
			)
		).resolves.toMatchObject({ ok: true, state: { title: 'Generated' } });
		await expect(
			dispatchExactOperation(
				{ method: 'POST' },
				{
					type: 'action',
					id: contract.id,
					payload: { dependencies: [] },
					state: { id: 'p1' }
				},
				server
			)
		).resolves.toMatchObject({ ok: false, status: 400, error: 'bad_request' });
	});
});
