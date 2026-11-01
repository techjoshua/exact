import {
	paginateExactInspection,
	parseExactInspectionRequest,
	readExactInspectionRequestId as requestId,
	parseExactInspectionSubscription,
	type ExactInspectionQueryService,
	type ExactInspectionRequest,
	type ExactInspectionExecutionRoot,
	type ExactInspectionResponse,
	type ExactInspectionRuntimeId,
	type ExactInspectionSubscriptionHandle,
	type ExactInspectedRuntimeComponent,
	type ExactTaskRuntimeSnapshot
} from '@exactjs/devtools-protocol';
import type { ExactDomInspectionHost } from '@exactjs/dom';
import type { ExactClientEventStore } from './client-events.js';
import type { ExactBrowserServerInspectionClient } from './server-client.js';
import { CLIENT_HOST, PAGE_SERVER_HOST, serverTargets, splitHostCursors } from './query/hosts.js';
import {
	failedInspectionResponse as failure,
	successfulInspectionResponse as success
} from './query/response.js';
import { mergedTimeline } from './query/timeline.js';
import {
	InspectionCollectionCursorError,
	paginateInspectionSources,
	type InspectionCollectionSource
} from './query/collection-pagination.js';
import { matchesInspectionRoot, matchesInspectionComponent } from './query/collection-filters.js';

/** Inputs retained by the shared page query service while one session is attached. */
export type ExactClientQueryServiceOptions = Readonly<{
	sessionId: string;
	dom: ExactDomInspectionHost;
	events: ExactClientEventStore;
	server?: ExactBrowserServerInspectionClient;
	serverConnected: boolean;
	maxResults?: number;
}>;

/** Creates the shared page service. maxResults defaults to 500 and must be a positive safe integer, or construction throws RangeError. */
export function createExactClientInspectionQueryService(
	options: ExactClientQueryServiceOptions
): ExactInspectionQueryService {
	const maxResults = options.maxResults ?? 500;
	if (!Number.isSafeInteger(maxResults) || maxResults < 1)
		throw new RangeError('Invalid eXact inspection result maximum');
	const service: ExactInspectionQueryService = {
		async request(untrusted) {
			let request: ExactInspectionRequest;
			try {
				request = parseExactInspectionRequest(untrusted, { maxResults });
			} catch (error) {
				return failure(requestId(untrusted), 'bad-request', error);
			}
			// Collect browser records only when needed, retaining one snapshot for values and routing.
			let captured: ReturnType<ExactDomInspectionHost['snapshot']> | undefined;
			const domSnapshot = () => (captured ??= options.dom.snapshot());
			const components = () =>
				domSnapshot().components.filter(
					(component) => component.id.sessionId === options.sessionId
				);
			const serverOwned =
				request.params?.identity?.side === 'server' && options.serverConnected && options.server;
			if (
				serverOwned &&
				[
					'components.get',
					'state.get',
					'contexts.list',
					'tasks.list',
					'tasks.get',
					'tasks.getTree'
				].includes(request.method)
			)
				return options.server!.query(options.sessionId, request);
			switch (request.method) {
				case 'roots.list':
					return mergedServerCollection(
						request,
						options,
						{
							values: domSnapshot().roots.filter((root) =>
								matchesInspectionRoot(root, request.params?.filter)
							),
							roots: domSnapshot().roots
						},
						maxResults
					);
				case 'microfrontends.list':
					return collection(
						request,
						options.sessionId,
						domSnapshot()
							.roots.filter(
								(root) => root.binding && matchesInspectionRoot(root, request.params?.filter)
							)
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
					return mergedServerCollection(
						request,
						options,
						{
							values: components().filter((component) =>
								matchesInspectionComponent(component.id, request.params?.filter)
							),
							roots: domSnapshot().roots
						},
						maxResults
					);
				case 'partitions.tree':
					return mergedServerCollection(
						request,
						options,
						{ values: domSnapshot().partitions, roots: domSnapshot().roots },
						maxResults
					);
				case 'components.get':
					return componentResponse(
						request,
						options.sessionId,
						components(),
						(component) => component
					);
				case 'state.get':
					return componentResponse(request, options.sessionId, components(), (component) => ({
						state: component.state,
						props: component.props
					}));
				case 'contexts.list':
					return componentResponse(
						request,
						options.sessionId,
						components(),
						(component) => component.contexts
					);
				case 'tasks.list':
					return componentResponse(
						request,
						options.sessionId,
						components(),
						(component) => component.tasks
					);
				case 'tasks.get':
					return nestedResponse(request, options.sessionId, components(), 'tasks');
				case 'tasks.getTree':
					return componentResponse(request, options.sessionId, components(), (component) =>
						taskTree(component.tasks)
					);
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
			const cursors = splitHostCursors(request.cursor);
			const closes: Array<() => void> = [
				options.events.subscribe(cursors.get(CLIENT_HOST), request.filter, listener)
			];
			return {
				get closed() {
					return closed;
				},
				close() {
					if (closed) return;
					closed = true;
					for (const close of closes) close();
				}
			};
		}
	};
	return service;
}

async function mergedServerCollection(
	request: ExactInspectionRequest,
	options: ExactClientQueryServiceOptions,
	client: Readonly<{ values: readonly unknown[]; roots: readonly ExactInspectionExecutionRoot[] }>,
	maximum: number
): Promise<ExactInspectionResponse> {
	const sources: InspectionCollectionSource[] = [
		{
			size: client.values.length,
			async read(page) {
				const result = paginateExactInspection(client.values, page, maximum);
				return { values: result.values, nextCursor: result.nextCursor };
			}
		}
	];
	if (options.serverConnected && options.server) {
		for (const target of serverTargets(client.roots, request.params?.filter)) {
			sources.push({
				async read(page) {
					try {
						const route = target.filter;
						if (
							target.key !== PAGE_SERVER_HOST &&
							(!route?.binding || !route.buildKey || !route.executionRoot)
						)
							return { values: [] };
						const identity =
							target.key === PAGE_SERVER_HOST
								? request.params?.identity
								: {
										sessionId: options.sessionId,
										side: 'server' as const,
										binding: route?.binding,
										buildKey: route!.buildKey!,
										executionRoot: route!.executionRoot!,
										componentTypeId: 'execution-root'
									};
						const remote = await options.server!.query(options.sessionId, {
							...request,
							params: { ...request.params, identity, page }
						});
						return remote.ok && Array.isArray(remote.result)
							? { values: remote.result, nextCursor: remote.page?.nextCursor }
							: { values: [] };
					} catch {
						return { values: [] };
					}
				}
			});
		}
	}
	try {
		const page = await paginateInspectionSources(sources, request.params?.page, maximum);
		return success(request, options.sessionId, page.values, page.nextCursor);
	} catch (error) {
		return failure(
			request.id,
			error instanceof InspectionCollectionCursorError ? 'bad-request' : 'unavailable',
			error
		);
	}
}

function componentResponse(
	request: ExactInspectionRequest,
	sessionId: string,
	components: readonly ExactInspectedRuntimeComponent[],
	select: (component: ExactInspectedRuntimeComponent) => unknown
): ExactInspectionResponse {
	const component = findComponent(request.params?.identity, components, sessionId);
	return component
		? success(request, sessionId, select(component))
		: failure(request.id, 'not-found', 'component unavailable');
}

function nestedResponse(
	request: ExactInspectionRequest,
	sessionId: string,
	components: readonly ExactInspectedRuntimeComponent[],
	key: 'tasks'
): ExactInspectionResponse {
	const component = findComponent(request.params?.identity, components, sessionId);
	const sourceEntityId = request.params?.sourceEntityId ?? request.params?.identity?.sourceEntityId;
	const operationId = request.params?.identity?.operationId;
	const generation = request.params?.identity?.generation;
	const record =
		(sourceEntityId !== undefined || operationId !== undefined) &&
		component?.[key].find(
			(entry) =>
				(sourceEntityId === undefined || entry.id.sourceEntityId === sourceEntityId) &&
				(operationId === undefined || entry.id.operationId === operationId) &&
				(generation === undefined || entry.id.generation === generation)
		);
	return record
		? success(request, sessionId, record)
		: failure(request.id, 'not-found', `${key} record unavailable`);
}

type TaskTreeNode = Readonly<{
	task: ExactTaskRuntimeSnapshot;
	children: readonly TaskTreeNode[];
}>;

function taskTree(tasks: readonly ExactTaskRuntimeSnapshot[]): readonly TaskTreeNode[] {
	const byIdentity = new Map<
		string,
		{ task: ExactTaskRuntimeSnapshot; children: TaskTreeNode[] }
	>();
	for (const task of tasks) byIdentity.set(runtimeIdentityKey(task.id), { task, children: [] });
	const roots: Array<{ task: ExactTaskRuntimeSnapshot; children: TaskTreeNode[] }> = [];
	for (const node of byIdentity.values()) {
		const parent = node.task.parent && byIdentity.get(runtimeIdentityKey(node.task.parent));
		if (parent) parent.children.push(node);
		else roots.push(node);
	}
	return roots;
}

function runtimeIdentityKey(identity: ExactInspectionRuntimeId): string {
	return JSON.stringify([
		identity.sessionId,
		identity.side,
		identity.binding,
		identity.buildKey,
		identity.executionRoot,
		identity.componentTypeId,
		identity.instanceId,
		identity.sourceEntityId,
		identity.operationId,
		identity.generation
	]);
}

function findComponent(
	identity: ExactInspectionRuntimeId | undefined,
	components: readonly ExactInspectedRuntimeComponent[],
	sessionId: string
): ExactInspectedRuntimeComponent | undefined {
	if (!identity || identity.sessionId !== sessionId) return undefined;
	return components.find(
		(component) =>
			component.id.sessionId === identity.sessionId &&
			component.id.side === identity.side &&
			component.id.binding === identity.binding &&
			component.id.buildKey === identity.buildKey &&
			component.id.executionRoot === identity.executionRoot &&
			component.id.componentTypeId === identity.componentTypeId &&
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

function closedSubscription(): ExactInspectionSubscriptionHandle {
	return { closed: true, close() {} };
}
