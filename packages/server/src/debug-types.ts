import type { ExactRuntimeInspectionOwner } from '@exactjs/core';
import type {
	ExactBuildInspectionCatalog,
	ExactDebugCapability,
	ExactDebugRequest,
	ExactInspectionRuntimeId,
	ExactRuntimeInspectionEvent
} from '@exactjs/devtools-protocol';
import type { ExactRequestLike, ExactResponseLike } from './types.js';

/** Boolean or application-owned asynchronous debug authorization policy. */
export type ExactAllowDebug =
	| boolean
	| ((context: ExactDebugAuthorizationContext) => boolean | Promise<boolean>);

/** Application-owned authenticated identity used to prevent session transfer between operators. */
export type ExactDebugSessionIdentity = (
	context: ExactDebugAuthorizationContext
) => string | undefined | Promise<string | undefined>;

/** Trusted request context supplied to the application-owned debug authorizer. */
export type ExactDebugAuthorizationContext = Readonly<{
	request: ExactRequestLike;
	platformRequest?: unknown;
	capability: ExactDebugCapability;
	binding?: string;
	buildKey?: string;
	executionRoots: readonly string[];
}>;

/** Conservative limits applied to debug sessions, queries, and each request's observations. */
export type ExactDebugLimits = Readonly<{
	maxSessions?: number;
	maxSessionMinutes?: number;
	maxEvents?: number;
	maxEventBytes?: number;
	maxSnapshotBytes?: number;
	maxQueryDepth?: number;
	maxQueryResults?: number;
	maxSourceExcerptBytes?: number;
}>;

/** Metadata-only audit record chosen by the application for security accounting. */
export type ExactDebugAuditEvent = Readonly<{
	sessionId: string;
	method: string;
	binding?: string;
	buildKey?: string;
	executionRoot?: string;
	resultBytes: number;
}>;

/** Internal server debug runtime kept opaque to adapters and application code. */
export interface ExactServerDebugRuntime {
	handle(request: ExactRequestLike, input: ExactDebugRequest): Promise<ExactResponseLike>;
	/** Revalidates a page session before the binding gateway creates or uses a remote child. */
	authorize(request: ExactRequestLike, input: ExactDebugRequest): Promise<boolean>;
	/** Authorizes one ordinary request to return observations to an attached browser session. */
	createRequestRuntime(
		request: ExactRequestLike,
		sessionId: string
	): Promise<ExactServerRequestDebugRuntime | undefined>;
	close(): Promise<void>;
	/** Registers one retained build catalog; disposing the handle retires that exact build. */
	registerCatalog(catalog: ExactBuildInspectionCatalog): Readonly<{ dispose(): void }>;
	identityFor(
		sessionId: string,
		input: Omit<ExactInspectionRuntimeId, 'sessionId' | 'side'>
	): ExactInspectionRuntimeId;
}

/** Observation collector owned and disposed by exactly one server request. */
export interface ExactServerRequestDebugRuntime {
	/** Creates a root owner attached only to this request's bounded collector. */
	inspectionOwner(
		options: Readonly<{ buildKey: string; executionRoot: string; binding?: string }>
	): ExactRuntimeInspectionOwner;
	publish(event: ExactRuntimeInspectionEvent): void;
	/** Publishes one server observation into this request's bounded response attachment. */
	observe(
		event: Readonly<{
			kind: ExactRuntimeInspectionEvent['kind'];
			buildKey: string;
			executionRoot: string;
			binding?: string;
			componentTypeId: string;
			instanceId?: string;
			sourceEntityId?: string;
			operationId?: string;
			generation?: number;
			requestId?: string;
			reason?: string;
			attributes?: ExactRuntimeInspectionEvent['attributes'];
		}>
	): void;
	drain(): readonly ExactRuntimeInspectionEvent[];
	dispose(): void;
}
