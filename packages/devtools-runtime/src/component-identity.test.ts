import { expect, it } from 'vitest';
import {
	previewExactValue,
	type ExactInspectedRuntimeComponent,
	type ExactInspectionRuntimeId
} from '@exactjs/devtools-protocol';
import { createExactClientEventStore } from './client-events.js';
import { createExactClientInspectionQueryService } from './query-service.js';

it.each([undefined, 'shop'])(
	'requires component ownership coordinates for browser detail queries (binding=%s)',
	async (binding) => {
		const identity: ExactInspectionRuntimeId = {
			sessionId: 'current-session',
			side: 'client',
			binding,
			buildKey: 'current-build',
			executionRoot: 'page',
			componentTypeId: 'component:Panel',
			instanceId: 'instance'
		};
		let component: ExactInspectedRuntimeComponent = {
			id: identity,
			name: 'Panel',
			status: 'mounted',
			state: previewExactValue(undefined),
			props: previewExactValue(undefined),
			contexts: [],
			tasks: [],
			ownedElements: 1
		};
		const service = createExactClientInspectionQueryService({
			sessionId: 'current-session',
			serverConnected: false,
			events: createExactClientEventStore(100, 100000),
			dom: {
				attach() {},
				detach() {},
				snapshot: () => ({ roots: [], components: [component], partitions: [] }),
				ownerOfElement: () => undefined,
				ownedElements: () => []
			}
		});
		for (const method of ['components.get', 'state.get', 'contexts.list', 'tasks.list'] as const) {
			const query = (selected: ExactInspectionRuntimeId) =>
				service.request({ protocol: 1, id: 'lookup', method, params: { identity: selected } });
			expect((await query(identity)).ok).toBe(true);
			for (const changed of [
				{ sessionId: 'retired-session' },
				{ side: 'server' as const },
				{ binding: 'another-binding' },
				{ componentTypeId: 'component:Other' },
				{ buildKey: 'retired-build' },
				{ executionRoot: 'another-root' },
				{ instanceId: 'another-instance' }
			])
				expect(
					(await query({ ...identity, ...changed })).ok,
					method + ' ' + JSON.stringify(changed)
				).toBe(false);
		}
		component = { ...component, id: { ...identity, sessionId: 'next-session' } };
		const retired = await service.request({
			protocol: 1,
			id: 'retired',
			method: 'components.get',
			params: { identity: component.id }
		});
		expect(retired.ok).toBe(false);
		const tree = await service.request({
			protocol: 1,
			id: 'retired-tree',
			method: 'components.tree'
		});
		expect(tree.ok && tree.result).toEqual([]);
	}
);

it('preserves distinct operation identities in the inspected task tree', async () => {
	const identity: ExactInspectionRuntimeId = {
		sessionId: 'session',
		side: 'client',
		buildKey: 'build',
		executionRoot: 'page',
		componentTypeId: 'component:Panel',
		instanceId: 'instance'
	};
	const tasks = ['first', 'second'].map((operationId) => ({
		id: { ...identity, operationId, generation: 1 },
		activation: 'invoked' as const,
		placement: 'client' as const,
		readiness: 'blocking' as const,
		priority: 'normal' as const,
		concurrency: 'parallel' as const,
		status: 'queued' as const,
		generation: 1,
		pending: 1,
		foreground: true,
		structuralPending: true,
		optimistic: false
	}));
	let component: ExactInspectedRuntimeComponent = {
		id: identity,
		name: 'Panel',
		status: 'mounted',
		state: previewExactValue(undefined),
		props: previewExactValue(undefined),
		contexts: [],
		tasks,
		ownedElements: 0
	};
	const service = createExactClientInspectionQueryService({
		sessionId: 'session',
		serverConnected: false,
		events: createExactClientEventStore(100, 100000),
		dom: {
			attach() {},
			detach() {},
			snapshot: () => ({ roots: [], components: [component], partitions: [] }),
			ownerOfElement: () => undefined,
			ownedElements: () => []
		}
	});
	const response = await service.request({
		protocol: 1,
		id: 'lookup',
		method: 'tasks.getTree',
		params: { identity }
	});
	expect(response.ok).toBe(true);
	const detail = await service.request({
		protocol: 1,
		id: 'detail',
		method: 'tasks.get',
		params: { identity: tasks[1]!.id }
	});
	expect(detail.ok).toBe(true);
	if (detail.ok) expect(detail.result).toBe(tasks[1]);
	if (response.ok) expect(response.result).toHaveLength(2);
	for (const changed of [{ operationId: 'missing' }, { generation: 2 }]) {
		const stale = await service.request({
			protocol: 1,
			id: 'stale',
			method: 'tasks.get',
			params: { identity: { ...tasks[1]!.id, ...changed } }
		});
		expect(stale.ok).toBe(false);
	}
	component = { ...component, tasks: [tasks[0]!, { ...tasks[1]!, parent: tasks[0]!.id }] };
	const nested = await service.request({
		protocol: 1,
		id: 'nested',
		method: 'tasks.getTree',
		params: { identity }
	});
	expect(nested.ok).toBe(true);
	if (nested.ok)
		expect(nested.result).toEqual([
			{ task: tasks[0], children: [{ task: component.tasks[1], children: [] }] }
		]);
	component = {
		...component,
		tasks: [tasks[0]!, { ...tasks[1]!, parent: { ...tasks[0]!.id, binding: 'another-binding' } }]
	};
	const foreign = await service.request({
		protocol: 1,
		id: 'foreign',
		method: 'tasks.getTree',
		params: { identity }
	});
	expect(foreign.ok).toBe(true);
	if (foreign.ok) expect(foreign.result).toHaveLength(2);
	const unselected = await service.request({
		protocol: 1,
		id: 'unselected',
		method: 'tasks.get',
		params: { identity }
	});
	expect(unselected.ok).toBe(false);
});
