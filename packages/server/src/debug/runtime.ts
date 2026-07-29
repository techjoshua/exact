import {
	exactDebugCapabilityForRequest,
	type ExactDebugCapability,
	type ExactDebugRequest,
	type ExactInspectionRuntimeId,
	type ExactRuntimeInspectionEvent
} from '@exactjs/devtools-protocol';
import { jsonResponse } from '../protocol.js';
import type {
	ExactDebugLimits,
	ExactRequestLike,
	ExactResponseLike,
	ExactServerContext,
	ExactServerDebugRuntime
} from '../types.js';
import { createExactInspectionCatalogRegistry } from './catalog-registry.js';
import { createExactInspectionEventBuffer } from './event-buffer.js';
import { dispatchExactInspectionQuery } from './queries.js';
import { createExactDebugSessionManager } from './sessions.js';

const debugRuntimes = new WeakMap<ExactServerContext, ExactServerDebugRuntime>();

/** Returns the stable debug owner for one reusable server context. */
export function exactServerDebugRuntime(context: ExactServerContext): ExactServerDebugRuntime {
	if (context.debugRuntime) return context.debugRuntime;
	const existing = debugRuntimes.get(context);
	if (existing) return existing;
	const runtime = createExactServerDebugRuntime(context);
	debugRuntimes.set(context, runtime);
	return runtime;
}

/** Creates catalog, session, event, query, and streaming ownership for one server context. */
export function createExactServerDebugRuntime(
	context: ExactServerContext
): ExactServerDebugRuntime {
	const limits = normalizeLimits(context.debugLimits);
	const catalogs = createExactInspectionCatalogRegistry(context.inspectionCatalogs);
	const events = createExactInspectionEventBuffer({
		maxEvents: limits.maxEvents,
		maxBytes: limits.maxEventBytes
	});
	const sessions = createExactDebugSessionManager(context, limits);
	let closed = false;
	let observationSequence = 0;
	const runtime: ExactServerDebugRuntime = {
		async handle(request, input) {
			if (closed || !sameOrigin(request, context)) return unavailable();
			if (input.request === 'open') {
				const requested = input.capabilities?.length
					? input.capabilities
					: (['catalog', 'snapshot', 'events'] satisfies ExactDebugCapability[]);
				const session = await sessions.open(request, requested);
				if (!session) return unavailable();
				return jsonResponse(200, {
					ok: true,
					session: sessions.describe(session),
					catalogs: catalogs.builds().map((catalog) => ({
						buildKey: catalog.buildKey,
						executionRoots: Object.keys(catalog.roots)
					}))
				});
			}

			if (input.request === 'close') {
				const existed = sessions.close(input.sessionId);
				if (existed) await context.gateway?.closeDebugSession?.(input.sessionId, context);
				return existed ? jsonResponse(200, { ok: true }) : unavailable();
			}

			const capability = exactDebugCapabilityForRequest(input);
			const session = await sessions.require(request, input.sessionId, capability);
			if (!session) return unavailable();
			if (input.request === 'subscribe') {
				return eventStream(request, input, session.id, runtime, {
					context,
					events,
					sessions
				});
			}

			const response = await dispatchExactInspectionQuery(session, input.query, {
				context,
				catalogs,
				events,
				sessions,
				maxResults: limits.maxQueryResults,
				maxQueryDepth: limits.maxQueryDepth,
				maxSnapshotBytes: limits.maxSnapshotBytes,
				maxSourceExcerptBytes: limits.maxSourceExcerptBytes
			});
			audit(context, session.id, input.query.method, input.query.params?.identity, response);
			return jsonResponse(response.ok ? 200 : response.error === 'bad-request' ? 400 : 404, response);
		},
		async authorize(request, input) {
			if (closed || input.request === 'open' || input.request === 'close') return false;
			return !!(await sessions.require(
				request,
				input.sessionId,
				exactDebugCapabilityForRequest(input)
			));
		},
		async close() {
			if (closed) return;
			closed = true;
			sessions.closeAll();
			events.clear();
			catalogs.dispose();
		},
		publish(event) {
			if (closed) return;
			events.publish(event);
		},
		observe(event) {
			if (closed) return;
			for (const session of sessions.active()) {
				const sequence = ++observationSequence;
				events.publish(
					Object.freeze({
						protocol: 1,
						cursor: sequence.toString(36),
						sequence,
						timestamp: globalThis.performance?.now() ?? Date.now(),
						wallTime: Date.now(),
						kind: event.kind,
						id: Object.freeze({
							sessionId: session.id,
							side: 'server',
							buildKey: event.buildKey,
							executionRoot: event.executionRoot,
							componentTypeId: event.componentTypeId,
							...(event.instanceId ? { instanceId: event.instanceId } : {}),
							...(event.sourceEntityId ? { sourceEntityId: event.sourceEntityId } : {}),
							...(event.operationId ? { operationId: event.operationId } : {}),
							...(event.generation === undefined ? {} : { generation: event.generation })
						}),
						...(event.requestId ? { requestId: event.requestId } : {}),
						...(event.reason ? { reason: event.reason } : {}),
						...(event.attributes ? { attributes: event.attributes } : {})
					})
				);
			}
		},
		identityFor(sessionId, input) {
			return Object.freeze({
				sessionId,
				side: 'server',
				...input
			});
		}
	};
	return Object.freeze(runtime);
}

function eventStream(
	request: ExactRequestLike,
	input: Extract<ExactDebugRequest, { request: 'subscribe' }>,
	sessionId: string,
	runtime: ExactServerDebugRuntime,
	owners: Readonly<{
		context: ExactServerContext;
		events: ReturnType<typeof createExactInspectionEventBuffer>;
		sessions: ReturnType<typeof createExactDebugSessionManager>;
	}>
): ExactResponseLike {
	const encoder = new TextEncoder();
	let unsubscribe: (() => void) | undefined;
	let unregisterClose: (() => void) | undefined;
	let authorizationTimer: ReturnType<typeof setInterval> | undefined;
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let ended = false;
			const close = (): void => {
				if (ended) return;
				ended = true;
				unsubscribe?.();
				unregisterClose?.();
				if (authorizationTimer) clearInterval(authorizationTimer);
				controller.close();
			};
			const publish = (event: ExactRuntimeInspectionEvent): void => {
				void owners.sessions.require(request, sessionId, 'events').then((session) => {
					if (!session) {
						close();
						return;
					}
					controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
				});
			};
			unsubscribe = owners.events.subscribe(input.cursor, input.filter, publish);
			void owners.sessions.require(request, sessionId, 'events').then((session) => {
				if (!session) close();
				else {
					unregisterClose = owners.sessions.onClose(session, close);
					authorizationTimer = setInterval(() => {
						void owners.sessions
							.require(request, sessionId, 'events')
							.then((authorized) => {
								if (!authorized) close();
							});
					}, 1_000);
				}
			});
		},
		cancel() {
			unsubscribe?.();
			unregisterClose?.();
			if (authorizationTimer) clearInterval(authorizationTimer);
		}
	});
	void runtime;
	return {
		status: 200,
		headers: {
			'content-type': 'application/x-ndjson; charset=utf-8',
			'cache-control': 'no-store'
		},
		body: '',
		stream
	};
}

function sameOrigin(request: ExactRequestLike, context: ExactServerContext): boolean {
	const origin = requestHeader(request, 'origin');
	if (!origin) return true;
	try {
		const configured =
			typeof context.publicOrigin === 'string' || context.publicOrigin instanceof URL
				? new URL(context.publicOrigin).origin
				: request.url
					? new URL(request.url, origin).origin
					: undefined;
		return !!configured && new URL(origin).origin === configured;
	} catch {
		return false;
	}
}

function unavailable(): ExactResponseLike {
	return jsonResponse(404, { error: 'not_found' });
}

function normalizeLimits(limits: ExactDebugLimits | undefined): Required<ExactDebugLimits> {
	return {
		maxSessions: positive(limits?.maxSessions, 4, 100),
		maxSessionMinutes: positive(limits?.maxSessionMinutes, 30, 24 * 60),
		maxEvents: positive(limits?.maxEvents, 20_000, 1_000_000),
		maxEventBytes: positive(limits?.maxEventBytes, 4 * 1024 * 1024, 64 * 1024 * 1024),
		maxSnapshotBytes: positive(limits?.maxSnapshotBytes, 2 * 1024 * 1024, 16 * 1024 * 1024),
		maxQueryDepth: positive(limits?.maxQueryDepth, 20, 100),
		maxQueryResults: positive(limits?.maxQueryResults, 500, 10_000),
		maxSourceExcerptBytes: positive(limits?.maxSourceExcerptBytes, 64 * 1024, 1024 * 1024)
	};
}

function positive(value: number | undefined, fallback: number, maximum: number): number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
		? Math.min(value, maximum)
		: fallback;
}

function audit(
	context: ExactServerContext,
	sessionId: string,
	method: string,
	identity: ExactInspectionRuntimeId | undefined,
	response: unknown
): void {
	if (!context.onDebugAudit) return;
	context.onDebugAudit(
		Object.freeze({
			sessionId,
			method,
			...(identity?.binding ? { binding: identity.binding } : {}),
			...(identity?.buildKey ? { buildKey: identity.buildKey } : {}),
			...(identity?.executionRoot ? { executionRoot: identity.executionRoot } : {}),
			resultBytes: new TextEncoder().encode(JSON.stringify(response)).byteLength
		})
	);
}

function requestHeader(request: ExactRequestLike, name: string): string | undefined {
	if (!request.headers) return undefined;
	if (request.headers instanceof Headers) return request.headers.get(name) ?? undefined;
	for (const [key, value] of Object.entries(request.headers)) {
		if (key.toLowerCase() === name) return Array.isArray(value) ? value[0] : value;
	}
	return undefined;
}
