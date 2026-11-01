import { expect, it } from 'vitest';
import {
	paginateExactInspection,
	type ExactInspectionExecutionRoot
} from '@exactjs/devtools-protocol';
import { createExactClientInspectionQueryService } from './query-service.js';
import { createExactClientEventStore } from './client-events.js';

it('pages the combined roots without skipping or duplicating independently paged server records', async () => {
	const client: ExactInspectionExecutionRoot = {
		side: 'client',
		buildKey: 'client-build',
		executionRoot: 'client-root',
		status: 'available',
		components: 1
	};
	const servers = ['first', 'second', 'third'].map((executionRoot) => ({
		...client,
		side: 'server' as const,
		buildKey: 'server-build',
		executionRoot
	}));
	const service = createExactClientInspectionQueryService({
		sessionId: 'session',
		serverConnected: true,
		events: createExactClientEventStore(100, 100000),
		dom: {
			attach() {},
			detach() {},
			snapshot: () => ({ roots: [client], components: [], partitions: [] }),
			ownerOfElement: () => undefined,
			ownedElements: () => []
		},
		server: {
			open: async () => undefined,
			close: async () => {},
			async query(_session, request) {
				const page = paginateExactInspection(servers, request.params?.page);
				return {
					protocol: 1,
					id: request.id,
					ok: true,
					identity: { sessionId: 'session' },
					result: page.values,
					page: { count: page.values.length, nextCursor: page.nextCursor }
				};
			}
		}
	});
	const first = await service.request({
		protocol: 1,
		id: 'first',
		method: 'roots.list',
		params: { page: { limit: 2 } }
	});
	expect(first.ok && first.result).toEqual([client, servers[0]]);
	expect(first.ok && first.page?.nextCursor).toBeDefined();
	const second = await service.request({
		protocol: 1,
		id: 'second',
		method: 'roots.list',
		params: { page: { limit: 2, cursor: first.ok ? first.page?.nextCursor : undefined } }
	});
	expect(second.ok && second.result).toEqual(servers.slice(1));
	expect(second.ok && second.page?.nextCursor).toBeUndefined();
});
