import {
	isExactRuntimeInspectionEvent,
	type ExactContextPreview,
	type ExactInspectedMicrofrontend,
	type ExactInspectedPartitionInstance,
	type ExactInspectedRuntimeComponent,
	type ExactInspectionRequest,
	type ExactInspectionResponse,
	type ExactInspectionRuntimeId,
	type ExactRuntimeInspectionEvent,
	type ExactRuntimePartitionPlan,
	type ExactRuntimeSourceLocation,
	type ExactTaskRuntimeSnapshot,
	type ExactValuePreview
} from '@exactjs/devtools-protocol';
import type { ExactExtensionQueryClient } from '../messages.js';

/** Complete data model shared by the component, profiler, and deployment views. */
export type ExactDevtoolsPanelModel = Readonly<{
	sessionId: string;
	components: readonly ExactInspectedRuntimeComponent[];
	partitions: readonly ExactInspectedPartitionInstance[];
	partitionPlans: readonly ExactRuntimePartitionPlan[];
	selected?: ExactInspectedRuntimeComponent;
	state?: Readonly<{ state: ExactValuePreview; props: ExactValuePreview }>;
	contexts: readonly ExactContextPreview[];
	tasks: readonly ExactTaskRuntimeSnapshot[];
	dependency?: unknown;
	timeline: readonly ExactRuntimeInspectionEvent[];
	timelineCursor?: string;
	microfrontends: readonly ExactInspectedMicrofrontend[];
}>;

/** Loads one consistent model entirely through the shared query protocol. */
export async function loadExactDevtoolsPanelModel(
	client: ExactExtensionQueryClient,
	selected?: ExactInspectionRuntimeId
): Promise<ExactDevtoolsPanelModel> {
	const session = await client.connect();
	const components = result<ExactInspectedRuntimeComponent[]>(
		await query(client, session.id, 'components.tree')
	);
	const selectedComponent =
		components.find(
			(component) =>
				component.id.buildKey === selected?.buildKey &&
				component.id.executionRoot === selected.executionRoot &&
				component.id.instanceId === selected.instanceId
		) ?? components[0];
	const identity = selectedComponent?.id;
	const [state, contexts, tasks, timeline, microfrontends, partitions, partitionPlans] =
		await Promise.all([
			identity ? query(client, session.id, 'state.get', identity) : undefined,
			identity ? query(client, session.id, 'contexts.list', identity) : undefined,
			identity ? query(client, session.id, 'tasks.list', identity) : undefined,
			query(client, session.id, 'timeline.query', undefined, { page: { limit: 500 } }),
			query(client, session.id, 'microfrontends.list'),
			query(client, session.id, 'partitions.tree'),
			identity ? query(client, session.id, 'partitions.plan', identity) : undefined
		]);
	const sourceEntityId = selected?.sourceEntityId ?? selectedComponent?.tasks[0]?.id.sourceEntityId;
	const dependency =
		identity && sourceEntityId
			? await query(client, session.id, 'dependencies.explain', {
					...identity,
					sourceEntityId
				})
			: undefined;
	return Object.freeze({
		sessionId: session.id,
		components: Object.freeze(components),
		partitions: Object.freeze(result<ExactInspectedPartitionInstance[]>(partitions)),
		partitionPlans: Object.freeze(
			partitionPlans?.ok ? result<ExactRuntimePartitionPlan[]>(partitionPlans) : []
		),
		...(selectedComponent ? { selected: selectedComponent } : {}),
		...(state
			? { state: result<{ state: ExactValuePreview; props: ExactValuePreview }>(state) }
			: {}),
		contexts: Object.freeze(contexts ? result<ExactContextPreview[]>(contexts) : []),
		tasks: Object.freeze(tasks ? result<ExactTaskRuntimeSnapshot[]>(tasks) : []),
		...(dependency?.ok ? { dependency: result(dependency) } : {}),
		timeline: Object.freeze(result<ExactRuntimeInspectionEvent[]>(timeline)),
		...(timeline.ok && timeline.page?.nextCursor
			? { timelineCursor: timeline.page.nextCursor }
			: {}),
		microfrontends: Object.freeze(result<ExactInspectedMicrofrontend[]>(microfrontends))
	});
}

/**
 * Finalizes a bounded profiler window from retained protocol history after the supplied cursor.
 *
 * Pagination closes subscription-delivery races at recording boundaries. Results remain validated
 * protocol events and never exceed the panel's fixed capture bound.
 */
export async function loadExactProfilerCapture(
	client: ExactExtensionQueryClient,
	cursor?: string,
	maximum = 5_000
): Promise<readonly ExactRuntimeInspectionEvent[]> {
	const events: ExactRuntimeInspectionEvent[] = [];
	let nextCursor = cursor;
	while (events.length < maximum) {
		const response = await query(client, 'profile', 'timeline.query', undefined, {
			page: {
				...(nextCursor ? { cursor: nextCursor } : {}),
				limit: Math.min(500, maximum - events.length)
			}
		});
		if (!response.ok || !Array.isArray(response.result)) break;
		const page = response.result.filter(isExactRuntimeInspectionEvent);
		events.push(...page);
		if (!page.length || !response.page?.nextCursor || response.page.nextCursor === nextCursor)
			break;
		nextCursor = response.page.nextCursor;
	}
	return Object.freeze(events);
}

/** Resolves source only when the selected provider proves an exact hash match. */
export function resolveExactSourceLocation(
	location: ExactRuntimeSourceLocation,
	candidates: readonly Readonly<{
		path: string;
		sourceHash: string;
		source: 'map' | 'workspace' | 'server';
	}>[]
): Readonly<{ path: string; line: number; column: number; source: string }> | undefined {
	const candidate = candidates.find(
		(candidate) => candidate.path === location.path && candidate.sourceHash === location.sourceHash
	);
	return candidate
		? Object.freeze({
				path: location.path,
				line: location.start.line,
				column: location.start.column,
				source: candidate.source
			})
		: undefined;
}

/** Produces a bounded protocol JSON export suitable for issue reports. */
export function exportExactTimeline(
	events: readonly ExactRuntimeInspectionEvent[],
	maximum = 5_000
): string {
	return JSON.stringify(
		Object.freeze({ protocol: 1, events: Object.freeze(events.slice(-maximum)) }),
		null,
		2
	);
}

async function query(
	client: ExactExtensionQueryClient,
	sessionId: string,
	method: ExactInspectionRequest['method'],
	identity?: ExactInspectionRuntimeId,
	params: ExactInspectionRequest['params'] = {}
): Promise<ExactInspectionResponse> {
	return client.request({
		protocol: 1,
		id: `panel:${method}`,
		method,
		params: { ...params, ...(identity ? { identity } : {}) }
	});
}

function result<T = unknown>(response: ExactInspectionResponse): T {
	if (!response.ok) return [] as T;
	return response.result as T;
}
