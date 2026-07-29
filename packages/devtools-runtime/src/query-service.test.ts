import type {
	ExactInspectionRequest,
	ExactRuntimeInspectionEvent
} from '@exactjs/devtools-protocol';
import { describe, expect, it } from 'vitest';
import { createExactClientEventStore } from './client-events.js';
import { createExactClientInspectionQueryService } from './query-service.js';

describe('shared client/server inspection query service', () => {
	it('merges host timelines without inventing wall-clock order and resumes each cursor', async () => {
		const events = createExactClientEventStore(100, 100_000);
		events.publish(event('client', 1));
		events.publish(event('client', 2));
		const serverEvents = [event('server', 1), event('server', 2)];
		const serverCursors: Array<string | undefined> = [];
		const service = createExactClientInspectionQueryService({
			sessionId: 'session',
			dom: {
				attach() {},
				detach() {},
				snapshot: () => ({ roots: [], components: [] }),
				ownerOfElement: () => undefined,
				ownedElements: () => []
			},
			events,
			correlations: [],
			serverConnected: true,
			server: {
				open: async () => undefined,
				async query(_sessionId, request) {
					const cursor = request.params?.page?.cursor;
					serverCursors.push(cursor);
					const offset = cursor ? Number.parseInt(cursor, 36) : 0;
					const result = serverEvents.filter((entry) => entry.sequence > offset);
					return {
						protocol: 1,
						id: request.id,
						ok: true,
						identity: { sessionId: 'session' },
						result,
						page: { nextCursor: result.at(-1)?.cursor, count: result.length }
					};
				},
				subscribe: () => ({ closed: false, close() {} }),
				close: async () => {}
			}
		});

		const first = await service.request(timeline('first', undefined));
		const firstEvents = first.ok ? (first.result as ExactRuntimeInspectionEvent[]) : [];
		expect(firstEvents.map((entry) => entry.id.side)).toEqual(['client', 'server']);
		const second = await service.request(
			timeline('second', first.ok ? first.page?.nextCursor : undefined)
		);
		const secondEvents = second.ok ? (second.result as ExactRuntimeInspectionEvent[]) : [];
		expect(secondEvents.map((entry) => [entry.id.side, entry.sequence])).toEqual([
			['client', 2],
			['server', 2]
		]);
		expect(serverCursors).toEqual([undefined, '1']);
	});

	it('keeps page, branding, and billing cursors and subscriptions independent', async () => {
		const events = createExactClientEventStore(100, 100_000);
		events.publish(event('client', 1));
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
		const subscriptions: string[] = [];
		let closed = 0;
		const service = createExactClientInspectionQueryService({
			sessionId: 'session',
			dom: {
				attach() {},
				detach() {},
				snapshot: () => ({ roots, components: [] }),
				ownerOfElement: () => undefined,
				ownedElements: () => []
			},
			events,
			correlations: [],
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
				subscribe(request) {
					subscriptions.push(request.filter?.binding ?? 'page');
					return {
						closed: false,
						close() {
							closed++;
						}
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
		const second = await service.request(
			timeline('second', first.ok ? first.page?.nextCursor : undefined, 4)
		);
		expect(second.ok).toBe(true);
		expect(requested).toEqual([
			'page:-',
			'branding:-',
			'billing:-',
			'page:1',
			'branding:1',
			'billing:1'
		]);
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

		const subscription = service.subscribe({ protocol: 1, sessionId: 'session' }, () => {});
		expect(subscriptions).toEqual(['page', 'branding', 'billing']);
		subscription.close();
		expect(closed).toBe(3);
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
