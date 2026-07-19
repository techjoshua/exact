import type { ComponentFunction, ErrorReport, Logger, UnsafeHtmlAuditEvent } from '@exact/core';
import type { ExactProfileEvent, ExactProfileSink } from '@exact/instrumentation';
import type {
	ExactInvocationKind,
	ExactInvocationRequest,
	ExactInvocationResult,
	ExactOperationResult,
	ExactPatch,
	ExactStateContract
} from '@exact/server';

/** Configures hydrate. */
export type HydrateOptions = {
	/** Compiler registry fingerprint for the client artifact. */
	clientPluginRegistryFingerprint?: string;
	endpoint?: string;
	endpoints?: ExactEndpointRoutes;
	state?: unknown;
	logger?: Logger;
	onMismatch?: 'replace' | 'throw';
	fetch?: FetchLike;
	headers?: Record<string, string>;
	transports?: Record<string, ExactEndpointTransport>;
	stateContracts?: Record<string, ExactStateContract>;
	actionBoundaries?: Record<string, readonly string[]>;
	islands?: ClientIslandRegistry;
	batch?: boolean;
	stream?: boolean;
	streamLimits?: ExactStreamLimits;
	signal?: AbortSignal;
	onDiagnostic?: (diagnostic: HydrationDiagnostic) => void;
	/** Observes component failures that reach the hydrated renderer root. */
	onErrorReport?: (report: ErrorReport) => void;
	/** Allows a component root to adopt compatible markup without eXact markers. */
	allowMarkerless?: boolean;
	/** Maximum DOM render values processed by one hydration/adoption update. */
	maxTreeNodes?: number;
	/** Maximum DOM vnode depth processed by hydration/adoption. */
	maxTreeDepth?: number;
	/** Allows unsafeHtml() ranges and accepts responsibility for their contents. */
	allowUnsafeHtml?: boolean;
	/** Receives an audit notification whenever an unsafe HTML range is adopted or mounted. */
	onUnsafeHtml?: (event: UnsafeHtmlAuditEvent) => void;
	/** Limits applied before accepting serialized hydration bootstrap data. */
	configLimits?: ExactHydrationConfigLimits;
	/** Receives hydration and nested renderer profiling observations. */
	onProfile?: ExactProfileSink;
};

/** Reports an observable hydrate profile event. */
export type HydrateProfileEvent = ExactProfileEvent<'hydrate', 'hydrate'>;

/** Defines the exact hydration config limits type contract. */
export type ExactHydrationConfigLimits = {
	/** Maximum encoded bootstrap bytes. Defaults to 16 MiB. */
	maxBytes?: number;
	/** Maximum bootstrap JSON graph depth. Defaults to 100. */
	maxDepth?: number;
	/** Maximum bootstrap JSON values/properties. Defaults to 100,000. */
	maxNodes?: number;
};

/** Defines the hydration diagnostic type contract. */
export type HydrationDiagnostic = {
	code: 'missing-markers' | 'adoption-mismatch' | 'invalid-patch' | 'stale-response';
	message: string;
	patch?: { type: string; id: string };
};

/** Configures exact hydration. */
export type ExactHydrationConfig = {
	pluginRegistryFingerprint?: string;
	endpoint?: string;
	endpoints?: ExactEndpointRoutes;
	state?: unknown;
	stateContracts?: Record<string, ExactStateContract>;
	actionBoundaries?: Record<string, readonly string[]>;
};

/** Defines the exact hydration registration type contract. */
export type ExactHydrationRegistration = ExactHydrationConfig & {
	islands?: ClientIslandRegistry;
	transports?: Record<string, ExactEndpointTransport>;
};

/** Defines the exact endpoint routes type contract. */
export type ExactEndpointRoutes = {
	actions?: Record<string, string>;
	boundaries?: Record<string, string>;
};

/** Defines the client island registry type contract. */
export type ClientIslandRegistry = Record<string, ComponentFunction<any, any>>;

/** Defines the fetch like type contract. */
export type FetchLike = (
	input: string,
	init: {
		method: string;
		headers: Record<string, string>;
		body: string;
		signal?: AbortSignal;
	}
) => Promise<{
	ok: boolean;
	status: number;
	body?: ReadableStream<Uint8Array> | null;
	json(): Promise<unknown>;
	text?(): Promise<string>;
}>;

/** Defines the exact endpoint transport type contract. */
export type ExactEndpointTransport = {
	fetch?: FetchLike;
	headers?: Record<string, string>;
};

/** Defines the exact client type contract. */
export type ExactClient = {
	readonly endpoint?: string;
	readonly endpoints?: ExactEndpointRoutes;
	state?: unknown;
	readonly stateContracts?: Record<string, ExactStateContract>;
	applyPatches(patches: readonly ExactPatch[]): boolean;
	invokeAction(id: string, payload?: unknown): Promise<ExactInvocationResult>;
	refreshBoundary(id: string, payload?: unknown): Promise<ExactInvocationResult>;
	refreshIsland(
		id: string,
		registry: ClientIslandRegistry,
		payload?: unknown
	): Promise<ExactInvocationResult>;
	registerManifest(config: ExactHydrationRegistration): void;
	/** Releases client requests, renderer scopes, listeners, and root ownership. */
	dispose(): void;
};

/** Defines the hydration root type contract. */
export type HydrationRoot = ExactClient;

/** Configures invoke exact. */
export type InvokeExactOptions = {
	endpoint: string;
	type: ExactInvocationKind;
	id: string;
	payload?: unknown;
	state?: unknown;
	context?: Record<string, unknown>;
	boundaryHtml?: string;
	boundaryHtmls?: Record<string, string>;
	fetch?: FetchLike;
	headers?: Record<string, string>;
	logger?: Logger;
	stream?: boolean;
	streamLimits?: ExactStreamLimits;
	signal?: AbortSignal;
};

/** Configures invoke exact batch. */
export type InvokeExactBatchOptions = {
	endpoint: string;
	operations: readonly ExactInvocationRequest[];
	fetch?: FetchLike;
	headers?: Record<string, string>;
	logger?: Logger;
	stream?: boolean;
	streamLimits?: ExactStreamLimits;
	signal?: AbortSignal;
};

/** Defines the pending exact operation type contract. */
export type PendingExactOperation = {
	operation: ExactInvocationRequest;
	resolve(result: ExactInvocationResult): void;
	reject(error: unknown): void;
};

/** Defines the exact batch queue type contract. */
export type ExactBatchQueue = {
	endpoint: string;
	fetch?: FetchLike;
	headers?: Record<string, string>;
	headersKey: string;
	logger?: Logger;
	stream?: boolean;
	streamLimits?: ExactStreamLimits;
	signal?: AbortSignal;
	pending: PendingExactOperation[];
	scheduled: boolean;
	active?: number;
};

/** Defines the exact stream limits type contract. */
export type ExactStreamLimits = {
	/** Maximum encoded response bytes. Defaults to 16 MiB. */
	maxBytes?: number;
	/** Maximum non-empty NDJSON events. Defaults to 100,000. */
	maxEvents?: number;
	/** Maximum request envelope bytes. Defaults to 4 MiB. */
	maxRequestBytes?: number;
	/** Maximum JSON graph depth. Defaults to 100. */
	maxJsonDepth?: number;
	/** Maximum JSON values/properties traversed. Defaults to 100,000. */
	maxJsonNodes?: number;
	/** Maximum patches accepted in one result. Defaults to 10,000. */
	maxPatches?: number;
};

export type {
	ExactInvocationKind,
	ExactInvocationRequest,
	ExactInvocationResult,
	ExactOperationResult,
	ExactPatch,
	ExactStateContract
};
