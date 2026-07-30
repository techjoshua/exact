import type {
	ExactInspectionRequest,
	ExactInspectionResponse,
	ExactRuntimeInspectionEvent
} from '@exactjs/devtools-protocol';
import { describe, expect, it, vi } from 'vitest';
import type { ExactExtensionQueryClient } from './messages.js';
import { createExactDevtoolsPanelSession } from './panel-session.js';

describe('Chromium panel session ownership', () => {
	it('uses the shared protocol and closes subscriptions and the bridge on disposal', async () => {
		let listener: ((event: ExactRuntimeInspectionEvent) => void) | undefined;
		const close = vi.fn(async () => {});
		const disconnect = vi.fn(async () => {});
		const onEvent = vi.fn();
		const client: ExactExtensionQueryClient = {
			connect: async () => ({ id: 'session' }),
			request: async (request) => response(request),
			async subscribe(_sessionId, _cursor, next) {
				listener = next;
				return { close };
			},
			disconnect,
			highlight: async () => {}
		};
		const session = createExactDevtoolsPanelSession(client, onEvent);
		const model = await session.load();
		expect(model.components).toHaveLength(1);
		listener?.(event());
		expect(onEvent).toHaveBeenCalledOnce();

		await session.dispose();
		expect(close).toHaveBeenCalledOnce();
		expect(disconnect).toHaveBeenCalledOnce();
	});
});

function response(request: ExactInspectionRequest): ExactInspectionResponse {
	const result =
		request.method === 'components.tree'
			? [
					{
						id: {
							sessionId: 'session',
							side: 'client',
							buildKey: 'a'.repeat(40),
							executionRoot: 'page',
							componentTypeId: 'component:Page',
							instanceId: 'instance'
						},
						name: 'Page',
						status: 'mounted',
						props: { kind: 'object', type: 'Object', entries: [], truncated: false },
						state: { kind: 'object', type: 'Object', entries: [], truncated: false },
						contexts: [],
						tasks: [],
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

function event(): ExactRuntimeInspectionEvent {
	return {
		protocol: 1,
		cursor: '1',
		sequence: 1,
		timestamp: 1,
		kind: 'component.mount',
		id: {
			sessionId: 'session',
			side: 'client',
			buildKey: 'a'.repeat(40),
			executionRoot: 'page',
			componentTypeId: 'component:Page'
		}
	};
}
