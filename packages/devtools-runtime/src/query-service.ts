import {
	paginateExactInspection,
	parseExactInspectionRequest,
	parseExactInspectionSubscription,
	type ExactInspectionQueryService,
	type ExactInspectionRequest,
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

/** Inputs retained by the shared page query service while one session is attached. */
export type ExactClientQueryServiceOptions = Readonly<{
	sessionId: string;
	dom: ExactDomInspectionHost;
	events: ExactClientEventStore;
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
			const snapshot = options.dom.snapshot().components;
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
					return mergedServerCollection(request, options, options.dom.snapshot().roots, maxResults);
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
					return componentResponse(
						request,
						options.sessionId,
						snapshot,
						(component) => component.contexts
					);
				case 'tasks.list':
					return componentResponse(
						request,
						options.sessionId,
						snapshot,
						(component) => component.tasks
					);
				case 'tasks.get':
					return nestedResponse(request, options.sessionId, snapshot, 'tasks');
				case 'tasks.getTree':
					return componentResponse(request, options.sessionId, snapshot, (component) =>
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
			if (options.serverConnected && options.server) {
				for (const target of serverTargets(options.dom.snapshot().roots, request.filter)) {
					const cursor = cursors.get(target.key);
					const remote = options.server.subscribe(
						{
							protocol: 1,
							sessionId: request.sessionId,
							...(cursor ? { cursor } : {}),
							...(target.filter ? { filter: target.filter } : {})
						},
						listener
					);
					closes.push(() => remote.close());
				}
			}
			return Object.freeze({
				get closed() {
					return closed;
				},
				close() {
					if (closed) return;
					closed = true;
					for (const close of closes) close();
				}
			});
		}
	};
	return Object.freeze(service);
}

async function mergedServerCollection(
	request: ExactInspectionRequest,
	options: ExactClientQueryServiceOptions,
	clientValues: readonly unknown[],
	maximum: number
): Promise<ExactInspectionResponse> {
	let serverValues: readonly unknown[] = [];
	if (options.serverConnected && options.server) {
		const responses = await Promise.all(
			serverTargets(options.dom.snapshot().roots, request.params?.filter).map(async (target) => {
				try {
					const route = target.filter;
					let routedRequest = request;
					if (target.key !== PAGE_SERVER_HOST) {
						if (!route?.binding || !route.buildKey || !route.executionRoot) return [];
						routedRequest = {
							...request,
							params: {
								...request.params,
								identity: {
									sessionId: options.sessionId,
									side: 'server',
									binding: route.binding,
									buildKey: route.buildKey,
									executionRoot: route.executionRoot,
									componentTypeId: 'execution-root'
								}
							}
						};
					}
					const remote = await options.server!.query(options.sessionId, {
						...routedRequest
					});
					return remote.ok && Array.isArray(remote.result) ? remote.result : [];
				} catch {
					return [];
				}
			})
		);
		serverValues = Object.freeze(responses.flat());
	}
	return collection(
		request,
		options.sessionId,
		Object.freeze([...clientValues, ...serverValues]),
		maximum
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
	key: 'tasks'
): ExactInspectionResponse {
	const component = findComponent(request.params?.identity, components);
	const sourceEntityId = request.params?.sourceEntityId ?? request.params?.identity?.sourceEntityId;
	const record = component?.[key].find((entry) => entry.id.sourceEntityId === sourceEntityId);
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
	return [
		identity.buildKey,
		identity.executionRoot,
		identity.instanceId,
		identity.sourceEntityId ?? '',
		identity.generation ?? ''
	].join(':');
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
