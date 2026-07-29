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
});

function timeline(id: string, cursor: string | undefined): ExactInspectionRequest {
	return {
		protocol: 1,
		id,
		method: 'timeline.query',
		params: { page: { limit: 2, ...(cursor ? { cursor } : {}) } }
	};
}

function event(
	side: 'client' | 'server',
	sequence: number
): ExactRuntimeInspectionEvent {
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
