import {
	createContext,
	mutateTaskCollection,
	stageTaskMutation,
	takeTaskCollectionMutations,
	type ExactComponentContinuationContract
} from '@exactjs/core';
import { describe, expect, it } from 'vitest';
import { createExactContinuationHandler } from './continuation-execution.js';
import { dispatchExactOperation } from './operations.js';
import { context } from './test-support/server.js';

const DatabaseContext = createContext<{
	find(id: string): Promise<{ title: string; secret: string }>;
}>('database', { scope: 'request' });
const StatusContext = createContext<{ ready: boolean }>('status', { scope: 'request' });

const contract: ExactComponentContinuationContract = {
	id: 'task:load',
	componentId: 'component:Page',
	readiness: 'nonblocking',
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

	it('returns an explicit action result through the existing continuation envelope', async () => {
		const handler = createExactContinuationHandler(
			{
				...contract,
				kind: 'action',
				dependencies: [{ source: 'argument' }],
				invocation: {
					arguments: [{ source: 'argument' }],
					concurrency: 'latest'
				}
			},
			{
				id: contract.id,
				componentId: contract.componentId,
				execute(activation) {
					expect(activation.generation).toBe(3);
					return {
						state: activation.state,
						value: `saved:${String(activation.dependencies[0])}`
					};
				}
			}
		);

		await expect(
			handler(
				{
					type: 'action',
					id: contract.id,
					payload: { dependencies: ['title'], generation: 3 },
					state: { id: 'p1' }
				},
				context()
			)
		).resolves.toEqual({ value: 'saved:title' });
	});

	it('applies only compiler-authorized server context writes', async () => {
		let status: { ready: boolean } | undefined;
		const handler = createExactContinuationHandler(
			{ ...contract, serverContextWrites: ['StatusContext'] },
			{
				id: contract.id,
				componentId: contract.componentId,
				execute(activation, execution) {
					execution.setContext(StatusContext, { ready: true }, 'StatusContext');
					return { state: activation.state };
				}
			}
		);
		await handler(
			{
				type: 'action',
				id: contract.id,
				payload: { dependencies: ['p1'] },
				state: { id: 'p1' }
			},
			context({
				contexts: {
					kind: 'request',
					componentValues: new Map(),
					async get<T>() {
						return { ready: false } as T;
					},
					getSync<T>() {
						return { ready: false } as T;
					},
					setSync: (token, value) => {
						if (token !== StatusContext) throw new Error('unexpected context');
						status = value as { ready: boolean };
					}
				}
			})
		);
		expect(status).toEqual({ ready: true });
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

	it('publishes compiler-staged writes only after a continuation succeeds', async () => {
		const handler = createExactContinuationHandler(contract, {
			id: contract.id,
			componentId: contract.componentId,
			async execute(activation, execution) {
				stageTaskMutation(execution.signal, () => {
					activation.state.title = 'Settled';
				});
				await Promise.resolve();
				return { state: activation.state };
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
		).resolves.toEqual({ state: { title: 'Settled' } });
	});

	it('returns ordered Map and Set deltas without projecting whole collections', async () => {
		const collectionContract: ExactComponentContinuationContract = {
			...contract,
			stateWrites: [
				{ path: 'lookup', kind: 'write', confidence: 'exact', operation: 'map' },
				{ path: 'selected', kind: 'write', confidence: 'exact', operation: 'set' }
			]
		};
		const handler = createExactContinuationHandler(collectionContract, {
			id: contract.id,
			componentId: contract.componentId,
			execute(activation, execution) {
				mutateTaskCollection(execution.signal, activation.state, ['lookup'], 'map', 'set', [
					'answer',
					42
				]);
				mutateTaskCollection(execution.signal, activation.state, ['selected'], 'set', 'add', [
					'answer'
				]);
				mutateTaskCollection(execution.signal, activation.state, ['selected'], 'set', 'add', [
					'answer'
				]);
				return { state: activation.state };
			}
		});

		await expect(
			handler(
				{
					type: 'action',
					id: contract.id,
					payload: { dependencies: ['p1'] },
					state: { lookup: new Map(), selected: new Set() }
				},
				context()
			)
		).resolves.toEqual({
			mutations: [
				{ path: 'lookup', operation: 'map-set', key: 'answer', value: 42 },
				{ path: 'selected', operation: 'set-add', value: 'answer' }
			]
		});
	});

	it('discards compiler-staged writes when a continuation fails', async () => {
		const activationState = { id: 'p1' };
		const handler = createExactContinuationHandler(contract, {
			id: contract.id,
			componentId: contract.componentId,
			execute(activation, execution) {
				stageTaskMutation(execution.signal, () => {
					activation.state.title = 'Leaked';
				});
				throw new Error('query failed');
			}
		});

		await expect(
			handler(
				{
					type: 'action',
					id: contract.id,
					payload: { dependencies: ['p1'] },
					state: activationState
				},
				context()
			)
		).rejects.toThrow('query failed');
		expect(activationState).toEqual({ id: 'p1' });
	});

	it('discards collection deltas when a continuation fails', async () => {
		const signal = new AbortController().signal;
		const collectionContract: ExactComponentContinuationContract = {
			...contract,
			stateWrites: [{ path: 'lookup', kind: 'write', confidence: 'exact', operation: 'map' }]
		};
		const handler = createExactContinuationHandler(collectionContract, {
			id: contract.id,
			componentId: contract.componentId,
			execute(activation, execution) {
				mutateTaskCollection(execution.signal, activation.state, ['lookup'], 'map', 'set', [
					'leaked',
					1
				]);
				throw new Error('query failed');
			}
		});

		await expect(
			handler(
				{
					type: 'action',
					id: contract.id,
					payload: { dependencies: ['p1'] },
					state: { lookup: new Map() }
				},
				context({ signal })
			)
		).rejects.toThrow('query failed');
		expect(takeTaskCollectionMutations(signal)).toBeUndefined();
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
