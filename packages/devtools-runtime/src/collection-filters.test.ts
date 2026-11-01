import { expect, it } from 'vitest';
import {
	previewExactValue,
	type ExactInspectionFilter,
	type ExactInspectionExecutionRoot,
	type ExactInspectedRuntimeComponent
} from '@exactjs/devtools-protocol';
import { createExactClientEventStore } from './client-events.js';
import { createExactClientInspectionQueryService } from './query-service.js';

it('filters browser ownership before paginating component and root collections', async () => {
	const root: ExactInspectionExecutionRoot = {
		side: 'client',
		binding: 'shop',
		buildKey: 'build',
		executionRoot: 'page',
		status: 'available',
		components: 1
	};
	const component: ExactInspectedRuntimeComponent = {
		id: { sessionId: 'session', ...root, componentTypeId: 'Panel', instanceId: 'panel' },
		name: 'Panel',
		status: 'mounted',
		state: previewExactValue(undefined),
		props: previewExactValue(undefined),
		contexts: [],
		tasks: [],
		ownedElements: 1
	};
	const otherRoot = {
		...root,
		binding: 'other',
		buildKey: 'other-build',
		executionRoot: 'other-root'
	};
	const other = {
		...component,
		id: { ...component.id, ...otherRoot, componentTypeId: 'Other', instanceId: 'other' }
	};
	const service = createExactClientInspectionQueryService({
		sessionId: 'session',
		serverConnected: false,
		events: createExactClientEventStore(100, 100000),
		dom: {
			attach() {},
			detach() {},
			snapshot: () => ({
				roots: [otherRoot, root],
				components: [other, component],
				partitions: []
			}),
			ownerOfElement: () => undefined,
			ownedElements: () => []
		}
	});
	for (const method of ['components.tree', 'roots.list', 'microfrontends.list'] as const) {
		const query = (filter?: ExactInspectionFilter) =>
			service.request({ protocol: 1, id: 'tree', method, params: { filter, page: { limit: 1 } } });
		const selected = await query({ binding: 'shop' });
		expect(selected.ok).toBe(true);
		if (selected.ok) {
			expect(selected.result).toHaveLength(1);
			expect(selected.result).toEqual(
				method === 'components.tree'
					? [component]
					: method === 'roots.list'
						? [root]
						: [expect.objectContaining({ binding: 'shop' })]
			);
			expect(selected.page?.nextCursor).toBeUndefined();
		}
		for (const filter of [
			{ binding: 'missing' },
			{ buildKey: 'missing' },
			{ executionRoot: 'missing' },
			{ side: 'server' as const }
		]) {
			const absent = await query(filter);
			expect(absent.ok && absent.result, method + JSON.stringify(filter)).toEqual([]);
		}
		const all = await query();
		expect(all.ok && all.page?.nextCursor).toBeDefined();
	}
	for (const filter of [{ componentTypeId: 'Panel' }, { instanceId: 'panel' }]) {
		const selected = await service.request({
			protocol: 1,
			id: 'component',
			method: 'components.tree',
			params: { filter }
		});
		expect(selected.ok && selected.result).toEqual([component]);
	}
	for (const filter of [{ componentTypeId: 'missing' }, { instanceId: 'missing' }]) {
		const selected = await service.request({
			protocol: 1,
			id: 'component',
			method: 'components.tree',
			params: { filter }
		});
		expect(selected.ok && selected.result).toEqual([]);
	}
});
