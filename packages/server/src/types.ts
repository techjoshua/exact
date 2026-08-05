import type {
	ComponentContextValues,
	ContextToken,
	ExactComponentBoundaryContract,
	ExactComponentContinuationContract,
	ExactComponentContinuationExecutorContract,
	ExactCollectionMutation,
	ExactComponentAuthorizationIdentity,
	ComponentResumptionActivation,
	Logger
} from '@exactjs/core';
import type { ExactProfileEvent, ExactProfileSink } from '@exactjs/instrumentation';
import type {
	ExactBuildInspectionCatalog,
	ExactDebugRequest,
	ExactInspectionQueryService
} from '@exactjs/devtools-protocol';
import type { ExactOutputExtension } from '@exactjs/plugin-api';
import type { RequestContextValue, RequestResponseState } from '@exactjs/request';

export type { ExactCollectionMutation } from '@exactjs/core';
export type {
	ExactAllowDebug,
	ExactDebugAuditEvent,
	ExactDebugAuthorizationContext,
	ExactDebugLimits,
	ExactDebugSessionIdentity,
	ExactServerDebugRuntime
} from './debug-types.js';
import type {
	ExactAllowDebug,
	ExactDebugAuditEvent,
	ExactDebugLimits,
	ExactDebugSessionIdentity,
	ExactServerDebugRuntime
} from './debug-types.js';

/** Defines the exact invocation kind type contract. */
export type ExactInvocationKind = 'invoke' | 'refresh';

/** Runtime authority for one concrete compiler-planned partition instance. */
export type ExactPartitionDiscriminator =
	| Readonly<{ kind: 'single' }>
	| Readonly<{ kind: 'branch'; branch: string }>
	| Readonly<{ kind: 'keyed'; list: string; keyToken: string }>;

/** Runtime authority for one concrete compiler-planned partition instance. */
export type ExactPartitionAuthority = Readonly<{
	version: 1;
	buildKey: string;
	executionRoot: string;
	planEdgeId: string;
	ownerComponentId: string;
	discriminator: ExactPartitionDiscriminator;
	generation: number;
}>;

/** Immutable allowlist composed from explicitly imported executor artifacts. */
export type ExactExecutorContract = {
	version: 1;
	endpoint?: string;
	endpoints?: ExactEndpointRoutes;
	invocations: Record<string, ExactComponentContinuationContract>;
	/** Compiler-generated handlers; absent when a contract contains only application invocations. */
	executors?: Record<string, ExactComponentContinuationExecutorContract>;
	boundaries: Record<string, ExactComponentBoundaryContract>;
};

/** Defines the exact endpoint routes type contract. */
export type ExactEndpointRoutes = {
	invocations?: Record<string, string>;
	boundaries?: Record<string, string>;
};

/** Defines the exact state contract type contract. */
export type ExactStateContract = {
	reads?: ExactStatePath[];
	writes?: ExactStatePath[];
};

/** Defines the exact context effect type contract. */
export type ExactContextEffect = {
	token: string;
	kind: 'read' | 'write';
	confidence: 'exact' | 'unknown';
};

/** Defines the exact state path type contract. */
export type ExactStatePath = {
	path: string;
	kind: 'read' | 'write';
	confidence: 'exact' | 'broad' | 'unknown';
	operation?: 'value' | 'map' | 'set';
};

/** Configures executor composition from imported component contracts. */
export type ComposeExactExecutorContractOptions = {
	endpoint?: string;
	endpoints?: ExactEndpointRoutes;
	invocations?: Record<string, ExactComponentContinuationContract>;
	boundaries?: Record<string, ExactComponentBoundaryContract>;
};

/** Defines the exact request like type contract. */
export type ExactRequestLike = {
	method: string;
	url?: string | URL;
	headers?: Headers | Record<string, string | string[] | undefined>;
	body?: unknown;
	text?(): Promise<string>;
	json?(): Promise<unknown>;
	signal?: AbortSignal;
	/** Adapter-owned original request object; never read from the invocation body. */
	platformRequest?: unknown;
};

/** Carries the context required by exact context factory. */
export type ExactContextFactoryContext = {
	scope: 'application' | 'request';
	signal: AbortSignal;
	request?: RequestContextValue;
	platformRequest?: unknown;
	get<T>(token: ContextToken<T>): Promise<T>;
};

/** Defines the exact context factory type contract. */
export type ExactContextFactory<T> = {
	create(context: ExactContextFactoryContext): T | Promise<T>;
	dispose?(value: T, reason?: unknown): void | Promise<void>;
};

/** Defines the exact context value type contract. */
export type ExactContextValue<T> = {
	value: T;
};

/** Defines the exact context registration type contract. */
export type ExactContextRegistration<T = unknown> = readonly [
	token: ContextToken<T>,
	source: ExactContextValue<T> | ExactContextFactory<T>
];

/** Defines the exact request context registration source type contract. */
export type ExactRequestContextRegistrationSource =
	| readonly ExactContextRegistration<any>[]
	| ((
			context: ExactContextFactoryContext
	  ) =>
			| readonly ExactContextRegistration<any>[]
			| Promise<readonly ExactContextRegistration<any>[]>);

/** Defines the exact context overrides type contract. */
export type ExactContextOverrides = {
	/** Trusted application-supplied test values; never populated from request data. */
	application?: readonly (readonly [ContextToken<any>, unknown])[];
	/** Trusted application-supplied test values; never populated from request data. */
	request?: readonly (readonly [ContextToken<any>, unknown])[];
};

/** Reports a server-owned context token used by one generated continuation, never its value. */
export type ExactServerContextAccessObservation = Readonly<{
	operationId: string;
	componentId: string;
	token: string;
	scope: ContextToken<any>['scope'];
}>;

/** Configures exact server context. */
export type ExactServerContextConfiguration = {
	/** Compact authorization identity required from coordinated client artifacts. */
	componentAuthorization?: ExactComponentAuthorizationIdentity;
	/**
	 * Trusted externally visible application origin. A resolver is an explicit
	 * deployment trust boundary and must apply the host server's proxy policy.
	 */
	publicOrigin?: string | URL | ((request: ExactPublicOriginRequest) => string | URL);
	applicationContexts?: readonly ExactContextRegistration<any>[];
	requestContexts?: ExactRequestContextRegistrationSource;
	contextOverrides?: ExactContextOverrides;
	/** Observes generated continuation context access without disclosing the resolved value. */
	onContextAccess?: (observation: ExactServerContextAccessObservation) => void;
	/** Server-owned build catalogs. Rich metadata must never be reachable from a client entry. */
	inspectionCatalogs?: readonly ExactBuildInspectionCatalog[];
	/** Authorizes one session or capability and defaults off in production. */
	allowDebug?: ExactAllowDebug;
	/** Selects the authenticated browser/operator identity bound to an opened debug session. */
	debugSessionIdentity?: ExactDebugSessionIdentity;
	/** Resource ceilings for bounded inspection sessions, snapshots, events, and source excerpts. */
	debugLimits?: ExactDebugLimits;
	/** Optional live snapshot/query projection for server-owned runtime observations. */
	inspectionQueryService?: ExactInspectionQueryService;
	/** Optional protected source content selected only after catalog hash validation. */
	inspectionSources?: Readonly<
		Record<
			string,
			Readonly<{
				buildKey: string;
				executionRoot: string;
				sourceHash: string;
				content: string;
				/** Required when the selected catalog contains any secret-qualified source. */
				redacted?: boolean;
			}>
		>
	>;
	/** Receives metadata-only debug audit records; state and preview values are never included. */
	onDebugAudit?: (event: ExactDebugAuditEvent) => void;
};

/** Untrusted request metadata available to an application-owned public-origin resolver. */
export type ExactPublicOriginRequest = Readonly<{
	url?: string | URL;
	headers?: Headers | Record<string, string | string[] | undefined>;
	platformRequest?: unknown;
}>;

/** Defines the exact context scope type contract. */
export type ExactContextScope = {
	readonly kind: 'application' | 'request';
	readonly componentValues: ComponentContextValues;
	get<T>(token: ContextToken<T>): Promise<T>;
	getSync<T>(token: ContextToken<T>): T;
	/** Replaces a request-local value for compiler-authorized continuation work. */
	setSync?<T>(token: ContextToken<T>, value: T): void;
};

/** Defines the exact context runtime type contract. */
export type ExactContextRuntime = {
	open(
		request: ExactRequestLike,
		platformRequest?: unknown
	): Promise<{
		context: ExactContextScope;
		request: RequestContextValue;
		response: RequestResponseState;
		dispose(reason?: unknown): Promise<void>;
	}>;
	dispose(reason?: unknown): Promise<void>;
};

/** Defines the exact response like type contract. */
export type ExactResponseLike = {
	status: number;
	headers: Record<string, string>;
	body: string;
	stream?: ReadableStream<Uint8Array>;
};

/** Defines the exact invocation request type contract. */
export type ExactInvocationRequest = {
	type: ExactInvocationKind;
	/** Compiler-generated namespace in which id and patch targets are interpreted. */
	root?: string;
	id: string;
	/** Required when refreshing a compiler-planned partition range. */
	partition?: ExactPartitionAuthority;
	opId?: string;
	dependsOn?: string[];
	payload?: unknown;
	state?: unknown;
	/** Compiler-approved shared context projections; never server resource values. */
	publicContext?: Record<string, unknown>;
	boundaryHtml?: string;
	boundaryHtmls?: Record<string, string>;
};

/** Full top-level protocol union accepted at the configured eXact endpoint. */
export type ExactProtocolRequest = ExactInvocationRequest | ExactBatchRequest | ExactDebugRequest;

/** Selects the manifest and handlers for one execution root in a retained build. */
export type ExactRemoteRootDispatch = {
	contract: ExactExecutorContract;
	invocations?: ExactServerContext['invocations'];
	refreshBoundaries?: ExactServerContext['refreshBoundaries'];
};

/** Registers the executor artifacts retained for one immutable client build. */
export type ExactRemoteBuildRegistration = {
	buildKey: string;
	componentAuthorization?: ExactComponentAuthorizationIdentity;
	roots: Readonly<Record<string, ExactRemoteRootDispatch>>;
};

/** Reports a bounded page-gateway rejection without request credentials or payloads. */
export type ExactGatewayRejectEvent = {
	reason:
		| 'invalid_binding'
		| 'unknown_binding'
		| 'invalid_build'
		| 'transform_failed'
		| 'upstream_unavailable'
		| 'upstream_invalid_response';
	binding?: string;
};

/** Rewrites one validated page request into the request sent to its component host. */
export type TransformForwardedExactRequest = (
	request: ExactRequestLike,
	target: { binding: string; buildKey: string; endpoint: string },
	context: ExactServerContext
) => ExactRequestLike | Promise<ExactRequestLike>;

/** Configures binding lookup and forwarding at the page's ordinary eXact endpoint. */
export type ExactBindingGatewayOptions = {
	bindings: Readonly<
		Record<
			string,
			{
				endpoint: string;
				/** Exact retained builds and roots eligible for federated inspection. */
				debugBuilds?: Readonly<Record<string, readonly string[]>>;
			}
		>
	>;
	fetch?: typeof fetch;
	transformForwardedRequest?: TransformForwardedExactRequest;
	maxBindingLength?: number;
	onReject?: (event: ExactGatewayRejectEvent) => void;
};

/** Forwards already parsed and security-checked binding-routed requests. */
export type ExactBindingGateway = {
	forward(
		request: ExactRequestLike,
		input: ExactProtocolRequest,
		context: ExactServerContext
	): Promise<ExactResponseLike>;
	/** Closes every remote child debug session owned by one page session. */
	closeDebugSession?(sessionId: string, context: ExactServerContext): Promise<void>;
};

/** Defines the exact batch request type contract. */
export type ExactBatchRequest = {
	type: 'batch';
	version?: 1;
	operations: ExactInvocationRequest[];
};

/** Describes the result produced by exact invocation. */
export type ExactInvocationResult = {
	patches?: ExactPatch[];
	state?: unknown;
	/** Ordered fine-grained Map and Set changes produced by a generated continuation. */
	mutations?: ExactCollectionMutation[];
	/** Compiler-approved component-context projections returned to the owning client instance. */
	contexts?: Record<string, unknown>;
	/** Serializable return value of an explicitly invoked distributed task. */
	value?: unknown;
	html?: string;
};

/** Defines the exact operation success type contract. */
export type ExactOperationSuccess = {
	ok: true;
	type: ExactInvocationKind;
	id: string;
	opId?: string;
} & ExactInvocationResult;

/** Represents a failure raised by exact operation. */
export type ExactOperationError = {
	ok: false;
	type: ExactInvocationKind;
	id: string;
	opId?: string;
	status: number;
	error: 'bad_request' | 'not_found' | 'forbidden' | 'internal_error' | 'dependency_failed';
};

/** Describes the result produced by exact operation. */
export type ExactOperationResult = ExactOperationSuccess | ExactOperationError;

/** Describes the result produced by exact batch. */
export type ExactBatchResult = {
	ok: true;
	version: 1;
	results: ExactOperationResult[];
};

/** Reports an observable exact stream event. */
export type ExactStreamEvent =
	| { event: 'start'; version: 1; operations: number }
	| {
			event: 'patch';
			version: 1;
			index: number;
			type: ExactInvocationKind;
			id: string;
			opId?: string;
			patch: ExactPatch;
	  }
	| {
			event: 'state';
			version: 1;
			index: number;
			type: ExactInvocationKind;
			id: string;
			opId?: string;
			value: unknown;
	  }
	| {
			event: 'mutations';
			version: 1;
			index: number;
			type: ExactInvocationKind;
			id: string;
			opId?: string;
			mutations: ExactCollectionMutation[];
	  }
	| {
			event: 'html';
			version: 1;
			index: number;
			type: ExactInvocationKind;
			id: string;
			opId?: string;
			html: string;
	  }
	| { event: 'result'; version: 1; index: number; result: ExactOperationResult }
	| { event: 'complete'; version: 1 };

/** Defines the exact patch type contract. */
export type ExactPatch =
	| { type: 'text'; id: string; value: string }
	| { type: 'prop'; id: string; name: string; value: unknown }
	| { type: 'style'; id: string; name: string; value: string | null }
	| {
			type: 'list';
			id: string;
			op: 'insert' | 'move' | 'remove';
			key: string;
			before?: string;
			html?: string;
	  }
	| { type: 'state'; id: string; value: unknown }
	| { type: 'replace'; id: string; html: string };

/** Carries the context required by exact server. */
export type ExactServerContext = ExactServerContextConfiguration & {
	contract: ExactExecutorContract;
	invocations?: Record<
		string,
		(
			input: ExactInvocationRequest,
			context: ExactServerContext
		) => Promise<ExactInvocationResult> | ExactInvocationResult
	>;
	refreshBoundaries?: Record<
		string,
		(
			input: ExactInvocationRequest,
			context: ExactServerContext
		) => Promise<ExactInvocationResult> | ExactInvocationResult
	>;
	/**
	 * Resolves the currently mounted authority for dynamic branch/keyed ranges.
	 * Returning no instance rejects the refresh before handler lookup.
	 */
	resolvePartitionAuthority?(
		input: ExactInvocationRequest,
		context: ExactServerContext
	): Promise<ExactPartitionAuthority | undefined> | ExactPartitionAuthority | undefined;
	/** Build-keyed remote executor registrations installed by the application. */
	remoteBuilds?: Readonly<Record<string, ExactRemoteBuildRegistration>>;
	/** Advisory retained build advertised for a future client root replacement. */
	preferredBuildKey?: string;
	/** Optional page-host alternate dispatch configured for trusted remote bindings. */
	gateway?: ExactBindingGateway;
	authorize?(
		request: ExactRequestLike,
		input: ExactProtocolRequest,
		context: ExactServerContext
	): Promise<boolean> | boolean;
	validateCsrf?(
		request: ExactRequestLike,
		input: ExactProtocolRequest,
		context: ExactServerContext
	): Promise<boolean> | boolean;
	logger?: Logger;
	outputExtensions?: readonly ExactOutputExtension[];
	/** Resource ceilings applied before and during batch dispatch. */
	limits?: {
		/** Maximum operations accepted in one batch. Defaults to 100. */
		maxBatchOperations?: number;
		/** Maximum operations dispatched concurrently. Defaults to 8. */
		maxBatchConcurrency?: number;
		/** Maximum JSON graph depth accepted or emitted. Defaults to 100. */
		maxJsonDepth?: number;
		/** Maximum values and object properties traversed per JSON graph. Defaults to 100,000. */
		maxJsonNodes?: number;
		/** Maximum approximate UTF-8 bytes in one request envelope. Defaults to 4 MiB. */
		maxRequestBytes?: number;
		/** Maximum UTF-8 bytes in one non-stream response. Defaults to 16 MiB. */
		maxResponseBytes?: number;
		/** Maximum patches returned by one operation. Defaults to 10,000. */
		maxPatches?: number;
		/** Maximum events emitted by one stream. Defaults to 100,000. */
		maxStreamEvents?: number;
		/** Maximum encoded bytes emitted by one stream. Defaults to 16 MiB. */
		maxStreamBytes?: number;
	};
	/** Aborts when the current request or response stream is cancelled. */
	signal?: AbortSignal;
	/** Shared application/request context runtime. */
	contextRuntime?: ExactContextRuntime;
	/** Present only while trusted request-scoped work is executing. */
	contexts?: ExactContextScope;
	/** Portable request data for the active trusted scope. */
	requestContext?: RequestContextValue;
	/** Adapter-owned original request, never client-provided invocation context. */
	platformRequest?: unknown;
	/** Request-owned response mutations recorded before response commit. */
	responseState?: RequestResponseState;
	/** Receives request protocol profiling observations. */
	onProfile?: ExactProfileSink;
	/** Internal stable owner reused by request-scoped context clones. */
	debugRuntime?: ExactServerDebugRuntime;
	/** Internal immutable build selection used only for observation correlation. */
	debugBuildKey?: string;
	/** Disposes application-scoped resources owned by this server runtime. */
	dispose?(): Promise<void>;
};

/** Reports an observable server profile event. */
export type ServerProfileEvent = ExactProfileEvent<'server', 'request'>;

/** Browser-visible configuration derived from an executor contract and SSR state. */
export type ExactHydrationConfig = {
	endpoint?: string;
	endpoints?: ExactEndpointRoutes;
	state?: unknown;
	continuations?: Record<string, ExactComponentContinuationContract>;
	resumptions?: readonly ComponentResumptionActivation[];
	publicContexts?: Record<string, unknown>;
};
