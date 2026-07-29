import type {
	ExactInspectedMicrofrontend,
	ExactInspectedRuntimeComponent,
	ExactInspectionRequest,
	ExactInspectionResponse,
	ExactInspectionRuntimeId,
	ExactRuntimeInspectionEvent,
	ExactRuntimeSourceLocation
} from '@exactjs/devtools-protocol';
import type { ExactExtensionQueryClient } from './messages.js';

/** Complete data model rendered by the six initial Chromium panel projections. */
export type ExactDevtoolsPanelModel = Readonly<{
	sessionId: string;
	components: readonly ExactInspectedRuntimeComponent[];
	selected?: ExactInspectedRuntimeComponent;
	state?: unknown;
	contexts: readonly unknown[];
	tasks: readonly unknown[];
	actions: readonly unknown[];
	dependency?: unknown;
	timeline: readonly ExactRuntimeInspectionEvent[];
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
	const [state, contexts, tasks, actions, timeline, microfrontends] = await Promise.all([
		identity ? query(client, session.id, 'state.get', identity) : undefined,
		identity ? query(client, session.id, 'contexts.list', identity) : undefined,
		identity ? query(client, session.id, 'tasks.list', identity) : undefined,
		identity ? query(client, session.id, 'actions.list', identity) : undefined,
		query(client, session.id, 'timeline.query', undefined, { page: { limit: 500 } }),
		query(client, session.id, 'microfrontends.list')
	]);
	const sourceEntityId =
		selected?.sourceEntityId ??
		selectedComponent?.tasks[0]?.id.sourceEntityId ??
		selectedComponent?.actions[0]?.id.sourceEntityId;
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
		...(selectedComponent ? { selected: selectedComponent } : {}),
		...(state ? { state: result(state) } : {}),
		contexts: Object.freeze(contexts ? result<unknown[]>(contexts) : []),
		tasks: Object.freeze(tasks ? result<unknown[]>(tasks) : []),
		actions: Object.freeze(actions ? result<unknown[]>(actions) : []),
		...(dependency?.ok ? { dependency: result(dependency) } : {}),
		timeline: Object.freeze(result<ExactRuntimeInspectionEvent[]>(timeline)),
		microfrontends: Object.freeze(result<ExactInspectedMicrofrontend[]>(microfrontends))
	});
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
