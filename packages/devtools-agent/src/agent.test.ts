import { describe, expect, it } from 'vitest';
import type { ExactCdpTransport } from './cdp.js';
import { connectExactDevtoolsAgent } from './agent.js';

describe('eXact CDP agent adapter', () => {
	it('uses fixed call functions, validates methods, and removes bindings on disconnect', async () => {
		const methods: string[] = [];
		const declarations: string[] = [];
		let listener: ((method: string, params: unknown) => void) | undefined;
		const transport: ExactCdpTransport = {
			async request<Result>(method: string, params: Record<string, unknown> = {}) {
				methods.push(method);
				if (method === 'Runtime.evaluate') return { result: { objectId: 'hook-1' } } as Result;
				if (method === 'Runtime.callFunctionOn') {
					declarations.push(String(params.functionDeclaration));
					if (String(params.functionDeclaration).includes('this.connect'))
						return { result: { value: { id: 'session-1' } } } as Result;
					return {
						result: {
							value: {
								protocol: 1,
								id: 'query-1',
								ok: true,
								identity: { sessionId: 'session-1' },
								result: []
							}
						}
					} as Result;
				}
				return {} as Result;
			},
			onEvent(next) {
				listener = next;
				return () => {
					listener = undefined;
				};
			},
			async close() {}
		};
		const agent = await connectExactDevtoolsAgent({ transport });
		const response = await agent.request({
			protocol: 1,
			id: 'query-1',
			method: 'components.tree'
		});
		expect(response.ok).toBe(true);
		expect(() =>
			agent.request({
				protocol: 1,
				id: 'bad',
				method: 'actions.invoke' as never
			})
		).rejects.toThrow('Unknown');
		expect(declarations.every((declaration) => !declaration.includes('components.tree'))).toBe(
			true
		);
		const observed: number[] = [];
		agent.subscribe({ protocol: 1, sessionId: 'session-1' }, (event) =>
			observed.push(event.sequence)
		);
		listener?.('Runtime.bindingCalled', {
			name: '__exactDevtoolsAgentBinding',
			payload: JSON.stringify({
				subscriptionId: 'agent-1',
				event: {
					protocol: 1,
					cursor: '1',
					sequence: 1,
					timestamp: 1,
					kind: 'component.mount',
					id: {
						sessionId: 'other-session',
						side: 'client',
						buildKey: 'build',
						executionRoot: 'page',
						componentTypeId: 'component:Page'
					}
				}
			})
		});
		listener?.('Runtime.bindingCalled', {
			name: '__exactDevtoolsAgentBinding',
			payload: JSON.stringify({
				subscriptionId: 'agent-1',
				event: {
					protocol: 1,
					cursor: '2',
					sequence: 2,
					timestamp: 2,
					kind: 'component.mount',
					id: {
						sessionId: 'session-1',
						side: 'client',
						buildKey: 'build',
						executionRoot: 'page',
						componentTypeId: 'component:Page'
					}
				}
			})
		});
		listener?.('Runtime.bindingCalled', {
			name: '__exactDevtoolsAgentBinding',
			payload: JSON.stringify({
				subscriptionId: 'agent-1',
				event: {
					protocol: 1,
					cursor: '2',
					sequence: 2,
					timestamp: 2,
					kind: 'component.mount',
					id: {
						sessionId: 'session-1',
						side: 'client',
						buildKey: 'build',
						executionRoot: 'page',
						componentTypeId: 'component:Page'
					}
				}
			})
		});
		expect(observed).toEqual([2]);
		await agent.disconnect();
		expect(methods).toContain('Runtime.removeBinding');
		expect(methods).toContain('Runtime.releaseObjectGroup');
		expect(listener).toBeUndefined();
	});
});

function trackedTransport() {
	const calls: string[] = [];
	const counts = { listeners: 0, closed: 0 };
	const transport: ExactCdpTransport = {
		async request<Result>(method: string, params: Record<string, unknown> = {}) {
			calls.push(method);
			if (method === 'Runtime.evaluate') return { result: { objectId: 'hook' } } as Result;
			if (method === 'Runtime.callFunctionOn') {
				const declaration = String(params.functionDeclaration);
				calls.push(declaration);
				if (declaration.includes('this.connect'))
					return { result: { value: { id: 'session' } } } as Result;
				return {
					result: {
						value: {
							protocol: 1,
							id: 'query',
							ok: true,
							identity: { sessionId: 'session' },
							result: []
						}
					}
				} as Result;
			}
			return {} as Result;
		},
		onEvent() {
			counts.listeners++;
			return () => counts.listeners--;
		},
		async close() {
			counts.closed++;
		}
	};
	return { transport, calls, counts };
}

it('allows decorating live agent cleanup without changing subscription or transport ownership', async () => {
	const owner = trackedTransport();
	const agent = await connectExactDevtoolsAgent({ transport: owner.transport });
	const disconnect = agent.disconnect;
	const subscription = agent.subscribe({ protocol: 1, sessionId: 'session' }, () => {});
	const close = subscription.close;
	let closes = 0;
	let disconnects = 0;
	try {
		agent.disconnect = async () => {
			disconnects++;
			await disconnect();
		};
		subscription.close = () => {
			closes++;
			close();
		};
		expect(subscription.closed).toBe(false);
		expect((await agent.request({ protocol: 1, id: 'query', method: 'roots.list' })).ok).toBe(true);
		subscription.close();
		expect(closes).toBe(1);
		expect(subscription.closed).toBe(true);
		await agent.disconnect();
		expect(disconnects).toBe(1);
	} finally {
		close();
		await disconnect();
	}
	expect(owner.calls.filter((call) => call.includes('subscriptions?.get'))).toHaveLength(1);
	expect(owner.calls.filter((call) => call === 'Runtime.removeBinding')).toHaveLength(1);
	expect(owner.calls.filter((call) => call === 'Runtime.releaseObjectGroup')).toHaveLength(1);
	expect(owner.counts).toEqual({ listeners: 0, closed: 1 });
	const next = trackedTransport();
	const following = await connectExactDevtoolsAgent({ transport: next.transport });
	try {
		expect((await following.request({ protocol: 1, id: 'query', method: 'roots.list' })).ok).toBe(
			true
		);
	} finally {
		await following.disconnect();
	}
	expect(next.counts).toEqual({ listeners: 0, closed: 1 });
});

it('returns the same ordinary cleanup contract for a valid subscription after disconnect', async () => {
	const owner = trackedTransport();
	const agent = await connectExactDevtoolsAgent({ transport: owner.transport });
	try {
		await agent.disconnect();
		const calls = owner.calls.length;
		const subscription = agent.subscribe({ protocol: 1, sessionId: 'session' }, () => {});
		const close = subscription.close;
		let decorated = 0;
		subscription.close = () => {
			decorated++;
			close();
		};
		expect(subscription.closed).toBe(true);
		subscription.close();
		subscription.close();
		expect(decorated).toBe(2);
		expect(owner.calls).toHaveLength(calls);
		expect(owner.counts).toEqual({ listeners: 0, closed: 1 });
	} finally {
		await agent.disconnect();
	}
});
