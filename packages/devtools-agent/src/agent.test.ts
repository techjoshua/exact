import { describe, expect, it } from 'vitest';
import type { ExactCdpTransport } from './cdp.js';
import { connectExactDevtoolsAgent } from './agent.js';

describe('eXact CDP agent adapter', () => {
	it('uses fixed call functions, validates methods, and removes bindings on disconnect', async () => {
		const methods: string[] = [];
		const declarations: string[] = [];
		let listener: ((method: string, params: unknown) => void) | undefined;
		const transport: ExactCdpTransport = {
			async request<Result>(method, params = {}) {
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
