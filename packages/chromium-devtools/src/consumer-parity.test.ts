import { connectExactDevtoolsAgent, type ExactCdpTransport } from '@exactjs/devtools-agent';
import type { ExactInspectionRequest, ExactInspectionResponse } from '@exactjs/devtools-protocol';
import { describe, expect, it } from 'vitest';
import type { ExactExtensionQueryClient } from './messages.js';
import { loadExactDevtoolsPanelModel } from './panel-model.js';

describe('human and agent protocol parity', () => {
	it('returns the same validated component projection to the panel and CDP agent', async () => {
		const client: ExactExtensionQueryClient = {
			connect: async () => ({ id: 'session' }),
			request: async (request) => response(request),
			subscribe: async () => ({ close: async () => {} }),
			disconnect: async () => {},
			highlight: async () => {}
		};
		const panel = await loadExactDevtoolsPanelModel(client);
		const transport: ExactCdpTransport = {
			async request<Result>(method: string, params: Record<string, unknown> = {}) {
				if (method === 'Runtime.evaluate') return { result: { objectId: 'hook' } } as Result;
				if (method === 'Runtime.callFunctionOn') {
					const declaration = String(params.functionDeclaration);
					if (declaration.includes('this.connect'))
						return { result: { value: { id: 'session' } } } as Result;
					const request = (params.arguments as Array<{ value: ExactInspectionRequest }>)?.[0]
						?.value;
					return { result: { value: request ? response(request) : undefined } } as Result;
				}
				return {} as Result;
			},
			onEvent() {
				return () => {};
			},
			async close() {}
		};
		const agent = await connectExactDevtoolsAgent({ transport });
		const agentProjection = await agent.request({
			protocol: 1,
			id: 'agent:components.tree',
			method: 'components.tree'
		});

		expect(agentProjection.ok).toBe(true);
		expect(agentProjection.ok && agentProjection.result).toEqual(panel.components);
		await agent.disconnect();
	});
});

function response(request: ExactInspectionRequest): ExactInspectionResponse {
	const result =
		request.method === 'components.tree'
			? [
					{
						id: {
							sessionId: 'session',
							side: 'client' as const,
							buildKey: 'a'.repeat(40),
							executionRoot: 'page',
							componentTypeId: 'component:Page',
							instanceId: 'instance'
						},
						name: 'Page',
						status: 'mounted' as const,
						props: { kind: 'object' as const, type: 'Object', entries: [], truncated: false },
						state: { kind: 'object' as const, type: 'Object', entries: [], truncated: false },
						contexts: [],
						tasks: [],
						actions: [],
						ownedElements: 1
					}
				]
			: request.method === 'state.get'
				? { state: {}, props: {} }
				: [];
	return {
		protocol: 1,
		id: request.id,
		ok: true,
		identity: { sessionId: 'session' },
		result
	};
}
