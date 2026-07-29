import {
	isExactRuntimeInspectionEvent,
	paginateExactInspection,
	parseExactInspectionRequest,
	parseExactInspectionSubscription,
	type ExactInspectionQueryService,
	type ExactInspectionRequest,
	type ExactInspectionResponse,
	type ExactInspectionRuntimeId,
	type ExactInspectionSubscription,
	type ExactInspectionSubscriptionHandle,
	type ExactInspectedRuntimeComponent,
	type ExactRuntimeInspectionEvent
} from '@exactjs/devtools-protocol';
import type { ExactDomInspectionHost } from '@exactjs/dom';
import type { ExactClientSourceCorrelation } from './contracts.js';
import type { ExactClientEventStore } from './client-events.js';
import type { ExactBrowserServerInspectionClient } from './server-client.js';

/** Inputs retained by the shared page query service while one session is attached. */
export type ExactClientQueryServiceOptions = Readonly<{
	sessionId: string;
	dom: ExactDomInspectionHost;
	events: ExactClientEventStore;
	correlations: readonly ExactClientSourceCorrelation[];
	server?: ExactBrowserServerInspectionClient;
	serverConnected: boolean;
	maxResults?: number;
}>;

/** Creates the canonical service shared by the panel model and agent bridge. */
export function createExactClientInspectionQueryService(
	options: ExactClientQueryServiceOptions
): ExactInspectionQueryService {
	const maxResults = options.maxResults ?? 500;
	const service: ExactInspectionQueryService = {
		async request(untrusted) {
			let request: ExactInspectionRequest;
			try {
				request = parseExactInspectionRequest(untrusted, { maxResults });
			} catch (error) {
				return failure(requestId(untrusted), 'bad-request', error);
			}
			const snapshot = correlatedSnapshot(options.dom.snapshot().components, options.correlations);
			const serverOwned =
				request.params?.identity?.side === 'server' &&
				options.serverConnected &&
				options.server;
			if (
				serverOwned &&
				[
					'components.get',
					'state.get',
					'contexts.list',
					'tasks.list',
					'tasks.get',
					'actions.list',
					'actions.get'
				].includes(request.method)
			)
				return options.server!.query(options.sessionId, request);
			switch (request.method) {
				case 'roots.list':
					return mergedServerCollection(
						request,
						options,
						options.dom.snapshot().roots,
						maxResults
					);
				case 'microfrontends.list':
					return collection(
						request,
						options.sessionId,
						options.dom
							.snapshot()
							.roots.filter((root) => root.binding)
							.map((root) => ({
								binding: root.binding,
								buildKey: root.buildKey,
								executionRoots: [root.executionRoot],
								mounted: true,
								clientStatus: 'available',
								serverStatus: options.serverConnected ? 'available' : 'disconnected',
								eventStream: options.serverConnected ? 'connected' : 'disconnected'
							})),
						maxResults
					);
				case 'components.tree':
					return mergedServerCollection(request, options, snapshot, maxResults);
				case 'components.get':
					return componentResponse(request, options.sessionId, snapshot, (component) => component);
				case 'state.get':
					return componentResponse(request, options.sessionId, snapshot, (component) => ({
						state: component.state,
						props: component.props
					}));
				case 'contexts.list':
					return componentResponse(request, options.sessionId, snapshot, (component) =>
						component.contexts
					);
				case 'tasks.list':
					return componentResponse(request, options.sessionId, snapshot, (component) =>
						component.tasks
					);
				case 'tasks.get':
					return nestedResponse(request, options.sessionId, snapshot, 'tasks');
				case 'actions.list':
					return componentResponse(request, options.sessionId, snapshot, (component) =>
						component.actions
					);
				case 'actions.get':
					return nestedResponse(request, options.sessionId, snapshot, 'actions');
				case 'timeline.query':
					return mergedTimeline(request, options, maxResults);
				case 'errors.list':
					return mergedTimeline(request, options, maxResults, true);
				case 'components.ownerOfElement':
					return failure(request.id, 'bad-request', 'use the fixed page-hook element bridge');
				default:
					return options.serverConnected && options.server
						? options.server.query(options.sessionId, request)
						: failure(request.id, 'unavailable', 'server cooperation unavailable');
			}
		},
		subscribe(request, listener) {
			try {
				request = parseExactInspectionSubscription(request);
			} catch {
				return closedSubscription();
			}
			if (request.sessionId !== options.sessionId) return closedSubscription();
			let closed = false;
			const cursors = splitHostCursor(request.cursor);
			const unsubscribe = options.events.subscribe(cursors.client, request.filter, listener);
			const { cursor: _cursor, ...subscription } = request;
			const remote =
				options.serverConnected && options.server
					? options.server.subscribe(
							{
								...subscription,
								...(cursors.server ? { cursor: cursors.server } : {})
							},
							listener
						)
					: undefined;
			return Object.freeze({
				get closed() {
					return closed;
				},
				close() {
					if (closed) return;
					closed = true;
					unsubscribe();
					remote?.close();
				}
			});
		}
	};
	return Object.freeze(service);
}

async function mergedTimeline(
	request: ExactInspectionRequest,
	options: ExactClientQueryServiceOptions,
	maximum: number,
	errorsOnly = false
): Promise<ExactInspectionResponse> {
	const cursors = splitHostCursor(request.params?.page?.cursor);
	const filter = errorsOnly
		? { ...request.params?.filter, kinds: ['error'] }
		: request.params?.filter;
	const clientEvents = options.events.query(cursors.client, filter);
	let serverEvents: readonly ExactRuntimeInspectionEvent[] = [];
	let serverCursor = cursors.server;
	let remoteNextCursor: string | undefined;
	if (options.serverConnected && options.server) {
		try {
			const remote = await options.server.query(options.sessionId, {
				...request,
				params: {
					...request.params,
					filter,
					page: {
						limit: maximum,
						...(cursors.server ? { cursor: cursors.server } : {})
					}
				}
			});
			if (remote.ok && Array.isArray(remote.result)) {
				serverEvents = remote.result.filter(isExactRuntimeInspectionEvent);
				remoteNextCursor = remote.page?.nextCursor;
			}
		} catch {
			// Preserve the attached client branch when server cooperation disappears.
		}
	}
	const limit = Math.min(request.params?.page?.limit ?? 100, maximum);
	const selected: ExactRuntimeInspectionEvent[] = [];
	let clientIndex = 0;
	let serverIndex = 0;
	let clientCursor = cursors.client;
	while (
		selected.length < limit &&
		(clientIndex < clientEvents.length || serverIndex < serverEvents.length)
	) {
		if (clientIndex < clientEvents.length && selected.length < limit) {
			const event = clientEvents[clientIndex++]!;
			selected.push(event);
			clientCursor = event.cursor;
		}
		if (serverIndex < serverEvents.length && selected.length < limit) {
			const event = serverEvents[serverIndex++]!;
			selected.push(event);
			serverCursor = event.cursor;
		}
	}
	const hasMore = clientIndex < clientEvents.length || serverIndex < serverEvents.length;
	if (!serverEvents.length && remoteNextCursor) serverCursor = remoteNextCursor;
	const nextCursor =
		selected.length || hasMore
			? joinHostCursor(clientCursor, serverCursor)
			: request.params?.page?.cursor;
	return success(
		request,
		options.sessionId,
		Object.freeze(selected),
		nextCursor
	);
}

function splitHostCursor(cursor: string | undefined): {
	client?: string;
	server?: string;
} {
	if (!cursor?.startsWith('m:')) return cursor ? { client: cursor, server: cursor } : {};
	const [, client = '', server = ''] = cursor.split(':', 3);
	return {
		...(client && client !== '-' ? { client: decodeURIComponent(client) } : {}),
		...(server && server !== '-' ? { server: decodeURIComponent(server) } : {})
	};
}

function joinHostCursor(client: string | undefined, server: string | undefined): string {
	return `m:${client ? encodeURIComponent(client) : '-'}:${server ? encodeURIComponent(server) : '-'}`;
}

async function mergedServerCollection(
	request: ExactInspectionRequest,
	options: ExactClientQueryServiceOptions,
	clientValues: readonly unknown[],
	maximum: number
): Promise<ExactInspectionResponse> {
	let serverValues: readonly unknown[] = [];
	if (options.serverConnected && options.server) {
		try {
			const remote = await options.server.query(options.sessionId, request);
			if (remote.ok && Array.isArray(remote.result)) serverValues = remote.result;
		} catch {
			// Client inspection remains available when server cooperation disconnects.
		}
	}
	return collection(
		request,
		options.sessionId,
		Object.freeze([...clientValues, ...serverValues]),
		maximum
	);
}

function correlatedSnapshot(
	components: readonly ExactInspectedRuntimeComponent[],
	correlations: readonly ExactClientSourceCorrelation[]
): readonly ExactInspectedRuntimeComponent[] {
	const byComponent = new Map(
		correlations.flatMap((source) =>
			source.components.map((component) => [component.componentTypeId, component] as const)
		)
	);
	return Object.freeze(
		components.map((component) => {
			const correlation = byComponent.get(component.id.componentTypeId);
			if (!correlation) return component;
			const taskSlots = correlation.slots.filter(
				(slot) => slot.kind === 'inferred-task' || slot.kind === 'explicit-task'
			);
			const actionSlots = correlation.slots.filter((slot) => slot.kind === 'action');
			return Object.freeze({
				...component,
				tasks: Object.freeze(
					component.tasks.map((task, index) =>
						taskSlots[index]
							? Object.freeze({
									...task,
									id: Object.freeze({
										...task.id,
										sourceEntityId: taskSlots[index]!.id
									})
								})
							: task
					)
				),
				actions: Object.freeze(
					component.actions.map((action, index) =>
						actionSlots[index]
							? Object.freeze({
									...action,
									id: Object.freeze({
										...action.id,
										sourceEntityId: actionSlots[index]!.id
									})
								})
							: action
					)
				)
			});
		})
	);
}

function componentResponse(
	request: ExactInspectionRequest,
	sessionId: string,
	components: readonly ExactInspectedRuntimeComponent[],
	select: (component: ExactInspectedRuntimeComponent) => unknown
): ExactInspectionResponse {
	const component = findComponent(request.params?.identity, components);
	return component
		? success(request, sessionId, select(component))
		: failure(request.id, 'not-found', 'component unavailable');
}

function nestedResponse(
	request: ExactInspectionRequest,
	sessionId: string,
	components: readonly ExactInspectedRuntimeComponent[],
	key: 'tasks' | 'actions'
): ExactInspectionResponse {
	const component = findComponent(request.params?.identity, components);
	const sourceEntityId =
		request.params?.sourceEntityId ?? request.params?.identity?.sourceEntityId;
	const record = component?.[key].find((entry) => entry.id.sourceEntityId === sourceEntityId);
	return record
		? success(request, sessionId, record)
		: failure(request.id, 'not-found', `${key} record unavailable`);
}

function findComponent(
	identity: ExactInspectionRuntimeId | undefined,
	components: readonly ExactInspectedRuntimeComponent[]
): ExactInspectedRuntimeComponent | undefined {
	if (!identity) return undefined;
	return components.find(
		(component) =>
			component.id.buildKey === identity.buildKey &&
			component.id.executionRoot === identity.executionRoot &&
			component.id.instanceId === identity.instanceId
	);
}

function collection(
	request: ExactInspectionRequest,
	sessionId: string,
	values: readonly unknown[],
	maximum: number
): ExactInspectionResponse {
	const page = paginateExactInspection(values, request.params?.page, maximum);
	return success(request, sessionId, page.values, page.nextCursor);
}

function success(
	request: ExactInspectionRequest,
	sessionId: string,
	result: unknown,
	nextCursor?: string
): ExactInspectionResponse {
	return Object.freeze({
		protocol: 1,
		id: request.id,
		ok: true,
		identity: Object.freeze({
			sessionId,
			...(request.params?.identity?.buildKey
				? { buildKey: request.params.identity.buildKey }
				: {}),
			...(request.params?.identity?.executionRoot
				? { executionRoot: request.params.identity.executionRoot }
				: {}),
			...(request.params?.identity?.binding
				? { binding: request.params.identity.binding }
				: {})
		}),
		result,
		...(nextCursor
			? { page: Object.freeze({ nextCursor, count: Array.isArray(result) ? result.length : 1 }) }
			: {})
	});
}

function failure(
	id: string,
	error: 'bad-request' | 'not-found' | 'unavailable',
	reason: unknown
): ExactInspectionResponse {
	return Object.freeze({
		protocol: 1,
		id,
		ok: false,
		error,
		reason: reason instanceof Error ? reason.message : String(reason)
	});
}

function closedSubscription(): ExactInspectionSubscriptionHandle {
	return Object.freeze({ closed: true, close() {} });
}

function requestId(value: unknown): string {
	return typeof value === 'object' &&
		value !== null &&
		'id' in value &&
		typeof (value as { id?: unknown }).id === 'string'
		? (value as { id: string }).id
		: 'invalid-request';
}
