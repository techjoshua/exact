import {
	paginateExactInspection,
	parseExactInspectionRequest,
	readExactInspectionRequestId as requestId,
	type ExactInspectionRequest,
	type ExactInspectionResponse,
	type ExactInspectionSuccess,
	type ExactRuntimeSourceEntity
} from '@exactjs/devtools-protocol';
import type { ExactServerContext, ExactTextResponse } from '../types.js';
import type { ExactInspectionCatalogRegistry } from './catalog-registry.js';
import type { ExactDebugSession, ExactDebugSessionManager } from './sessions.js';
import { protocolUtf8ByteLength as utf8Length } from '@exactjs/core/framework/protocol-records';
import { jsonResponse } from '../protocol.js';

/** Dependencies needed by the server-owned read-only query projection. */
export type ExactServerInspectionQueryContext = Readonly<{
	context: ExactServerContext;
	catalogs: ExactInspectionCatalogRegistry;
	sessions: ExactDebugSessionManager;
	maxResults: number;
	maxQueryDepth: number;
	maxSnapshotBytes: number;
	maxSourceExcerptBytes: number;
}>;

/** Dispatches and encodes one validated query, bounding the exact body returned to its caller. */
export async function dispatchExactInspectionQuery(
	session: ExactDebugSession,
	untrusted: unknown,
	queryContext: ExactServerInspectionQueryContext
): Promise<ExactTextResponse> {
	let request: ExactInspectionRequest;
	try {
		request = parseExactInspectionRequest(untrusted, {
			maxResults: queryContext.maxResults,
			maxDepth: queryContext.maxQueryDepth
		});
	} catch {
		return jsonResponse(
			400,
			failure(requestId(untrusted), 'bad-request', 'invalid inspection request')
		);
	}

	let response: ExactInspectionResponse;
	if (request.method === 'session.describe') {
		response = success(request, session.id, queryContext.sessions.describe(session));
	} else if (request.method === 'roots.list') {
		response = rootsResponse(request, session.id, queryContext);
	} else if (request.method === 'partitions.plan') {
		response = partitionPlansResponse(request, session.id, queryContext);
	} else if (request.method === 'catalog.entity' || request.method === 'dependencies.explain') {
		response = catalogEntityResponse(request, session.id, queryContext);
	} else if (request.method === 'timeline.query' || request.method === 'errors.list') {
		response = failure(request.id, 'unavailable', 'timeline-is-browser-owned');
	} else if (request.method === 'source.excerpt') {
		response = sourceResponse(request, session.id, queryContext);
	} else if (queryContext.context.inspectionQueryService) {
		try {
			response = await queryContext.context.inspectionQueryService.request(request);
		} catch {
			response = failure(request.id, 'unavailable', 'runtime inspection query failed');
		}
	} else {
		response = failure(request.id, 'unavailable', 'runtime-not-instrumented');
	}
	return boundedResponse(response, queryContext.maxSnapshotBytes);
}

function partitionPlansResponse(
	request: ExactInspectionRequest,
	sessionId: string,
	queryContext: ExactServerInspectionQueryContext
): ExactInspectionResponse {
	const identity = request.params?.identity;
	if (!identity) return failure(request.id, 'bad-request', 'complete build/root identity required');
	const root = queryContext.catalogs.find(identity.buildKey, identity.executionRoot);
	if (!root) return failure(request.id, 'unavailable', 'build-retired');
	return success(request, sessionId, root.partitionPlans ?? []);
}

function rootsResponse(
	request: ExactInspectionRequest,
	sessionId: string,
	queryContext: ExactServerInspectionQueryContext
): ExactInspectionResponse {
	const roots = queryContext.catalogs.builds().flatMap((catalog) =>
		Object.values(catalog.roots).map((root) => ({
			side: 'server' as const,
			buildKey: catalog.buildKey,
			executionRoot: root.executionRoot,
			rootComponentId: root.rootComponentId,
			status: 'available' as const
		}))
	);
	const filter = request.params?.filter;
	const selected = roots.filter(
		(root) =>
			(filter?.side === undefined || filter.side === root.side) &&
			(filter?.buildKey === undefined || filter.buildKey === root.buildKey) &&
			(filter?.executionRoot === undefined || filter.executionRoot === root.executionRoot)
	);
	const page = paginateExactInspection(selected, request.params?.page, queryContext.maxResults);
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
	const entity = findEntity(
		root.files.flatMap((file) => file.components),
		sourceEntityId
	);
	if (!entity) return failure(request.id, 'not-found', 'source entity is not in selected root');
	const result =
		request.method === 'dependencies.explain'
			? {
					id: entity.id,
					kind: entity.kind,
					classification: entity.classification,
					reasons: entity.reasons,
					source: entity.location
				}
			: entity;
	return success(request, sessionId, result);
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
	const source =
		queryContext.context.inspectionSources?.[
			sourceKey(identity.buildKey, identity.executionRoot, path)
		];
	if (
		!source ||
		source.buildKey !== identity.buildKey ||
		source.executionRoot !== identity.executionRoot ||
		source.sourceHash !== sourceHash
	)
		return failure(request.id, 'unavailable', 'source-unavailable');
	if (root.redactions.secretNames.length && source.redacted !== true)
		return failure(request.id, 'unavailable', 'source-unavailable');
	const excerpt = boundedUtf8(
		redactKnownSecrets(source.content, root.redactions.secretNames),
		queryContext.maxSourceExcerptBytes
	);
	return success(request, sessionId, {
		path,
		sourceHash,
		excerpt,
		truncated: excerpt.length < source.content.length
	});
}

function success(
	request: ExactInspectionRequest,
	sessionId: string,
	result: unknown,
	nextCursor?: string
): ExactInspectionSuccess {
	const identity = request.params?.identity;
	return {
		protocol: 1,
		id: request.id,
		ok: true,
		identity: {
			sessionId,
			...(identity?.buildKey ? { buildKey: identity.buildKey } : {}),
			...(identity?.executionRoot ? { executionRoot: identity.executionRoot } : {}),
			...(identity?.binding ? { binding: identity.binding } : {})
		},
		result,
		...(nextCursor
			? {
					page: {
						nextCursor,
						count: Array.isArray(result) ? result.length : 1
					}
				}
			: {})
	};
}

function failure(
	id: string,
	error: 'bad-request' | 'not-found' | 'unavailable' | 'limit-exceeded',
	reason: string
): ExactInspectionResponse {
	return {
		protocol: 1,
		id,
		ok: false,
		error,
		reason
	};
}

/** Encodes once so validation, auditing and delivery share the same settled response body. */
function boundedResponse(response: ExactInspectionResponse, maximum: number): ExactTextResponse {
	try {
		const encoded = jsonResponse(
			response.ok ? 200 : response.error === 'bad-request' ? 400 : 404,
			response
		);
		if (utf8Length(encoded.body) <= maximum) return encoded;
		response = failure(response.id, 'limit-exceeded', 'inspection response byte limit exceeded');
	} catch {
		response = failure(response.id, 'limit-exceeded', 'inspection response cannot be encoded');
	}
	return jsonResponse(404, response);
}

/** Searches validated source trees depth-first without consuming the native call stack. */
function findEntity(
	entities: readonly ExactRuntimeSourceEntity[],
	id: string
): ExactRuntimeSourceEntity | undefined {
	const frames = [{ entities, index: 0 }];
	while (frames.length) {
		const frame = frames[frames.length - 1]!;
		if (frame.index >= frame.entities.length) {
			frames.pop();
			continue;
		}
		const entity = frame.entities[frame.index++]!;
		if (entity.id === id) return entity;
		if (entity.children.length) frames.push({ entities: entity.children, index: 0 });
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
