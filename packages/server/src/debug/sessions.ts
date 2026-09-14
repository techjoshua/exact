import type {
	ExactDebugCapability,
	ExactInspectionSessionDescription
} from '@exactjs/devtools-protocol';
import type {
	ExactDebugAuthorizationContext,
	ExactDebugLimits,
	ExactRequestLike,
	ExactServerContext
} from '../types.js';

/** Mutable runtime-owned session record never returned directly to a consumer. */
export type ExactDebugSession = {
	readonly id: string;
	readonly openedAt: number;
	readonly absoluteExpiry: number;
	expiresAt: number;
	readonly capabilities: Set<ExactDebugCapability>;
	readonly closeListeners: Set<() => void>;
	readonly authenticatedIdentity?: string;
};

/** Session lifecycle and revocation operations owned by one server context. */
export interface ExactDebugSessionManager {
	/** Authorizes request-scoped remote correlation without creating or coordinating retained sessions. */
	authorizeForwarded(
		request: ExactRequestLike,
		sessionId: string,
		capability: ExactDebugCapability
	): Promise<ExactDebugSession | undefined>;
	open(
		request: ExactRequestLike,
		capabilities: readonly ExactDebugCapability[]
	): Promise<ExactDebugSession | undefined>;
	require(
		request: ExactRequestLike,
		sessionId: string,
		capability: ExactDebugCapability
	): Promise<ExactDebugSession | undefined>;
	describe(session: ExactDebugSession): ExactInspectionSessionDescription;
	active(): readonly ExactDebugSession[];
	onClose(session: ExactDebugSession, listener: () => void): () => void;
	close(sessionId: string): boolean;
	closeAll(): void;
}

/** Creates opaque, expiring sessions with per-capability asynchronous authorization. */
export function createExactDebugSessionManager(
	context: ExactServerContext,
	limits: Required<Pick<ExactDebugLimits, 'maxSessions' | 'maxSessionMinutes'>>
): ExactDebugSessionManager {
	const sessions = new Map<string, ExactDebugSession>();
	let generation = 0;
	const lifetime = limits.maxSessionMinutes * 60_000;
	const inactivity = Math.min(lifetime, 5 * 60_000);
	const manager: ExactDebugSessionManager = {
		async authorizeForwarded(request, sessionId, capability) {
			const authorizingGeneration = generation;
			if (!sessionId || sessionId.length > 128 || /[\r\n\0]/.test(sessionId)) return undefined;
			if (!(await authorize(context, request, capability))) return undefined;
			const authenticatedIdentity = await resolveIdentity(context, request, capability);
			if (authenticatedIdentity === null || authorizingGeneration !== generation) return undefined;
			const openedAt = Date.now();
			return {
				id: sessionId,
				openedAt,
				absoluteExpiry: openedAt + lifetime,
				expiresAt: openedAt + inactivity,
				capabilities: new Set([capability]),
				closeListeners: new Set(),
				...(authenticatedIdentity ? { authenticatedIdentity } : {})
			};
		},
		async open(request, requested) {
			const openingGeneration = generation;
			prune();
			if (sessions.size >= limits.maxSessions) return undefined;
			const capabilities = [...new Set(requested)];
			for (const capability of capabilities) {
				if (!(await authorize(context, request, capability))) return undefined;
			}
			const authenticatedIdentity = await resolveIdentity(
				context,
				request,
				capabilities[0] ?? 'snapshot'
			);
			// Authorization yields to other opens and shutdown. Publish only in the generation
			// that started this request, with capacity checked at the actual insertion boundary.
			prune();
			if (
				authenticatedIdentity === null ||
				openingGeneration !== generation ||
				sessions.size >= limits.maxSessions
			)
				return undefined;
			const openedAt = Date.now();
			const session: ExactDebugSession = {
				id: randomSessionId(),
				openedAt,
				absoluteExpiry: openedAt + lifetime,
				expiresAt: Math.min(openedAt + inactivity, openedAt + lifetime),
				capabilities: new Set(capabilities),
				closeListeners: new Set(),
				...(authenticatedIdentity ? { authenticatedIdentity } : {})
			};
			sessions.set(session.id, session);
			return session;
		},
		async require(request, sessionId, capability) {
			const session = sessions.get(sessionId);
			if (!session || expired(session)) {
				manager.close(sessionId);
				return undefined;
			}
			if (!(await authorize(context, request, capability))) {
				manager.close(sessionId);
				return undefined;
			}
			if (sessions.get(sessionId) !== session) return undefined;
			if (expired(session)) {
				manager.close(sessionId);
				return undefined;
			}
			const authenticatedIdentity = await resolveIdentity(context, request, capability);
			// A captured record is not authority after an await: revocation and expiry win.
			if (sessions.get(sessionId) !== session) return undefined;
			if (
				expired(session) ||
				authenticatedIdentity === null ||
				authenticatedIdentity !== session.authenticatedIdentity
			) {
				manager.close(sessionId);
				return undefined;
			}
			session.capabilities.add(capability);
			session.expiresAt = Math.min(Date.now() + inactivity, session.absoluteExpiry);
			return session;
		},
		describe(session) {
			return Object.freeze({
				id: session.id,
				protocol: 1,
				openedAt: session.openedAt,
				expiresAt: session.expiresAt,
				capabilities: Object.freeze([...session.capabilities].sort())
			});
		},
		active() {
			prune();
			return Object.freeze([...sessions.values()]);
		},
		onClose(session, listener) {
			session.closeListeners.add(listener);
			return () => session.closeListeners.delete(listener);
		},
		close(sessionId) {
			const session = sessions.get(sessionId);
			if (!session) return false;
			sessions.delete(sessionId);
			for (const listener of session.closeListeners) listener();
			session.closeListeners.clear();
			return true;
		},
		closeAll() {
			generation++;
			for (const id of [...sessions.keys()]) manager.close(id);
		}
	};
	return Object.freeze(manager);

	function prune(): void {
		for (const [id, session] of sessions) if (expired(session)) manager.close(id);
	}
}

async function authorize(
	context: ExactServerContext,
	request: ExactRequestLike,
	capability: ExactDebugCapability
): Promise<boolean> {
	const policy = context.allowDebug;
	if (policy === undefined)
		return process.env.NODE_ENV !== 'production' && !!context.inspectionCatalogs?.length;
	if (typeof policy === 'boolean') return policy;
	try {
		return await policy(authorizationContext(context, request, capability));
	} catch {
		return false;
	}
}

async function resolveIdentity(
	context: ExactServerContext,
	request: ExactRequestLike,
	capability: ExactDebugCapability
): Promise<string | undefined | null> {
	if (!context.debugSessionIdentity) return undefined;
	try {
		const identity = await context.debugSessionIdentity(
			authorizationContext(context, request, capability)
		);
		return typeof identity === 'string' && identity.length > 0 && identity.length <= 512
			? identity
			: null;
	} catch {
		return null;
	}
}

function authorizationContext(
	context: ExactServerContext,
	request: ExactRequestLike,
	capability: ExactDebugCapability
): ExactDebugAuthorizationContext {
	return {
		request,
		platformRequest: request.platformRequest ?? context.platformRequest,
		capability,
		binding:
			requestHeader(request, 'x-exact-binding') ?? requestHeader(request, 'x-exact-debug-binding'),
		buildKey: requestHeader(request, 'x-exact-build'),
		executionRoots:
			context.inspectionCatalogs?.flatMap((catalog) => Object.keys(catalog.roots)) ?? []
	};
}

function expired(session: ExactDebugSession): boolean {
	const now = Date.now();
	return now >= session.expiresAt || now >= session.absoluteExpiry;
}

function randomSessionId(): string {
	const bytes = new Uint8Array(24);
	globalThis.crypto.getRandomValues(bytes);
	return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function requestHeader(request: ExactRequestLike, name: string): string | undefined {
	if (!request.headers) return undefined;
	if (request.headers instanceof Headers) return request.headers.get(name) ?? undefined;
	for (const [key, value] of Object.entries(request.headers)) {
		if (key.toLowerCase() === name) return Array.isArray(value) ? value[0] : value;
	}
	return undefined;
}
