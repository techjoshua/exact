import type { ExactResponseWithBody } from './response/body.js';
import type {
	AnyContextToken,
	ComponentContextValues,
	ContextToken,
	ExactComponentAuthorizationIdentity,
	Logger
} from '@exactjs/core';
import type {
	ExactComponentBoundaryContract,
	ExactComponentContinuationContract,
	ExactComponentContinuationExecutorContract
} from '@exactjs/core/framework/component-contracts';
import type {
	ExactBatchRequest,
	ExactEndpointRoutes,
	ExactInvocationRequest,
	ExactInvocationResult,
	ExactPartitionAuthority,
	ExactPatch
} from '@exactjs/core/framework/operation-protocol';
import type { ExactProfileEvent, ExactProfileSink } from '@exactjs/instrumentation';
import type {
	ExactBuildInspectionCatalog,
	ExactDebugRequest,
	ExactInspectionQueryService
} from '@exactjs/devtools-protocol';
import type { ExactOutputExtension } from '@exactjs/plugin-api';
import type { RequestContextValue, RequestResponseState } from '@exactjs/request';

export type {
	ExactBatchRequest,
	ExactBatchResult,
	ExactCollectionMutation,
	ExactEndpointRoutes,
	ExactInvocationKind,
	ExactInvocationRequest,
	ExactInvocationResult,
	ExactOperationError,
	ExactOperationResult,
	ExactOperationSuccess,
	ExactPartitionAuthority,
	ExactPartitionDiscriminator,
	ExactPatch,
	ExactStreamEvent
} from '@exactjs/core/framework/operation-protocol';
export type {
	ExactAllowDebug,
	ExactDebugAuditEvent,
	ExactDebugAuthorizationContext,
	ExactDebugLimits,
	ExactDebugSessionIdentity,
	ExactServerDebugRuntime,
	ExactServerRequestDebugRuntime
} from './debug-types.js';
import type { ExactTrustedHtml } from './trusted-html.js';
import type {
	ExactAllowDebug,
	ExactDebugAuditEvent,
	ExactDebugLimits,
	ExactDebugSessionIdentity,
	ExactServerDebugRuntime,
	ExactServerRequestDebugRuntime
} from './debug-types.js';

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
	arrayRoots?: readonly import('@exactjs/core/framework/component-contracts').ExactArrayRootProof[];
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
	/** Incremental request bytes, used by Fetch-compatible adapters to enforce limits before buffering. */
	bodyStream?: ReadableStream<Uint8Array> | null;
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

/** Existential factory retained with its correlated token and owned value in heterogeneous scopes. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Scope storage preserves each factory's value correlation but contains multiple value types.
export type AnyExactContextFactory = ExactContextFactory<any>;

/** Defines the exact context value type contract. */
export type ExactContextValue<T> = {
	value: T;
};

/** Defines the exact context registration type contract. */
export type ExactContextRegistration<T = unknown> = readonly [
	token: ContextToken<T>,
	source: ExactContextValue<T> | ExactContextFactory<T>
];

/** Existential registration retained in heterogeneous context configuration collections. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Each tuple remains internally correlated even though collections contain multiple value types.
export type AnyExactContextRegistration = ExactContextRegistration<any>;

/** Defines the exact request context registration source type contract. */
export type ExactRequestContextRegistrationSource =
	| readonly AnyExactContextRegistration[]
	| ((
			context: ExactContextFactoryContext
	  ) => readonly AnyExactContextRegistration[] | Promise<readonly AnyExactContextRegistration[]>);

/** Defines the exact context overrides type contract. */
export type ExactContextOverrides = {
	/** Trusted application-supplied test values; never populated from request data. */
	application?: readonly (readonly [AnyContextToken, unknown])[];
	/** Trusted application-supplied test values; never populated from request data. */
	request?: readonly (readonly [AnyContextToken, unknown])[];
};

/** Reports a server-owned context token used by one generated continuation, never its value. */
export type ExactServerContextAccessObservation = Readonly<{
	operationId: string;
	componentId: string;
	token: string;
	scope: ContextToken<unknown>['scope'];
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
	applicationContexts?: readonly AnyExactContextRegistration[];
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
	/** Receives metadata-only audit records without state or preview values. Notification failures
	 * are isolated, including returned asynchronous work, which does not delay query publication.
	 */
	onDebugAudit?: (event: ExactDebugAuditEvent) => void;
};

/** Configures only the application and request lifetimes owned by a context runtime. */
export type ExactContextRuntimeConfiguration = Pick<
	ExactServerContextConfiguration,
	'publicOrigin' | 'applicationContexts' | 'requestContexts' | 'contextOverrides'
>;

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

/** Shared response metadata, independent of its single body representation. */
export type ExactResponseMetadata = {
	status: number;
	headers: Record<string, string>;
	/** Separate Set-Cookie fields cannot be combined into one comma-delimited header. */
	setCookies?: readonly string[];
};

/** A complete text response with no competing stream representation. */
export type ExactTextResponse = ExactResponseMetadata & { body: string; stream?: never };

/** An already-created byte stream, owned by the receiving adapter. */
export type ExactStreamResponse = ExactResponseMetadata & {
	stream: ReadableStream<Uint8Array>;
	body?: never;
};

/** A response has exactly one text, stream, or explicit produced/buffered body representation. */
export type ExactResponseLike = ExactTextResponse | ExactStreamResponse | ExactResponseWithBody;

/** Full top-level protocol union accepted at the configured eXact endpoint. */
export type ExactProtocolRequest = ExactInvocationRequest | ExactBatchRequest | ExactDebugRequest;

/** Reports a bounded page-gateway rejection without request credentials or payloads. */
export type ExactGatewayRejectEvent = {
	reason: 'invalid_binding' | 'unknown_binding' | 'transform_failed' | 'upstream_unavailable';
	binding?: string;
};

/** Enriches forwarded headers. Method, URL, body, and cancellation ownership must remain unchanged. */
export type TransformForwardedExactRequest = (
	request: ExactRequestLike,
	target: { binding: string; buildKey?: string; endpoint: string },
	context: ExactServerContext
) => ExactRequestLike | Promise<ExactRequestLike>;

/** Configures binding lookup and forwarding at the page's ordinary eXact endpoint. */
export type ExactBindingGatewayOptions = {
	bindings: Readonly<
		Record<
			string,
			{
				endpoint: string;
			}
		>
	>;
	fetch?: typeof fetch;
	transformForwardedRequest?: TransformForwardedExactRequest;
	maxBindingLength?: number;
	onReject?: (event: ExactGatewayRejectEvent) => void;
};

/** Forwards raw binding-routed requests after the host has authenticated their request metadata. */
export type ExactBindingGateway = {
	forward(
		request: ExactRequestLike,
		body: string | Uint8Array,
		context: ExactServerContext
	): Promise<ExactResponseLike>;
};

/** Patch authored by an application handler; structural HTML requires explicit trust. */
export type ExactManualPatch =
	| Exclude<ExactPatch, { type: 'replace' } | { type: 'list' }>
	| { type: 'replace'; id: string; html: ExactTrustedHtml }
	| {
			type: 'list';
			id: string;
			op: 'insert' | 'move' | 'remove';
			key: string;
			before?: string;
			html?: ExactTrustedHtml;
	  };

/** Application-owned operation result before trusted HTML is unwrapped for transport. */
export type ExactManualInvocationResult = Omit<ExactInvocationResult, 'html' | 'patches'> & {
	html?: ExactTrustedHtml;
	patches?: ExactManualPatch[];
};

/** Application-owned operation implementation. */
export type ExactManualInvocationHandler = (
	input: ExactInvocationRequest,
	context: ExactServerContext
) => Promise<ExactManualInvocationResult> | ExactManualInvocationResult;

/** Common runtime handler shape spanning authored and framework-owned provenance. */
export type ExactInvocationHandler = (
	input: ExactInvocationRequest,
	context: ExactServerContext
) =>
	| ExactInvocationResult
	| ExactManualInvocationResult
	| Promise<ExactInvocationResult | ExactManualInvocationResult>;

/** Carries the context required by exact server. */
export type ExactServerContext = ExactServerContextConfiguration & {
	/** Deployment opt-out when intermediary or host buffering prevents live progress. */
	progress?: { readonly supported: boolean; readonly reason?: string };
	/** Trusted request-local progress sink installed by the streaming response owner. */
	reportTaskProgress?: (receiver: string, snapshot: unknown) => void;
	contract: ExactExecutorContract;
	invocations?: Record<string, ExactInvocationHandler>;
	refreshBoundaries?: Record<string, ExactInvocationHandler>;
	/** Required business validation for manual operations that accept a payload. */
	payloadDecoders?: import('./payload-decoding.js').ExactPayloadDecoders;
	/**
	 * Resolves the currently mounted authority for dynamic branch/keyed ranges.
	 * Returning no instance rejects the refresh before handler lookup.
	 */
	resolvePartitionAuthority?(
		input: ExactInvocationRequest,
		context: ExactServerContext
	): Promise<ExactPartitionAuthority | undefined> | ExactPartitionAuthority | undefined;
	/** Build-keyed remote executor registrations installed by the application. */
	remoteBuilds?: Readonly<
		Record<string, import('./remote-build-contracts.js').ExactRemoteBuildRegistration>
	>;
	/** Advisory retained build advertised for a future client root replacement. */
	preferredBuildKey?: string;
	/** Optional page-host alternate dispatch configured for trusted remote bindings. */
	gateway?: ExactBindingGateway;
	/** Authenticates before body access, including forwarded requests. Only true approves. Omission skips this check. */
	authorize?(request: ExactRequestLike, context: ExactServerContext): Promise<boolean> | boolean;
	/** Validates credentials or headers before body parsing. Only true approves. Omission skips this check. */
	validateCsrf?(request: ExactRequestLike, context: ExactServerContext): Promise<boolean> | boolean;
	/** Authorizes a decoded local operation at its executing service. Only true approves. Omission skips this check. */
	authorizeOperation?(
		request: ExactRequestLike,
		input: ExactInvocationRequest,
		context: ExactServerContext
	): Promise<boolean> | boolean;
	logger?: Logger;
	outputExtensions?: readonly ExactOutputExtension[];
	/** Incoming limits and configurable response caps. Positive safe integers enforce caps. Omitted response settings warn once per owner at their documented thresholds. */
	limits?: {
		/** Maximum operations accepted in one batch. Defaults to 100. */
		maxBatchOperations?: number;
		/** Maximum operations dispatched concurrently. Defaults to 8. */
		maxBatchConcurrency?: number;
		/** Incoming graph depth cap, default 100. Responses warn above 100 when omitted, or fail above an explicit cap. Progress snapshots warn above 32. */
		maxJsonDepth?: number;
		/** Incoming node cap, default 100,000. Responses warn above 100,000 when omitted, or fail above an explicit cap. Progress snapshots warn above 10,000. */
		maxJsonNodes?: number;
		/** Hard UTF-8 byte cap for one request envelope. When omitted, bodies over 4 MiB warn without rejection. */
		maxRequestBytes?: number;
		/** UTF-8 graph-content cap per result/snapshot and exact encoded-byte cap for buffered responses and non-NDJSON relays. Omission warns above 16 MiB, or 64 KiB for snapshots. Logs identify units and stage. */
		maxResponseBytes?: number;
		/** Patches per operation. Omission warns above 10,000. An explicit positive cap rejects. */
		maxPatches?: number;
		/** Events per stream. Omission warns above 100,000. An explicit positive cap stops production. */
		maxStreamEvents?: number;
		/** Cumulative encoded UTF-8 bytes per stream or NDJSON relay. Omission warns above 16 MiB. An explicit positive cap stops production. */
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
	/** Present only for a request authorized to return bounded server observations. */
	requestDebugRuntime?: ExactServerRequestDebugRuntime;
	/** Internal immutable build selection used only for observation correlation. */
	debugBuildKey?: string;
	/** Disposes application-scoped resources owned by this server runtime. */
	dispose?(): Promise<void>;
};

/** Reports an observable server profile event. */
export type ServerProfileEvent = ExactProfileEvent<'server', 'request'>;
