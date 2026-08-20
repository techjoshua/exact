import type {
	ExactInspectionRequest,
	ExactRuntimeInspectionEvent
} from '@exactjs/devtools-protocol';
import { describe, expect, it } from 'vitest';
import { createExactClientEventStore } from './client-events.js';
import { createExactClientInspectionQueryService } from './query-service.js';

describe('shared client/server inspection query service', () => {
	it('pages client-aggregated client and server observations with one browser cursor', async () => {
		const events = createExactClientEventStore(100, 100_000);
		events.publish(event('client', 1));
		events.publish(event('server', 1));
		events.publish(event('client', 2));
		events.publish(event('server', 2));
		const service = createExactClientInspectionQueryService({
			sessionId: 'session',
			dom: {
				attach() {},
				detach() {},
				snapshot: () => ({ roots: [], components: [], partitions: [] }),
				ownerOfElement: () => undefined,
				ownedElements: () => []
			},
			events,
			serverConnected: false
		});

		const first = await service.request(timeline('first', undefined));
		const firstEvents = first.ok ? (first.result as ExactRuntimeInspectionEvent[]) : [];
		expect(firstEvents.map((entry) => entry.id.side)).toEqual(['client', 'server']);
		const second = await service.request(
			timeline('second', first.ok ? first.page?.nextCursor : undefined)
		);
		const secondEvents = second.ok ? (second.result as ExactRuntimeInspectionEvent[]) : [];
		expect(secondEvents.map((entry) => [entry.id.side, entry.sequence])).toEqual([
			['client', 3],
			['server', 4]
		]);
	});

	it('keeps page, branding, and billing cursors and subscriptions independent', async () => {
		const events = createExactClientEventStore(100, 100_000);
		events.publish(event('client', 1));
		events.publish(hostEvent('page', 1));
		events.publish(hostEvent('branding', 1));
		events.publish(hostEvent('billing', 1));
		const roots = [
			{
				side: 'client' as const,
				buildKey: 'page-build',
				executionRoot: 'page',
				status: 'available' as const,
				components: 1
			},
			{
				side: 'client' as const,
				binding: 'branding',
				buildKey: 'branding-build',
				executionRoot: 'branding-root',
				status: 'available' as const,
				components: 1
			},
			{
				side: 'client' as const,
				binding: 'billing',
				buildKey: 'billing-build',
				executionRoot: 'billing-root',
				status: 'available' as const,
				components: 1
			}
		];
		const requested: string[] = [];
		const service = createExactClientInspectionQueryService({
			sessionId: 'session',
			dom: {
				attach() {},
				detach() {},
				snapshot: () => ({ roots, components: [], partitions: [] }),
				ownerOfElement: () => undefined,
				ownedElements: () => []
			},
			events,
			serverConnected: true,
			server: {
				open: async () => undefined,
				async query(_sessionId, request) {
					const binding =
						request.params?.filter?.binding ?? request.params?.identity?.binding ?? 'page';
					requested.push(`${binding}:${request.params?.page?.cursor ?? '-'}`);
					return {
						protocol: 1,
						id: request.id,
						ok: true,
						identity: { sessionId: 'session' },
						result: [hostEvent(binding, request.params?.page?.cursor ? 2 : 1)]
					};
				},
				close: async () => {}
			}
		});

		const first = await service.request(timeline('first', undefined, 4));
		const firstEvents = first.ok ? (first.result as ExactRuntimeInspectionEvent[]) : [];
		expect(firstEvents.map((entry) => entry.id.binding ?? entry.id.side)).toEqual([
			'client',
			'server',
			'branding',
			'billing'
		]);
		events.publish(hostEvent('branding', 2));
		const second = await service.request(
			timeline('second', first.ok ? first.page?.nextCursor : undefined, 4)
		);
		expect(
			second.ok && (second.result as ExactRuntimeInspectionEvent[]).map((entry) => entry.id.binding)
		).toEqual(['branding']);
		const tree = await service.request({
			protocol: 1,
			id: 'tree',
			method: 'components.tree'
		});
		expect(
			tree.ok &&
				(tree.result as ExactRuntimeInspectionEvent[]).map(
					(entry) => entry.id.binding ?? entry.id.side
				)
		).toEqual(['server', 'branding', 'billing']);
		expect(requested).toEqual(['page:-', 'branding:-', 'billing:-']);

		const delivered: ExactRuntimeInspectionEvent[] = [];
		const subscription = service.subscribe(
			{ protocol: 1, sessionId: 'session', cursor: '5' },
			(event) => delivered.push(event)
		);
		events.publish(hostEvent('billing', 3));
		expect(delivered.map((entry) => entry.id.binding)).toEqual(['billing']);
		subscription.close();
		events.publish(hostEvent('billing', 4));
		expect(delivered).toHaveLength(1);
	});

	it('exposes the bounded live partition instance tree', async () => {
		const partitions = [
			{
				executionRoot: 'page',
				buildKey: 'build',
				plan: 'summary-edge',
				ownerComponentId: 'Workspace',
				discriminator: { kind: 'single' as const },
				generation: 1,
				host: 'server' as const,
				children: []
			}
		];
		const service = createExactClientInspectionQueryService({
			sessionId: 'session',
			dom: {
				attach() {},
				detach() {},
				snapshot: () => ({ roots: [], components: [], partitions }),
				ownerOfElement: () => undefined,
				ownedElements: () => []
			},
			events: createExactClientEventStore(10, 10_000),
			serverConnected: false
		});

		const response = await service.request({
			protocol: 1,
			id: 'partitions',
			method: 'partitions.tree'
		});
		expect(response.ok && response.result).toEqual(partitions);
	});
});

function timeline(id: string, cursor: string | undefined, limit = 2): ExactInspectionRequest {
	return {
		protocol: 1,
		id,
		method: 'timeline.query',
		params: { page: { limit, ...(cursor ? { cursor } : {}) } }
	};
}

function event(side: 'client' | 'server', sequence: number): ExactRuntimeInspectionEvent {
	return Object.freeze({
		protocol: 1,
		cursor: sequence.toString(36),
		sequence,
		timestamp: sequence,
		kind: 'component.mount',
		id: Object.freeze({
			sessionId: 'session',
			side,
			buildKey: `${side}-build`,
			executionRoot: 'page',
			componentTypeId: 'component:Page',
			instanceId: `${side}-${sequence}`
		})
	});
}

function hostEvent(binding: string, sequence: number): ExactRuntimeInspectionEvent {
	return Object.freeze({
		...event('server', sequence),
		id: Object.freeze({
			...event('server', sequence).id,
			buildKey: `${binding}-build`,
			executionRoot: `${binding}-root`,
			...(binding === 'page' ? {} : { binding })
		})
	});
}
