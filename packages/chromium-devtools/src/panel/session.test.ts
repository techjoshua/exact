import type {
	ExactInspectionRequest,
	ExactInspectionResponse,
	ExactRuntimeInspectionEvent
} from '@exactjs/devtools-protocol';
import { describe, expect, it, vi } from 'vitest';
import type { ExactExtensionQueryClient } from '../messages.js';
import { createExactDevtoolsPanelSession } from './session.js';

describe('Chromium panel session ownership', () => {
	it('uses the shared protocol and closes subscriptions and the bridge on disposal', async () => {
		let listener: ((event: ExactRuntimeInspectionEvent) => void) | undefined;
		const close = vi.fn(async () => {});
		const disconnect = vi.fn(async () => {});
		const onEvent = vi.fn();
		const subscribe = vi.fn(async (_sessionId, _cursor, next) => {
			listener = next;
			return { close };
		});
		const client: ExactExtensionQueryClient = {
			onStatus: () => () => {},
			connect: async () => ({ id: 'session' }),
			request: async (request) => response(request),
			subscribe,
			disconnect,
			highlight: async () => {}
		};
		const session = createExactDevtoolsPanelSession(client, onEvent);
		const model = await session.load();
		expect(model.components).toHaveLength(1);
		expect(subscribe).toHaveBeenCalledWith('session', 'm2:timeline', expect.any(Function));
		listener?.(event());
		expect(onEvent).toHaveBeenCalledOnce();
		session.reset();
		await session.load();
		expect(subscribe).toHaveBeenCalledTimes(2);

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
		result,
		...(request.method === 'timeline.query'
			? { page: { count: 0, nextCursor: 'm2:timeline' } }
			: {})
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
