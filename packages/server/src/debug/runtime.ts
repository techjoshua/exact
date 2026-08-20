import { createExactRuntimeInspectionOwner } from '@exactjs/core';
import {
	exactDebugCapabilityForRequest,
	isExactRuntimeInspectionEvent,
	type ExactDebugCapability,
	type ExactInspectionRuntimeId,
	type ExactRuntimeInspectionEvent
} from '@exactjs/devtools-protocol';
import { jsonResponse } from '../protocol.js';
import type {
	ExactDebugLimits,
	ExactRequestLike,
	ExactResponseLike,
	ExactServerContext,
	ExactServerDebugRuntime,
	ExactServerRequestDebugRuntime
} from '../types.js';
import { createExactInspectionCatalogRegistry } from './catalog-registry.js';
import { dispatchExactInspectionQuery } from './queries.js';
import { createExactDebugSessionManager } from './sessions.js';

const debugRuntimes = new WeakMap<ExactServerContext, ExactServerDebugRuntime>();

/** Returns the stable catalog and authorization service for one reusable server context. */
export function exactServerDebugRuntime(context: ExactServerContext): ExactServerDebugRuntime {
	if (context.debugRuntime) return context.debugRuntime;
	const existing = debugRuntimes.get(context);
	if (existing) return existing;
	const runtime = createExactServerDebugRuntime(context);
	debugRuntimes.set(context, runtime);
	return runtime;
}

/** Couples one server-owned inspection catalog to its retained build lifecycle. */
export function registerExactInspectionCatalog(
	context: ExactServerContext,
	catalog: Parameters<ExactServerDebugRuntime['registerCatalog']>[0]
): Readonly<{ dispose(): void }> {
	return exactServerDebugRuntime(context).registerCatalog(catalog);
}

/** Creates application-scoped catalogs and authorization without retaining runtime events. */
export function createExactServerDebugRuntime(
	context: ExactServerContext
): ExactServerDebugRuntime {
	const limits = normalizeLimits(context.debugLimits);
	const catalogs = createExactInspectionCatalogRegistry(context.inspectionCatalogs);
	const sessions = createExactDebugSessionManager(context, limits);
	const gatewayClosures = new Map<string, Promise<void>>();
	let closed = false;
	const runtime: ExactServerDebugRuntime = {
		async handle(request, input) {
			if (closed || !sameOrigin(request, context)) return unavailable();
			if (input.request === 'open') {
				const requested = input.capabilities?.length
					? input.capabilities
					: (['catalog', 'snapshot', 'events'] satisfies ExactDebugCapability[]);
				const session = await sessions.open(request, requested);
				if (!session) return unavailable();
				sessions.onClose(session, () => {
					const closure = Promise.resolve(
						context.gateway?.closeDebugSession?.(session.id, context)
					)
						.catch(() => undefined)
						.finally(() => gatewayClosures.delete(session.id));
					gatewayClosures.set(session.id, closure);
				});
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
				if (existed) await gatewayClosures.get(input.sessionId);
				return existed ? jsonResponse(200, { ok: true }) : unavailable();
			}
			if (input.request === 'subscribe') return unavailable();
			const session = await sessions.require(
				request,
				input.sessionId,
				exactDebugCapabilityForRequest(input)
			);
			if (!session) return unavailable();
			const response = await dispatchExactInspectionQuery(session, input.query, {
				context,
				catalogs,
				sessions,
				maxResults: limits.maxQueryResults,
				maxQueryDepth: limits.maxQueryDepth,
				maxSnapshotBytes: limits.maxSnapshotBytes,
				maxSourceExcerptBytes: limits.maxSourceExcerptBytes
			});
			audit(context, session.id, input.query.method, input.query.params?.identity, response);
			return jsonResponse(
				response.ok ? 200 : response.error === 'bad-request' ? 400 : 404,
				response
			);
		},
		async authorize(request, input) {
			if (closed || input.request === 'open' || input.request === 'close') return false;
			return !!(await sessions.require(
				request,
				input.sessionId,
				exactDebugCapabilityForRequest(input)
			));
		},
		async createRequestRuntime(request, sessionId) {
			if (closed || !sameOrigin(request, context)) return undefined;
			const session = await sessions.require(request, sessionId, 'events');
			return session
				? createRequestDebugRuntime(session.id, limits.maxEvents, limits.maxEventBytes)
				: undefined;
		},
		async close() {
			if (closed) return;
			closed = true;
			sessions.closeAll();
			await Promise.all(gatewayClosures.values());
			catalogs.dispose();
		},
		registerCatalog(catalog) {
			if (closed) throw new Error('Cannot register a catalog on a closed debug runtime');
			return catalogs.register(catalog);
		},
		identityFor(sessionId, input) {
			return Object.freeze({ sessionId, side: 'server', ...input });
		}
	};
	return Object.freeze(runtime);
}

function createRequestDebugRuntime(
	sessionId: string,
	maxEvents: number,
	maxBytes: number
): ExactServerRequestDebugRuntime {
	const events: Array<{ event: ExactRuntimeInspectionEvent; bytes: number }> = [];
	const owners = new Set<ReturnType<typeof createExactRuntimeInspectionOwner>>();
	let retainedBytes = 0;
	let sequence = 0;
	let closed = false;
	const runtime: ExactServerRequestDebugRuntime = {
		inspectionOwner(options) {
			if (closed) throw new Error('Cannot inspect through a disposed request');
			const owner = createExactRuntimeInspectionOwner({ ...options, side: 'server' });
			owner.attach(sessionId, runtime);
			owners.add(owner);
			return owner;
		},
		publish(event) {
			if (closed || !isExactRuntimeInspectionEvent(event) || event.id.sessionId !== sessionId)
				return;
			retain(event);
		},
		observe(event) {
			if (closed) return;
			const current = ++sequence;
			retain(
				Object.freeze({
					protocol: 1,
					cursor: current.toString(36),
					sequence: current,
					timestamp: globalThis.performance?.now() ?? Date.now(),
					wallTime: Date.now(),
					kind: event.kind,
					id: Object.freeze({
						sessionId,
						side: 'server',
						...(event.binding ? { binding: event.binding } : {}),
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
		},
		drain() {
			if (closed || !events.length) return Object.freeze([]);
			const drained = Object.freeze(events.map(({ event }) => event));
			events.length = 0;
			retainedBytes = 0;
			return drained;
		},
		dispose() {
			if (closed) return;
			closed = true;
			for (const owner of owners) owner.detach(sessionId);
			owners.clear();
			events.length = 0;
			retainedBytes = 0;
		}
	};
	return Object.freeze(runtime);

	function retain(event: ExactRuntimeInspectionEvent): void {
		const bytes = new TextEncoder().encode(JSON.stringify(event)).byteLength;
		if (bytes > maxBytes) return;
		events.push({ event, bytes });
		retainedBytes += bytes;
		while (events.length > maxEvents || retainedBytes > maxBytes)
			retainedBytes -= events.shift()!.bytes;
	}
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
	try {
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
	} catch {
		// Application audit failures cannot change an authorized read-only query.
	}
}

function requestHeader(request: ExactRequestLike, name: string): string | undefined {
	if (!request.headers) return undefined;
	if (request.headers instanceof Headers) return request.headers.get(name) ?? undefined;
	for (const [key, value] of Object.entries(request.headers)) {
		if (key.toLowerCase() === name) return Array.isArray(value) ? value[0] : value;
	}
	return undefined;
}
