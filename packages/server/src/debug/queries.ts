import {
	paginateExactInspection,
	parseExactInspectionRequest,
	type ExactInspectionRequest,
	type ExactInspectionResponse,
	type ExactInspectionSuccess,
	type ExactRuntimeInspectionEvent,
	type ExactRuntimeSourceEntity
} from '@exactjs/devtools-protocol';
import type { ExactServerContext } from '../types.js';
import type { ExactInspectionCatalogRegistry } from './catalog-registry.js';
import type { ExactInspectionEventBuffer } from './event-buffer.js';
import type { ExactDebugSession, ExactDebugSessionManager } from './sessions.js';

/** Dependencies needed by the server-owned read-only query projection. */
export type ExactServerInspectionQueryContext = Readonly<{
	context: ExactServerContext;
	catalogs: ExactInspectionCatalogRegistry;
	events: ExactInspectionEventBuffer;
	sessions: ExactDebugSessionManager;
	maxResults: number;
	maxSnapshotBytes: number;
	maxSourceExcerptBytes: number;
}>;

/** Dispatches one validated query without entering executable operation lookup. */
export async function dispatchExactInspectionQuery(
	session: ExactDebugSession,
	untrusted: unknown,
	queryContext: ExactServerInspectionQueryContext
): Promise<ExactInspectionResponse> {
	let request: ExactInspectionRequest;
	try {
		request = parseExactInspectionRequest(untrusted, {
			maxResults: queryContext.maxResults
		});
	} catch (error) {
		return failure(requestId(untrusted), 'bad-request', error);
	}

	let response: ExactInspectionResponse;
	if (request.method === 'session.describe') {
		response = success(request, session.id, queryContext.sessions.describe(session));
	} else if (request.method === 'roots.list') {
		response = rootsResponse(request, session.id, queryContext);
	} else if (
		request.method === 'catalog.entity' ||
		request.method === 'dependencies.explain'
	) {
		response = catalogEntityResponse(request, session.id, queryContext);
	} else if (request.method === 'timeline.query' || request.method === 'errors.list') {
		response = timelineResponse(request, session.id, queryContext);
	} else if (request.method === 'source.excerpt') {
		response = sourceResponse(request, session.id, queryContext);
	} else if (queryContext.context.inspectionQueryService) {
		response = await queryContext.context.inspectionQueryService.request(request);
	} else {
		response = failure(request.id, 'unavailable', 'runtime-not-instrumented');
	}
	return boundedResponse(response, queryContext.maxSnapshotBytes);
}

function rootsResponse(
	request: ExactInspectionRequest,
	sessionId: string,
	queryContext: ExactServerInspectionQueryContext
): ExactInspectionResponse {
	const roots = queryContext.catalogs.builds().flatMap((catalog) =>
		Object.values(catalog.roots).map((root) =>
			Object.freeze({
				side: 'server' as const,
				buildKey: catalog.buildKey,
				executionRoot: root.executionRoot,
				rootComponentId: root.rootComponentId,
				status: 'available' as const
			})
		)
	);
	const page = paginateExactInspection(roots, request.params?.page, queryContext.maxResults);
	return success(request, sessionId, page.values, page.nextCursor);
}

function catalogEntityResponse(
	request: ExactInspectionRequest,
	sessionId: string,
	queryContext: ExactServerInspectionQueryContext
): ExactInspectionResponse {
	const identity = request.params?.identity;
	const sourceEntityId = request.params?.sourceEntityId ?? identity?.sourceEntityId;
	if (!identity || !sourceEntityId)
		return failure(request.id, 'bad-request', 'complete build/root/source identity required');
	const root = queryContext.catalogs.find(identity.buildKey, identity.executionRoot);
	if (!root) return failure(request.id, 'unavailable', 'build-retired');
	const entity = findEntity(root.files.flatMap((file) => file.components), sourceEntityId);
	if (!entity) return failure(request.id, 'not-found', 'source entity is not in selected root');
	const result =
		request.method === 'dependencies.explain'
			? Object.freeze({
					id: entity.id,
					kind: entity.kind,
					classification: entity.classification,
					reasons: entity.reasons,
					source: entity.location
				})
			: entity;
	return success(request, sessionId, result);
}

function timelineResponse(
	request: ExactInspectionRequest,
	sessionId: string,
	queryContext: ExactServerInspectionQueryContext
): ExactInspectionResponse {
	const queried = queryContext.events.query(
		request.params?.page?.cursor,
		request.method === 'errors.list'
			? { ...request.params?.filter, kinds: ['error'] }
			: request.params?.filter
	);
	const page = paginateExactInspection(
		queried.events,
		{ limit: request.params?.page?.limit },
		queryContext.maxResults
	);
	return success(request, sessionId, page.values, page.nextCursor ?? queried.cursor);
}

function sourceResponse(
	request: ExactInspectionRequest,
	sessionId: string,
	queryContext: ExactServerInspectionQueryContext
): ExactInspectionResponse {
	const identity = request.params?.identity;
	const path = request.params?.path;
	const sourceHash = request.params?.sourceHash;
	if (!identity || !path || !sourceHash)
		return failure(request.id, 'bad-request', 'build/root/path/hash required');
	const root = queryContext.catalogs.find(identity.buildKey, identity.executionRoot);
	if (!root) return failure(request.id, 'unavailable', 'build-retired');
	const catalogFile = root.files.find(
		(file) => file.path === path && file.sourceHash === sourceHash
	);
	if (!catalogFile) return failure(request.id, 'unavailable', 'source-unavailable');
	const source = queryContext.context.inspectionSources?.[sourceKey(identity.buildKey, identity.executionRoot, path)];
	if (
		!source ||
		source.buildKey !== identity.buildKey ||
		source.executionRoot !== identity.executionRoot ||
		source.sourceHash !== sourceHash
	)
		return failure(request.id, 'unavailable', 'source-unavailable');
	const excerpt = boundedUtf8(
		redactKnownSecrets(source.content, root.redactions.secretNames),
		queryContext.maxSourceExcerptBytes
	);
	return success(
		request,
		sessionId,
		Object.freeze({ path, sourceHash, excerpt, truncated: excerpt.length < source.content.length })
	);
}

function success(
	request: ExactInspectionRequest,
	sessionId: string,
	result: unknown,
	nextCursor?: string
): ExactInspectionSuccess {
	const identity = request.params?.identity;
	return Object.freeze({
		protocol: 1,
		id: request.id,
		ok: true,
		identity: Object.freeze({
			sessionId,
			...(identity?.buildKey ? { buildKey: identity.buildKey } : {}),
			...(identity?.executionRoot ? { executionRoot: identity.executionRoot } : {}),
			...(identity?.binding ? { binding: identity.binding } : {})
		}),
		result,
		...(nextCursor
			? {
					page: Object.freeze({
						nextCursor,
						count: Array.isArray(result) ? result.length : 1
					})
				}
			: {})
	});
}

function failure(
	id: string,
	error: 'bad-request' | 'not-found' | 'unavailable' | 'limit-exceeded',
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

function boundedResponse(
	response: ExactInspectionResponse,
	maximum: number
): ExactInspectionResponse {
	if (new TextEncoder().encode(JSON.stringify(response)).byteLength <= maximum) return response;
	return failure(response.id, 'limit-exceeded', 'inspection response byte limit exceeded');
}

function findEntity(
	entities: readonly ExactRuntimeSourceEntity[],
	id: string
): ExactRuntimeSourceEntity | undefined {
	for (const entity of entities) {
		if (entity.id === id) return entity;
		const child = findEntity(entity.children, id);
		if (child) return child;
	}
	return undefined;
}

function boundedUtf8(value: string, maximum: number): string {
	const encoded = new TextEncoder().encode(value);
	if (encoded.byteLength <= maximum) return value;
	return new TextDecoder().decode(encoded.slice(0, maximum));
}

function redactKnownSecrets(source: string, secretNames: readonly string[]): string {
	let output = source;
	for (const name of secretNames) {
		const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		output = output.replace(
			new RegExp(`(${escaped}\\s*[:=]\\s*)(['"\`])(?:\\\\.|(?!\\2).)*\\2`, 'g'),
			'$1"[redacted]"'
		);
	}
	return output;
}

function sourceKey(buildKey: string, executionRoot: string, path: string): string {
	return `${buildKey}\0${executionRoot}\0${path}`;
}

function requestId(value: unknown): string {
	return typeof value === 'object' &&
		value !== null &&
		'id' in value &&
		typeof (value as { id?: unknown }).id === 'string'
		? (value as { id: string }).id
		: 'invalid-request';
}
