import type {
	AnyComponentFunction,
	ComponentDomain,
	ComponentResumptionActivation,
	ExactRuntimeInspectionOwner,
	ComponentFunction,
	ExactComponentAuthorizationIdentity,
	ErrorReport,
	Logger,
	UnsafeHtmlAuditEvent
} from '@exactjs/core';
import type { ExactComponentContinuationContract } from '@exactjs/core/framework/component-contracts';
import type { ExactProfileEvent, ExactProfileSink } from '@exactjs/instrumentation';
import type {
	ExactInvocationKind,
	ExactInvocationRequest,
	ExactInvocationResult,
	ExactOperationResult,
	ExactPartitionAuthority,
	ExactPartitionDiscriminator,
	ExactPatch
} from '@exactjs/core/framework/operation-protocol';

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
	/** Immutable protocol namespace used by operations issued from this client root. */
	executionRoot?: string;
	/** Page-owned transport binding used to route this client root. */
	binding?: string;
	/** Full Git commit SHA embedded in this client root's generated entry. */
	buildKey?: string;
	/** Compact bundler authorization identity for the paired client artifact. */
	componentAuthorization?: ExactComponentAuthorizationIdentity;
	/** Explicit observation owner; instrumented bootstraps derive one when omitted. */
	inspection?: ExactRuntimeInspectionOwner;
	/** Internal explicit ownership used when mounting islands into this client root. */
	componentDomain?: ComponentDomain;
	transports?: Record<string, ExactEndpointTransport>;
	/** Contracts composed from the imported client component artifacts. */
	continuations?: Record<string, ExactComponentContinuationContract>;
	/** Ordered compiler-selected component activations emitted by SSR. */
	resumptions?: readonly ComponentResumptionActivation[];
	/** Shared context projections available for compiler-selected operations. */
	publicContexts?: Record<string, unknown>;
	/** Internal SSR clock sample used only while adopting the initial view. */
	wallClockSnapshot?: number;
	/** Validated response-local compiler-finite boundary table. */
	hydrationTable?: ExactHydrationTable;
	islands?: ClientIslandRegistry;
	batch?: boolean;
	stream?: boolean;
	streamLimits?: ExactStreamLimits;
	signal?: AbortSignal;
	onDiagnostic?: (diagnostic: HydrationDiagnostic) => void;
	/** Observes framework response compatibility metadata before its body is consumed. */
	onResponse?: (response: ExactResponseMetadata) => void;
	/** Observes the final client-side disposition of an operation and its patches. */
	onOperation?: (observation: ExactClientOperationObservation) => void;
	/** Observes whether a hydration target adopted existing DOM or mounted new DOM. */
	onHydration?: (observation: ExactHydrationObservation) => void;
	/** Receives the live partition-instance tree after an island adopts or mounts. */
	onPartitionInstances?: (instances: readonly ExactPartitionInstance[]) => void;
	/** Controls compiler-approved eager and interaction-triggered client-island activation. */
	hydration?: Readonly<{
		strategy?: 'automatic' | 'eager' | 'interaction';
	}>;
	/** Internal recovery signal emitted only after validating the reserved 410 body. */
	onBuildUnsupported?: () => void;
	/** Internal signal that a structural patch replaced an ancestor of another execution root. */
	onCrossRootReplacement?: () => void;
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
	/** Bundle-local compiler-generated enhancement components used by the hydrated renderer. */
	enhancementCatalog?: ReadonlyMap<string, ComponentFunction<any, Record<string, unknown>>>;
};

/** One concrete acyclic runtime projection of a compiler partition edge. */
export type ExactPartitionInstance = Readonly<{
	executionRoot: string;
	buildKey: string;
	plan: string;
	ownerComponentId: string;
	ownerComponentInstance: string;
	discriminator: ExactPartitionDiscriminator;
	generation: number;
	host: 'client' | 'server';
	children: readonly ExactPartitionInstance[];
}>;

/** Reports total or phase-level timings for one hydration attempt. */
export type HydrateProfileEvent = ExactProfileEvent<
	'hydrate',
	'hydrate' | 'capture-dom' | 'adopt-dom' | 'restore-controls'
>;

/** Reports the structural outcome of one root or client-island hydration attempt. */
export type ExactHydrationObservation = Readonly<{
	kind: 'root' | 'island';
	outcome: 'adopted' | 'mounted' | 'updated';
	component?: string;
	markers: 'document' | 'exact' | 'markerless' | 'none';
}>;

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
	code:
		| 'missing-markers'
		| 'adoption-mismatch'
		| 'invalid-patch'
		| 'invalid-response'
		| 'stale-response';
	message: string;
	patch?: { type: string; id: string };
};

/** Configures exact hydration. */
export type ExactHydrationConfig = {
	pluginRegistryFingerprint?: string;
	endpoint?: string;
	endpoints?: ExactEndpointRoutes;
	state?: unknown;
	continuations?: Record<string, ExactComponentContinuationContract>;
	resumptions?: readonly ComponentResumptionActivation[];
	publicContexts?: Record<string, unknown>;
	wallClockSnapshot?: number;
	hydrationTable?: ExactHydrationTable;
	executionRoot?: string;
	binding?: string;
	buildKey?: string;
	componentAuthorization?: ExactComponentAuthorizationIdentity;
};

/** Internal grouped boundary table. Coordinates are local to its containing root. */
export type ExactHydrationTable = readonly [
	version: 1,
	groups: readonly (
		| readonly [
				componentName: string,
				propNames: readonly string[],
				rows: readonly (readonly [boundaryId: string, ...values: unknown[]] | undefined)[]
		  ]
		| undefined
	)[]
];

/** Compact serialized continuation accepted at the hydration boundary. */
export type ExactSerializedContinuationContract = Omit<
	ExactComponentContinuationContract,
	| 'dependencies'
	| 'stateReads'
	| 'stateWrites'
	| 'publicContexts'
	| 'serverContexts'
	| 'contextWrites'
	| 'serverContextWrites'
	| 'boundaries'
	| 'invocation'
> & {
	dependencies?: ExactComponentContinuationContract['dependencies'];
	stateReads?: ExactComponentContinuationContract['stateReads'];
	stateWrites?: ExactComponentContinuationContract['stateWrites'];
	publicContexts?: ExactComponentContinuationContract['publicContexts'];
	serverContexts?: ExactComponentContinuationContract['serverContexts'];
	contextWrites?: ExactComponentContinuationContract['contextWrites'];
	serverContextWrites?: ExactComponentContinuationContract['serverContextWrites'];
	boundaries?: ExactComponentContinuationContract['boundaries'];
	invocation?: Omit<NonNullable<ExactComponentContinuationContract['invocation']>, 'arguments'> & {
		arguments?: NonNullable<ExactComponentContinuationContract['invocation']>['arguments'];
	};
};

/** Compact serialized component resumption accepted at the hydration boundary. */
export type ExactSerializedComponentResumption = Omit<
	ComponentResumptionActivation,
	'values' | 'contexts' | 'settledContinuations'
> & {
	values?: ComponentResumptionActivation['values'];
	contexts?: ComponentResumptionActivation['contexts'];
	settledContinuations?: ComponentResumptionActivation['settledContinuations'];
};

/** Compiler-generated or document-serialized hydration input before normalization. */
export type ExactHydrationConfigInput = Omit<
	ExactHydrationConfig,
	'continuations' | 'resumptions'
> & {
	continuations?: Record<string, ExactSerializedContinuationContract>;
	resumptions?: readonly ExactSerializedComponentResumption[];
};

/** Defines the exact hydration registration type contract. */
export type ExactHydrationRegistration = ExactHydrationConfig & {
	islands?: ClientIslandRegistry;
	continuations?: Record<string, ExactComponentContinuationContract>;
	resumptions?: readonly ComponentResumptionActivation[];
	publicContexts?: Record<string, unknown>;
	transports?: Record<string, ExactEndpointTransport>;
};

/** Compiler-generated hydration registration before compact defaults are restored. */
export type ExactHydrationRegistrationInput = ExactHydrationConfigInput & {
	islands?: ClientIslandRegistry;
	transports?: Record<string, ExactEndpointTransport>;
};

/** Defines the exact endpoint routes type contract. */
export type ExactEndpointRoutes = {
	invocations?: Record<string, string>;
	boundaries?: Record<string, string>;
};

/** Defers loading one generated client-island implementation until activation. */
export type ClientIslandLoader = Readonly<{
	load(): Promise<AnyComponentFunction>;
	activation?: ExactActivationDecision;
}>;

/** Compiler-proven bounded activation behavior for one lazy island. */
export type ExactActivationDecision = Readonly<{
	mode: 'server-only' | 'eager' | 'interaction' | 'inert';
	reasons: readonly ExactActivationReason[];
	targets: readonly ExactActivationTarget[];
}>;

/** One source-located reason an island cannot remain dormant. */
export type ExactActivationReason = Readonly<{
	code: string;
	start: number;
	length: number;
	detail?: string;
}>;

/** One adopted DOM target and its compiler-authorized event policies. */
export type ExactActivationTarget = Readonly<{
	id: string;
	events: readonly ExactLazyEventPolicy[];
}>;

/** One bounded replay operation retained without a native Event object. */
export type ExactLazyEventPolicy = Readonly<{
	type: 'click' | 'submit' | 'input' | 'change' | 'focus' | 'blur' | 'focusin' | 'focusout';
	replay: 'native-click' | 'request-submit' | 'latest-value' | 'notification';
}>;

/** One eager or compiler-generated lazy client-island implementation. */
export type ClientIslandRegistryEntry = AnyComponentFunction | ClientIslandLoader;

/** Defines the client island registry type contract. */
export type ClientIslandRegistry = Record<string, ClientIslandRegistryEntry>;

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
	headers?: ExactResponseHeaders | Readonly<Record<string, string>>;
	body?: ReadableStream<Uint8Array> | null;
	json(): Promise<unknown>;
	text?(): Promise<string>;
}>;

/** Minimal header surface accepted from native and runtime-neutral fetch implementations. */
export type ExactResponseHeaders = {
	get(name: string): string | null;
};

/** Compatibility metadata exposed by the transport without exposing response bodies. */
export type ExactResponseMetadata = {
	readonly status: number;
	readonly preferredBuildKey?: string;
};

/** Describes how one client operation was handled after its response arrived. */
export type ExactClientOperationObservation = {
	readonly operation: ExactInvocationRequest;
	readonly result: ExactInvocationResult;
	readonly appliedPatches: readonly ExactPatch[];
	readonly patchesApplied: boolean;
	readonly stale: boolean;
};

/** Owns an adopted DOM root without implying optional server-operation or island capabilities. */
export type CoreHydrationRoot = {
	readonly domain: ComponentDomain;
	/** Number of asynchronous operations owned by this root generation. */
	readonly pendingRequests: number;
	/** Prevents new work while allowing already accepted work to settle. */
	retire(): void;
	/** Resolves once all work admitted before retirement has settled. */
	whenSettled(): Promise<void>;
	/** Releases renderer scopes, listeners, component ownership, and root registration. */
	dispose(): void;
};

/** Defines the exact endpoint transport type contract. */
export type ExactEndpointTransport = {
	fetch?: FetchLike;
	headers?: Record<string, string>;
};

/** Defines the exact client type contract. */
export type ExactClient = CoreHydrationRoot & {
	readonly endpoint?: string;
	readonly endpoints?: ExactEndpointRoutes;
	state?: unknown;
	readonly continuations?: Record<string, ExactComponentContinuationContract>;
	applyPatches(patches: readonly ExactPatch[]): boolean;
	invokeTask(id: string, payload?: unknown): Promise<ExactInvocationResult>;
	refreshBoundary(id: string, payload?: unknown): Promise<ExactInvocationResult>;
	refreshIsland(
		id: string,
		registry: ClientIslandRegistry,
		payload?: unknown
	): Promise<ExactInvocationResult>;
	registerComponents(config: ExactHydrationRegistration): void;
};

/** Defines the hydration root type contract. */
export type HydrationRoot = ExactClient;

/** Configures invoke exact. */
export type InvokeExactOptions = {
	endpoint: string;
	type: ExactInvocationKind;
	root?: string;
	id: string;
	partition?: ExactPartitionAuthority;
	payload?: unknown;
	state?: unknown;
	/** Compiler-approved shared context projections required by this operation. */
	publicContext?: Record<string, unknown>;
	boundaryHtml?: string;
	boundaryHtmls?: Record<string, string>;
	fetch?: FetchLike;
	headers?: Record<string, string>;
	logger?: Logger;
	stream?: boolean;
	streamLimits?: ExactStreamLimits;
	signal?: AbortSignal;
	onResponse?: (response: ExactResponseMetadata) => void;
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
	onResponse?: (response: ExactResponseMetadata) => void;
};

/** Defines the pending exact operation type contract. */
export type PendingExactOperation = {
	operation: ExactInvocationRequest;
	signal?: AbortSignal;
	onResponse?: (response: ExactResponseMetadata) => void;
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
	ExactPatch
};
