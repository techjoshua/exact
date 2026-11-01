import { createExactRuntimeInspectionOwner } from '@exactjs/core';
import { isPromiseLike } from '@exactjs/core/framework/async-values';
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
import { createExactDebugSessionManager, type ExactDebugSession } from './sessions.js';
import { debugRequestOrigin } from './request-origin.js';
import { protocolUtf8ByteLength as utf8Length } from '@exactjs/core/framework/protocol-records';

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
				if (!sessionIsLive(session, request)) {
					sessions.close(session.id);
					return unavailable();
				}

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
				return existed ? jsonResponse(200, { ok: true }) : unavailable();
			}
			if (input.request === 'subscribe') return unavailable();
			const session = await requireSession(
				request,
				input.sessionId,
				exactDebugCapabilityForRequest(input)
			);
			if (!session || !sessionIsLive(session, request)) return unavailable();
			const response = await dispatchExactInspectionQuery(session, input.query, {
				context,
				catalogs,
				sessions,
				maxResults: limits.maxQueryResults,
				maxQueryDepth: limits.maxQueryDepth,
				maxSnapshotBytes: limits.maxSnapshotBytes,
				maxSourceExcerptBytes: limits.maxSourceExcerptBytes
			});
			// Query services can settle after their authorization owner has retired.
			if (!sessionIsLive(session, request)) return unavailable();
			audit(context, session.id, input.query.method, input.query.params?.identity, response.body);
			return sessionIsLive(session, request) ? response : unavailable();
		},
		async authorize(request, input) {
			if (
				closed ||
				!sameOrigin(request, context) ||
				input.request === 'open' ||
				input.request === 'close'
			)
				return false;
			const session = await requireSession(
				request,
				input.sessionId,
				exactDebugCapabilityForRequest(input)
			);
			return sessionIsLive(session, request);
		},
		async createRequestRuntime(request, sessionId) {
			if (closed || !sameOrigin(request, context)) return undefined;
			const session = await requireSession(request, sessionId, 'events');
			return session && sessionIsLive(session, request)
				? createRequestDebugRuntime(
						session.id,
						limits.maxEvents,
						limits.maxEventBytes,
						requestHeader(request, 'x-exact-debug-binding'),
						() => sessionIsLive(session, request)
					)
				: undefined;
		},
		async close() {
			if (closed) return;
			closed = true;
			sessions.closeAll();
			catalogs.dispose();
		},
		registerCatalog(catalog) {
			if (closed) throw new Error('Cannot register a catalog on a closed debug runtime');
			return catalogs.register(catalog);
		},
		identityFor(sessionId, input) {
			return { sessionId, side: 'server', ...input };
		}
	};
	/** Rechecks retained authorization after services and application callbacks can retire it. */
	function sessionIsLive(
		session: ExactDebugSession | undefined,
		request: ExactRequestLike
	): boolean {
		return !!session && !closed && sessions.isActive(session) && !request.signal?.aborted;
	}
	function requireSession(
		request: ExactRequestLike,
		sessionId: string,
		capability: ExactDebugCapability
	) {
		const binding = requestHeader(request, 'x-exact-debug-binding');
		return binding && requestHeader(request, 'x-exact-debug-session') === sessionId
			? sessions.authorizeForwarded(request, sessionId, capability)
			: sessions.require(request, sessionId, capability);
	}

	return runtime;
}

function createRequestDebugRuntime(
	sessionId: string,
	maxEvents: number,
	maxBytes: number,
	binding: string | undefined,
	isLive: () => boolean
): ExactServerRequestDebugRuntime {
	const events: Array<{ payload: string; bytes: number }> = [];
	const encoder = new TextEncoder();
	const owners = new Set<() => void>();
	let retainedBytes = 0;
	let sequence = 0;
	let closed = false;
	let retired = false;
	const runtime: ExactServerRequestDebugRuntime = {
		inspectionOwner(options) {
			if (closed) throw new Error('Cannot inspect through a disposed request');
			const { buildKey, executionRoot, binding: ownerBinding, ...extra } = options;
			const owner = createExactRuntimeInspectionOwner({
				...extra,
				buildKey,
				executionRoot,
				binding: binding || ownerBinding,
				side: 'server'
			});
			if (active()) {
				owner.attach(sessionId, runtime);
				const detach = owner.detach;
				owners.add(() => Reflect.apply(detach, owner, [sessionId]));
			}
			return owner;
		},
		publish(event) {
			if (!active()) return;
			const payload = JSON.stringify(event);
			const captured = JSON.parse(payload) as ExactRuntimeInspectionEvent;
			if (!isExactRuntimeInspectionEvent(captured) || captured.id.sessionId !== sessionId) return;
			retain(payload);
		},
		observe(event) {
			if (!active()) return;
			event = JSON.parse(JSON.stringify(event)) as typeof event;
			if (!active()) return;
			const current = ++sequence;
			retain(
				JSON.stringify({
					protocol: 1,
					cursor: current.toString(36),
					sequence: current,
					timestamp: globalThis.performance?.now() ?? Date.now(),
					wallTime: Date.now(),
					kind: event.kind,
					id: {
						sessionId,
						side: 'server',
						...((binding ?? event.binding) ? { binding: binding ?? event.binding } : {}),
						buildKey: event.buildKey,
						executionRoot: event.executionRoot,
						componentTypeId: event.componentTypeId,
						...(event.instanceId ? { instanceId: event.instanceId } : {}),
						...(event.sourceEntityId ? { sourceEntityId: event.sourceEntityId } : {}),
						...(event.operationId ? { operationId: event.operationId } : {}),
						...(event.generation === undefined ? {} : { generation: event.generation })
					},
					...(event.requestId ? { requestId: event.requestId } : {}),
					...(event.reason ? { reason: event.reason } : {}),
					...(event.attributes ? { attributes: event.attributes } : {})
				})
			);
		},
		drain() {
			if (!active() || !events.length) return [];
			const drained = events.map(
				({ payload }) => JSON.parse(payload) as ExactRuntimeInspectionEvent
			);
			events.length = 0;
			retainedBytes = 0;
			return drained;
		},
		dispose() {
			if (closed) return;
			closed = true;
			release();
		}
	};
	return runtime;

	/** Retires once, including after reentrant event capture, without canceling business work. */
	function active(): boolean {
		if (closed || retired) return false;
		if (isLive()) return true;
		retired = true;
		release();
		return false;
	}

	/** Releases request inspection resources independently of mutable public owner methods. */
	function release(): void {
		for (const detach of owners) detach();
		owners.clear();
		events.length = 0;
		retainedBytes = 0;
	}

	function retain(payload: string): void {
		if (!active()) return;
		const bytes = encoder.encode(payload).byteLength;
		if (bytes > maxBytes) return;
		events.push({ payload, bytes });
		retainedBytes += bytes;
		while (events.length > maxEvents || retainedBytes > maxBytes)
			retainedBytes -= events.shift()!.bytes;
	}
}

function sameOrigin(request: ExactRequestLike, context: ExactServerContext): boolean {
	const origin = requestHeader(request, 'origin');
	if (origin === undefined)
		return context.allowDebug !== undefined || context.debugSessionIdentity !== undefined;
	try {
		const configured = debugRequestOrigin(request, context);
		const supplied = new URL(origin);
		return !!configured && supplied.origin === configured && origin === supplied.origin;
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
	body: string
): void {
	try {
		const notification = context.onDebugAudit?.({
			sessionId,
			method,
			...(identity?.binding ? { binding: identity.binding } : {}),
			...(identity?.buildKey ? { buildKey: identity.buildKey } : {}),
			...(identity?.executionRoot ? { executionRoot: identity.executionRoot } : {}),
			resultBytes: utf8Length(body)
		});
		if (isPromiseLike(notification)) void Promise.resolve(notification).catch(() => {});
	} catch {
		// Notification failures leave live query authority intact.
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
