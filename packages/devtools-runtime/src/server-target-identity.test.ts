import { expect, it } from 'vitest';
import type {
	ExactInspectionExecutionRoot,
	ExactInspectionRequest
} from '@exactjs/devtools-protocol';
import { createExactClientEventStore } from './client-events.js';
import { createExactClientInspectionQueryService } from './query-service.js';

it('keeps delimiter-containing host coordinates independent while deduplicating repeated roots', async () => {
	const first: ExactInspectionExecutionRoot = {
		side: 'server',
		binding: 'shop:a',
		buildKey: 'b',
		executionRoot: 'c',
		status: 'available',
		components: 1
	};
	const second: ExactInspectionExecutionRoot = { ...first, binding: 'shop', buildKey: 'a:b' };
	const queries: ExactInspectionRequest[] = [];
	const service = createExactClientInspectionQueryService({
		sessionId: 'session',
		serverConnected: true,
		events: createExactClientEventStore(100, 100000),
		dom: {
			attach() {},
			detach() {},
			snapshot: () => ({ roots: [first, second, first], components: [], partitions: [] }),
			ownerOfElement: () => undefined,
			ownedElements: () => []
		},
		server: {
			open: async () => undefined,
			close: async () => {},
			async query(_session, request) {
				queries.push(request);
				return {
					protocol: 1,
					id: request.id,
					ok: true,
					identity: { sessionId: 'session' },
					result: []
				};
			}
		}
	});
	const response = await service.request({
		protocol: 1,
		id: 'hosts',
		method: 'components.tree',
		params: { filter: { side: 'server' }, page: { limit: 10 } }
	});
	expect(response.ok).toBe(true);
	expect(
		queries
			.filter((query) => query.params?.identity?.binding)
			.map((query) => [query.params?.identity?.binding, query.params?.identity?.buildKey])
	).toEqual([
		['shop:a', 'b'],
		['shop', 'a:b']
	]);
});
