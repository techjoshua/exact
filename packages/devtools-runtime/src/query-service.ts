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
	type ExactInspectionExecutionRoot,
	type ExactInspectedRuntimeComponent,
	type ExactTaskRuntimeSnapshot,
	type ExactRuntimeInspectionEvent
} from '@exactjs/devtools-protocol';
import type { ExactDomInspectionHost } from '@exactjs/dom';
import type { ExactClientEventStore } from './client-events.js';
import type { ExactBrowserServerInspectionClient } from './server-client.js';

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

async function mergedTimeline(
	request: ExactInspectionRequest,
	options: ExactClientQueryServiceOptions,
	maximum: number,
	errorsOnly = false
): Promise<ExactInspectionResponse> {
	const cursors = splitHostCursors(request.params?.page?.cursor);
	const filter = errorsOnly
		? { ...request.params?.filter, kinds: ['error'] }
		: request.params?.filter;
	const hosts: Array<Readonly<{ key: string; events: readonly ExactRuntimeInspectionEvent[] }>> = [
		{
			key: CLIENT_HOST,
			events: options.events.query(cursors.get(CLIENT_HOST), filter)
		}
	];
	if (options.serverConnected && options.server) {
		hosts.push(
			...(await Promise.all(
				serverTargets(options.dom.snapshot().roots, filter).map(async (target) => {
					try {
						const cursor = cursors.get(target.key);
						const remote = await options.server!.query(options.sessionId, {
							...request,
							params: {
								...request.params,
								filter: target.filter,
								page: {
									limit: maximum,
									...(cursor ? { cursor } : {})
								}
							}
						});
						return Object.freeze({
							key: target.key,
							events:
								remote.ok && Array.isArray(remote.result)
									? remote.result.filter(isExactRuntimeInspectionEvent)
									: []
						});
					} catch {
						return Object.freeze({ key: target.key, events: [] });
					}
				})
			))
		);
	}
	const limit = Math.min(request.params?.page?.limit ?? 100, maximum);
	const selected: ExactRuntimeInspectionEvent[] = [];
	const indexes = new Map(hosts.map((host) => [host.key, 0]));
	while (selected.length < limit) {
		let progressed = false;
		for (const host of hosts) {
			const index = indexes.get(host.key) ?? 0;
			const event = host.events[index];
			if (!event || selected.length >= limit) continue;
			selected.push(event);
			indexes.set(host.key, index + 1);
			cursors.set(host.key, event.cursor);
			progressed = true;
		}
		if (!progressed) break;
	}
	const hasMore = hosts.some((host) => (indexes.get(host.key) ?? 0) < host.events.length);
	const nextCursor =
		selected.length || hasMore ? joinHostCursors(cursors) : request.params?.page?.cursor;
	return success(request, options.sessionId, Object.freeze(selected), nextCursor);
}

const CLIENT_HOST = '$client';
const PAGE_SERVER_HOST = '$server';

function splitHostCursors(cursor: string | undefined): Map<string, string> {
	if (!cursor) return new Map();
	if (cursor.startsWith('m2:')) {
		try {
			const decoded = JSON.parse(decodeURIComponent(cursor.slice(3))) as unknown;
			if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return new Map();
			return new Map(
				Object.entries(decoded)
					.filter(
						(entry): entry is [string, string] =>
							entry[0].length <= 512 && typeof entry[1] === 'string' && entry[1].length <= 512
					)
					.slice(0, 32)
			);
		} catch {
			return new Map();
		}
	}
	if (!cursor.startsWith('m:'))
		return new Map([
			[CLIENT_HOST, cursor],
			[PAGE_SERVER_HOST, cursor]
		]);
	const [, client = '', server = ''] = cursor.split(':', 3);
	return new Map([
		...(client && client !== '-' ? ([[CLIENT_HOST, decodeURIComponent(client)]] as const) : []),
		...(server && server !== '-' ? ([[PAGE_SERVER_HOST, decodeURIComponent(server)]] as const) : [])
	]);
}

function joinHostCursors(cursors: ReadonlyMap<string, string>): string {
	const sorted = [...cursors].sort(([left], [right]) => left.localeCompare(right));
	return `m2:${encodeURIComponent(JSON.stringify(Object.fromEntries(sorted)))}`;
}

type ServerTarget = Readonly<{
	key: string;
	filter: ExactInspectionSubscription['filter'];
}>;

function serverTargets(
	roots: readonly ExactInspectionExecutionRoot[],
	filter: ExactInspectionSubscription['filter']
): readonly ServerTarget[] {
	if (filter?.side === 'client') return [];
	const targets: ServerTarget[] = [];
	if (!filter?.binding) targets.push({ key: PAGE_SERVER_HOST, filter });
	const seen = new Set<string>();
	for (const root of roots) {
		if (!root.binding || (filter?.binding && filter.binding !== root.binding)) continue;
		if (filter?.buildKey && filter.buildKey !== root.buildKey) continue;
		if (filter?.executionRoot && filter.executionRoot !== root.executionRoot) continue;
		const key = `binding:${root.binding}:${root.buildKey}:${root.executionRoot}`;
		if (seen.has(key)) continue;
		seen.add(key);
		targets.push({
			key,
			filter: {
				...filter,
				side: 'server',
				binding: root.binding,
				buildKey: root.buildKey,
				executionRoot: root.executionRoot
			}
		});
	}
	return targets;
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
			...(request.params?.identity?.buildKey ? { buildKey: request.params.identity.buildKey } : {}),
			...(request.params?.identity?.executionRoot
				? { executionRoot: request.params.identity.executionRoot }
				: {}),
			...(request.params?.identity?.binding ? { binding: request.params.identity.binding } : {})
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
