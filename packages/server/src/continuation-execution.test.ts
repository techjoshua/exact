import {
	createContext,
	mutateTaskCollection,
	stageTaskMutation,
	takeTaskCollectionMutations
} from '@exactjs/core';
import { type ExactComponentContinuationContract } from '@exactjs/core/framework/component-contracts';
import { describe, expect, it } from 'vitest';
import { createExactContinuationHandler } from './continuation/execution.js';
import { dispatchExactOperation, limitedJsonResponse } from './operations.js';
import { context } from './test-support/server.js';

const DatabaseContext = createContext<{
	find(id: string): Promise<{ title: string; secret: string }>;
}>('database', { scope: 'request' });
const StatusContext = createContext<{ ready: boolean }>('status', { scope: 'request' });

const contract: ExactComponentContinuationContract = {
	id: 'task:load',
	componentId: 'component:Page',
	kind: 'task',
	readiness: 'nonblocking',
	dependencies: [{ source: 'state' }],
	stateReads: [{ path: 'id', kind: 'read', confidence: 'exact' }],
	stateWrites: [{ path: 'title', kind: 'write', confidence: 'exact' }],
	publicContexts: [],
	serverContexts: ['DatabaseContext'],
	contextWrites: [],
	boundaries: []
};

it.each([false, true])(
	'projects an input-present write from an explicitly invoked child (detached=%s)',
	async (detached) => {
		const { defineTask, invokeTask } = await import('@exactjs/core');
		const { taskMutation } = await import('../../core/src/tasks/frame-runtime.js');
		const { writeReactiveLazy } = await import('../../core/src/runtime/reactivity.js');
		const handler = createExactContinuationHandler(contract, {
			id: contract.id,
			componentId: contract.componentId,
			async execute(activation, execution) {
				const child = defineTask<[], unknown>({ detached }, async (task) => {
					await Promise.resolve();
					return taskMutation(task.signal, () =>
						writeReactiveLazy(activation.state, ['title'], () => 'after')
					);
				});
				const launch = async () => await invokeTask(execution.task, child);
				const value = await launch();
				return { state: activation.state, value };
			}
		});
		const result = await handler(
			{
				type: 'invoke',
				id: contract.id,
				payload: { dependencies: ['p1'] },
				state: { id: 'p1', title: 'before' }
			},
			context()
		);
		expect(result).toEqual({ state: { title: 'after' }, value: 'after' });
	}
);

describe('@exactjs/server generated continuation execution', () => {
	it('supplies the full task frame context and releases owned resources', async () => {
		const events: string[] = [];
		const handler = createExactContinuationHandler(contract, {
			id: contract.id,
			componentId: contract.componentId,
			execute(activation, execution) {
				expect(execution.task.signal).toBe(execution.signal);
				expect(execution.task.activation).toBe('invoked');
				expect(execution.task.generation).toBe(7);
				expect(execution.task.peek(() => activation.dependencies[0])).toBe('p1');
				execution.task.own({
					[Symbol.dispose]() {
						events.push('resource');
					}
				});
				execution.task.cleanup(() => {
					events.push('cleanup');
				});
				return { state: activation.state };
			}
		});

		await handler(
			{
				type: 'invoke',
				id: contract.id,
				payload: { dependencies: ['p1'], generation: 7 },
				state: { id: 'p1' }
			},
			context()
		);

		expect(events).toEqual(['cleanup', 'resource']);
	});

	it('resolves server context locally and returns only declared state writes', async () => {
		const credential = 'PRIVATE-CREDENTIAL-task-response-8f729d';
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
				type: 'invoke',
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
						return { find: async () => ({ title: 'Visible', secret: credential }) } as never;
					},
					getSync: (token) => {
						if (token !== DatabaseContext) throw new Error('unexpected context');
						return { find: async () => ({ title: 'Visible', secret: credential }) } as never;
					}
				}
			})
		);

		expect(result).toEqual({ state: { title: 'Visible' } });
		const response = limitedJsonResponse(context(), 200, result);
		expect(JSON.parse(response.body)).toEqual({ state: { title: 'Visible' } });
		expect(response.body).not.toContain(credential);
		expect(contextAccesses).toEqual([
			{
				operationId: contract.id,
				componentId: contract.componentId,
				token: 'DatabaseContext',
				scope: 'request'
			}
		]);
		expect(JSON.stringify(contextAccesses)).not.toContain('Visible');
		expect(JSON.stringify(contextAccesses)).not.toContain(credential);
	});

	it('returns an explicit action result through the existing continuation envelope', async () => {
		const handler = createExactContinuationHandler(
			{
				...contract,
				kind: 'task',
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
					type: 'invoke',
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
				type: 'invoke',
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
				{ type: 'invoke', id: contract.id, payload: { dependencies: [] }, state: { id: 'p1' } },
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
					type: 'invoke',
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
					type: 'invoke',
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
					type: 'invoke',
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
					type: 'invoke',
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
					type: 'invoke',
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
				invocations: { [contract.id]: contract },
				executors: { [contract.id]: executor },
				boundaries: {}
			},
			invocations: {}
		});

		await expect(
			dispatchExactOperation(
				{ method: 'POST' },
				{
					type: 'invoke',
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
					type: 'invoke',
					id: contract.id,
					payload: { dependencies: [] },
					state: { id: 'p1' }
				},
				server
			)
		).resolves.toMatchObject({ ok: false, status: 400, error: 'bad_request' });
	});
});

it('propagates request cancellation into the generated task frame and releases owned work', async () => {
	const controller = new AbortController();
	let markStarted!: () => void;
	const started = new Promise<void>((resolve) => {
		markStarted = resolve;
	});
	let markFinished!: () => void;
	const finish = new Promise<void>((resolve) => {
		markFinished = resolve;
	});
	let taskSignal: AbortSignal | undefined;
	let cleaned = false;
	const handler = createExactContinuationHandler(contract, {
		id: contract.id,
		componentId: contract.componentId,
		async execute(activation, execution) {
			taskSignal = execution.signal;
			execution.task.cleanup(() => {
				cleaned = true;
			});
			markStarted();
			await new Promise<void>((resolve, reject) => {
				execution.signal.addEventListener('abort', () => reject(execution.signal.reason), {
					once: true
				});
				void finish.then(resolve);
			});
			return { state: activation.state };
		}
	});
	const pending = handler(
		{ type: 'invoke', id: contract.id, payload: { dependencies: ['p1'] }, state: { id: 'p1' } },
		context({ signal: controller.signal })
	);
	void pending.catch(() => undefined);
	try {
		await started;
		controller.abort(new DOMException('Disconnected', 'AbortError'));
		await expect.poll(() => taskSignal?.aborted, { timeout: 200 }).toBe(true);
		await expect(pending).rejects.toThrow();
		expect(cleaned).toBe(true);
	} finally {
		markFinished();
		await pending.catch(() => undefined);
	}
});

it.each(['map', 'set'] as const)(
	'publishes the final %s snapshot without replaying superseded deltas',
	async (kind) => {
		const { taskMutation } = await import('../../core/src/runtime/tasks.js');
		const { writeReactiveLazy } = await import('../../core/src/runtime/reactivity.js');
		const writes = [
			{ path: 'selected', kind: 'write', confidence: 'exact', operation: kind },
			{ path: 'selected', kind: 'write', confidence: 'exact' },
			{ path: 'other', kind: 'write', confidence: 'exact', operation: 'map' }
		] as const;
		const spec = { ...contract, dependencies: [], stateReads: [], stateWrites: writes };
		const handler = createExactContinuationHandler(spec, {
			id: spec.id,
			componentId: spec.componentId,
			execute(activation, execution) {
				mutateTaskCollection(
					execution.signal,
					activation.state,
					['selected'],
					kind,
					kind === 'map' ? 'set' : 'add',
					kind === 'map' ? ['obsolete', 1] : ['obsolete']
				);
				taskMutation(execution.signal, () =>
					writeReactiveLazy(activation.state, ['selected'], () =>
						kind === 'map' ? new Map([['fresh', 2]]) : new Set(['fresh'])
					)
				);
				mutateTaskCollection(
					execution.signal,
					activation.state,
					['selected'],
					kind,
					kind === 'map' ? 'set' : 'add',
					kind === 'map' ? ['after', 3] : ['after']
				);
				mutateTaskCollection(execution.signal, activation.state, ['other'], 'map', 'set', [
					'retained',
					4
				]);
				return { state: activation.state };
			}
		});
		const result = await handler(
			{
				type: 'invoke',
				id: spec.id,
				payload: { dependencies: [] },
				state: { selected: kind === 'map' ? new Map() : new Set(), other: new Map() }
			},
			context()
		);
		const selected = (result.state as { selected: Map<string, number> | Set<string> }).selected;
		expect([...selected]).toEqual(
			kind === 'map'
				? [
						['fresh', 2],
						['after', 3]
					]
				: ['fresh', 'after']
		);
		expect(result.mutations).toEqual([
			{ path: 'other', operation: 'map-set', key: 'retained', value: 4 }
		]);
	}
);

it.each(['owned', 'detached', 'separate'] as const)(
	'keeps %s child collection work under its publication owner',
	async (mode) => {
		const { runTaskFrame, captureTaskPropertyMutations, takeTaskPropertyMutations } = await import(
			'@exactjs/core/framework/task-frames'
		);
		const { discardTaskMutations } = await import('@exactjs/core');
		const spec = {
			...contract,
			dependencies: [],
			stateReads: [],
			stateWrites: [
				{ path: 'lookup', kind: 'write', confidence: 'exact', operation: 'map' }
			] as const
		};
		const handler = createExactContinuationHandler(spec, {
			id: spec.id,
			componentId: spec.componentId,
			async execute(activation) {
				await runTaskFrame(
					{ kind: 'child-collection', detached: mode === 'detached' },
					{
						work(child) {
							if (mode === 'separate') captureTaskPropertyMutations(child.signal);
							try {
								mutateTaskCollection(child.signal, activation.state, ['lookup'], 'map', 'set', [
									'child',
									1
								]);
								if (mode !== 'owned')
									expect(takeTaskCollectionMutations(child.signal)).toEqual([
										{ path: 'lookup', operation: 'map-set', key: 'child', value: 1 }
									]);
							} finally {
								takeTaskPropertyMutations(child.signal);
								discardTaskMutations(child.signal);
							}
						}
					}
				);
				return { state: activation.state };
			}
		});
		const result = await handler(
			{ type: 'invoke', id: spec.id, payload: { dependencies: [] }, state: { lookup: new Map() } },
			context()
		);
		expect(result.mutations).toEqual(
			mode === 'owned'
				? [{ path: 'lookup', operation: 'map-set', key: 'child', value: 1 }]
				: undefined
		);
	}
);
