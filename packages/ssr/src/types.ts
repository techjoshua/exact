import type {
	AnyComponentInstance,
	AnyEnhancementComponentFunction,
	Child,
	ComponentDomain,
	DynamicComponentArtifact,
	ComponentContextValues,
	EnhancementEntry,
	ComponentFunction,
	ComponentInstance,
	ComponentResumptionActivation,
	ExactRuntimeInspectionOwner,
	ExactComponentAuthorizationIdentity,
	Logger,
	TaskObserver,
	UnsafeHtmlAuditEvent,
	VNode
} from '@exactjs/core';
export type { AnyComponentInstance };
import type {
	ExactCompiledComponentContract,
	ExactComponentContinuationContract
} from '@exactjs/core/framework/component-contracts';
import type { ExactProfileEvent, ExactProfileSink } from '@exactjs/instrumentation';
import type { ExactOutputExtension } from '@exactjs/plugin-api';
import type {
	ExactEndpointRoutes,
	ExactInvocationRequest,
	ExactInvocationResult,
	ExactRequestLike,
	ExactResponseLike,
	ExactServerContext,
	ExactServerContextConfiguration
} from '@exactjs/server';

/** Configures render to string. */
export type RenderToStringOptions = {
	/** Immutable runtime namespace used by partition markers. */
	executionRoot?: string;
	/** Immutable deployment namespace used by partition markers. */
	buildKey?: string;
	markers?: boolean;
	/** Inserts React-compatible separators between adjacent primitive text children. */
	textSeparators?: boolean;
	/** Uses React-compatible DOM attribute and style serialization. */
	reactMarkup?: boolean | 18 | 19;
	logger?: Logger;
	state?: unknown;
	maxTaskPasses?: number;
	/** Total wall-clock budget for all async component tasks in one render. Defaults to 30 seconds. */
	maxTaskDurationMs?: number;
	/** Request-wide limit for compiler-proven independent async SSR siblings. Defaults to 4. */
	maxAsyncSsrConcurrency?: number;
	/** Maximum nested vnode depth. Defaults to 512 and is capped at 1,024. */
	maxTreeDepth?: number;
	/** Maximum vnode and primitive child values visited by one render. Defaults to 100,000. */
	maxTreeNodes?: number;
	/** Maximum UTF-8 bytes in a checked string render. Defaults to 16 MiB. */
	maxOutputBytes?: number;
	/** Maximum bytes emitted by a plain HTML stream. Defaults to 16 MiB. */
	maxStreamBytes?: number;
	/** Maximum chunks emitted by a plain HTML stream. Defaults to 100,000. */
	maxStreamChunks?: number;
	signal?: AbortSignal;
	/** Prepared render output policies. Transformations run before all final validators. */
	outputExtensions?: readonly ExactOutputExtension[];
	/** Bundle-local compiler-generated enhancement components available to this server artifact. */
	enhancementCatalog?: ReadonlyMap<string, AnyEnhancementComponentFunction>;
	/** Allows unsafeHtml() ranges. The application accepts responsibility for their contents. */
	allowUnsafeHtml?: boolean;
	/** Receives an audit notification whenever an unsafe HTML range is rendered. */
	onUnsafeHtml?: (event: UnsafeHtmlAuditEvent) => void;
	/** Trusted application/request values inherited by the component root. */
	contexts?: ComponentContextValues;
	/**
	 * Observes a component after its SSR output has stabilized and before the
	 * renderer disposes it. Intended for diagnostics and test tooling.
	 */
	onComponentRendered?: (instance: AnyComponentInstance) => void;
	/** Observes deterministic component construction order before descendants render. */
	onComponentCreated?: (instance: AnyComponentInstance) => void;
	/** @internal Checkpoints speculative descendant observations during sync stabilization. */
	onComponentAttemptCheckpoint?: () => unknown;
	/** @internal Discards observations produced by an invalidated sync render attempt. */
	onComponentAttemptRollback?: (checkpoint: unknown) => void;
	/** @internal Reserves construction order for a compiler-closed request-local frame. */
	onDirectComponentCreated?: (snapshot: DirectSsrComponentSnapshot) => void;
	/** @internal Publishes a compiler-closed component without manufacturing a durable instance. */
	onDirectComponentRendered?: (snapshot: DirectSsrComponentSnapshot) => void;
	/** @internal Allows framework-owned observers to be replayed after independent sibling work. */
	allowIndependentComponentObservation?: boolean;
	/** Receives SSR rendering profiling observations. */
	onProfile?: ExactProfileSink;
	/** Internal request-owned observation boundary; omitted in hardened server output. */
	inspection?: ExactRuntimeInspectionOwner;
	/** Build-authorized immutable artifacts keyed by compiler dynamic-boundary identity. */
	dynamicComponentArtifacts?:
		| ReadonlyMap<string, DynamicComponentArtifact>
		| Readonly<Record<string, DynamicComponentArtifact>>;
	/** Maximum selected dynamic artifacts hinted by one request. Defaults to 16. */
	maxDynamicComponentPreloads?: number;
	/** Receives validated Link values early enough for a capable adapter to emit HTTP 103. */
	onEarlyHints?: (links: readonly string[]) => void;
};

/** Reports an observable ssr profile event. */
export type SsrProfileEvent = ExactProfileEvent<'ssr', 'render-to-string' | 'create-stream'>;

/** Describes the result produced by render to string. */
export type RenderToStringResult = {
	html: string;
	state?: unknown;
	/** Internal request-owned clock sample transferred to hydrating framework domains. */
	wallClockSnapshot?: number;
	resumptions?: readonly ComponentResumptionActivation[];
	/** Internal response-local table consumed by hydratable entry points. */
	hydrationTable?: import('./render/hydration-table.js').ExactHydrationTable;
	/** Deduplicated final-header Link values discovered while rendering. */
	preloadLinks?: readonly string[];
};

/** Configures hydration script. */
export type HydrationScriptOptions = {
	pluginRegistryFingerprint?: string;
	endpoint?: string;
	endpoints?: ExactEndpointRoutes;
	state?: unknown;
	continuations?: Record<string, ExactComponentContinuationContract>;
	resumptions?: readonly ComponentResumptionActivation[];
	publicContexts?: Record<string, unknown>;
	/** Internal request-owned clock sample emitted by a paired SSR render. */
	wallClockSnapshot?: number;
	/** Compiler-finite client boundary rows grouped by component prop schema. */
	hydrationTable?: import('./render/hydration-table.js').ExactHydrationTable;
	executionRoot?: string;
	binding?: string;
	buildKey?: string;
	/** Compact server-build component authorization identity checked by hydration. */
	componentAuthorization?: ExactComponentAuthorizationIdentity;
	scriptId?: string;
	nonce?: string;
	/** Maximum hydration JSON graph depth. Defaults to 100. */
	maxHydrationDepth?: number;
	/** Maximum hydration JSON values/properties. Defaults to 100,000. */
	maxHydrationNodes?: number;
	/** Maximum encoded hydration JSON bytes. Defaults to 16 MiB. */
	maxHydrationBytes?: number;
	outputExtensions?: readonly ExactOutputExtension[];
};

/** Describes the result produced by hydratable string. */
export type HydratableStringResult = RenderToStringResult & {
	hydrationScript: string;
	htmlWithHydration: string;
};

/** Configures render to document stream. */
export type RenderToDocumentStreamOptions = RenderToStringOptions &
	HydrationScriptOptions & {
		rootId?: string;
		hydration?: boolean;
		maxStreamEvents?: number;
	};

/** Configures render to progressive html stream. */
export type RenderToProgressiveHtmlStreamOptions = RenderToDocumentStreamOptions & {
	rootId?: string;
	/**
	 * `inline` emits executable replacement scripts (optionally nonce-bearing).
	 * `inert` emits escaped template payloads for an approved external runtime.
	 */
	progressiveMode?: 'inline' | 'inert';
};

/** Configures render to progressive html response. */
export type RenderToProgressiveHtmlResponseOptions = RenderToProgressiveHtmlStreamOptions & {
	status?: number;
	headers?: Record<string, string>;
	contentType?: string;
};

/** Defines the exact request render function type contract. */
export type ExactRequestRenderFunction = (context: ExactServerContext) => VNode | Promise<VNode>;

/** Configures render exact request to html response. */
export type RenderExactRequestToHtmlResponseOptions = RenderToStringOptions &
	HydrationScriptOptions & {
		hydration?: boolean;
		status?: number;
		headers?: Record<string, string>;
		contentType?: string;
	};

/** Reports an observable exact document stream event. */
export type ExactDocumentStreamEvent =
	| { event: 'start'; version: 1 }
	| { event: 'shell'; version: 1; html: string }
	| { event: 'replace'; version: 1; id: string; html: string }
	| { event: 'hydration'; version: 1; html: string }
	| { event: 'complete'; version: 1 }
	| { event: 'error'; version: 1; message: string };

/** Defines the boundary render function type contract. */
export type BoundaryRenderFunction = (
	input: ExactInvocationRequest,
	context: ExactServerContext
) => VNode | Promise<VNode>;

/** Configures boundary refresh. */
export type BoundaryRefreshOptions = RenderToStringOptions & {
	boundaryId: string;
	patchStrategy?: 'replace' | 'text' | 'element';
	previousHtml?(
		input: ExactInvocationRequest,
		context: ExactServerContext
	): string | Promise<string | undefined> | undefined;
};

/** Configures an invocation refresh boundary. */
export type InvocationRefreshBoundaryOptions = BoundaryRefreshOptions & {
	render: BoundaryRenderFunction;
};

/** Configures an invocation refresh. */
export type InvocationRefreshOptions = {
	invoke: NonNullable<ExactServerContext['invocations']>[string];
	boundaries: readonly InvocationRefreshBoundaryOptions[];
};

/** Defines the exact boundary renderer type contract. */
export type ExactBoundaryRenderer =
	| BoundaryRenderFunction
	| (Partial<BoundaryRefreshOptions> & { render: BoundaryRenderFunction });

/** Configures exact server handler registry. */
export type ExactServerHandlerRegistryOptions = RenderToStringOptions & {
	contract: ExactServerContext['contract'];
	invocations?: ExactServerContext['invocations'];
	boundaries?: Record<string, ExactBoundaryRenderer>;
	patchStrategy?: BoundaryRefreshOptions['patchStrategy'];
};

/** Defines the exact server handler registry type contract. */
export type ExactServerHandlerRegistry = {
	invocations: NonNullable<ExactServerContext['invocations']>;
	refreshBoundaries: NonNullable<ExactServerContext['refreshBoundaries']>;
};

/** Configures exact server runtime. */
export type ExactServerRuntimeOptions = ExactServerHandlerRegistryOptions &
	ExactServerContextConfiguration & {
		authorize?: ExactServerContext['authorize'];
		validateCsrf?: ExactServerContext['validateCsrf'];
		payloadDecoders?: ExactServerContext['payloadDecoders'];
		resolvePartitionAuthority?: ExactServerContext['resolvePartitionAuthority'];
		remoteBuilds?: ExactServerContext['remoteBuilds'];
		preferredBuildKey?: ExactServerContext['preferredBuildKey'];
		gateway?: ExactServerContext['gateway'];
		limits?: ExactServerContext['limits'];
	};

/** Defines the keyed list snapshot item type contract. */
export type KeyedListSnapshotItem = {
	key: string;
	html: string;
};

/** Defines the keyed list snapshot type contract. */
export type KeyedListSnapshot = {
	listId: string;
	html: string;
	innerHtml: string;
	items: KeyedListSnapshotItem[];
};

/** Configures keyed list snapshot. */
export type KeyedListSnapshotOptions<T> = RenderToStringOptions & {
	listId: string;
	items: Iterable<T>;
	key(item: T): string;
	render(item: T): VNode;
};

/** Configures keyed list snapshot parse. */
export type KeyedListSnapshotParseOptions = {
	/** Maximum encoded snapshot bytes. Defaults to 16 MiB. */
	maxBytes?: number;
	/** Maximum top-level keyed items. Defaults to 100,000. */
	maxItems?: number;
	/** Maximum exact markers inspected. Defaults to 200,000. */
	maxMarkers?: number;
};

/** Configures keyed list refresh. */
export type KeyedListRefreshOptions<T> = RenderToStringOptions & {
	listId: string;
	key(item: T): string;
	render(item: T): VNode;
	items(
		input: ExactInvocationRequest,
		context: ExactServerContext
	): Iterable<T> | Promise<Iterable<T>>;
	previousItems?(
		input: ExactInvocationRequest,
		context: ExactServerContext
	):
		| readonly KeyedListSnapshotItem[]
		| Promise<readonly KeyedListSnapshotItem[] | undefined>
		| undefined;
};

/** Carries the context required by ssr. */
export type SsrContext = {
	executionRoot: string;
	buildKey?: string;
	markers: boolean;
	textSeparators: boolean;
	reactMarkup: boolean | 18 | 19;
	nextId: number;
	logger?: Logger;
	maxTreeDepth: number;
	traversalDepth: number;
	maxTreeNodes: number;
	traversedNodes: number;
	maxOutputBytes: number;
	reactResourceHints: string[];
	reactResourceKeys: Set<string>;
	dynamicComponentArtifacts?: RenderToStringOptions['dynamicComponentArtifacts'];
	maxDynamicComponentPreloads: number;
	dynamicComponentPreloads: number;
	resourceLinkHeaders: string[];
	onEarlyHints?: RenderToStringOptions['onEarlyHints'];
	selectValue?: unknown;
	allowUnsafeHtml: boolean;
	onUnsafeHtml?: (event: UnsafeHtmlAuditEvent) => void;
	/** True until the first root host/text output determines document mode. */
	documentProbe: boolean;
	documentRootSeen: boolean;
	documentHeadSeen: boolean;
	documentBodySeen: boolean;
	hostStack: string[];
	enhancementCatalog?: ReadonlyMap<string, AnyEnhancementComponentFunction>;
	unavailableEnhancements: Set<string>;
	/** Generated ordinary component vnodes whose internal SSR boundary is not authored hydration data. */
	enhancementVNodes: WeakSet<VNode>;
	/** Authored boundaries whose logical subtree has an SSR enhancement route plan. */
	plannedEnhancementBoundaries: WeakSet<VNode>;
	/** `_target` boundaries whose logical children have been prepared once. */
	plannedTargetBoundaries: WeakSet<VNode>;
	/** `_target` boundaries whose owned layer has been applied to the active target. */
	appliedTargetBoundaries: WeakSet<VNode>;
	/** Effective layered props contributed to resolved semantic intrinsic targets. */
	targetContributions: WeakMap<VNode, Record<string, unknown>>;
	/** Resolved intrinsic targets and their merged enhancement declarations. */
	enhancementTargets: WeakMap<VNode, readonly EnhancementEntry[]>;
	/** Component work materialized once while resolving a logical enhancement target. */
	preparedEnhancementComponents: WeakMap<
		VNode,
		{
			readonly instance?: AnyComponentInstance;
			readonly props: Record<string, unknown>;
			readonly children: readonly Child[];
			readonly failed: boolean;
		}
	>;
	/** Dynamic/list children materialized while resolving an enhancement target. */
	preparedEnhancementChildren: WeakMap<VNode, readonly Child[]>;
	/** Suspense candidate selected while resolving an enhancement route. */
	preparedEnhancementSuspense: WeakMap<
		VNode,
		{
			readonly children: readonly Child[];
			readonly parent?: AnyComponentInstance;
			readonly status: 'content' | 'fallback';
			dispose(): void;
		}
	>;
	/** Request-local scheduled frames started from compiler-proven child reachability. */
	preparedDirectScheduledComponents: WeakMap<
		VNode,
		import('./render/direct-component.js').PreparedDirectScheduledSsrComponent
	>;
	componentContexts?: ComponentContextValues;
	componentDomain?: ComponentDomain;
	/** Immutable wall-clock sample shared by the request render. */
	wallClockSnapshot: number;
	onComponentCreated?: (instance: AnyComponentInstance) => void;
	onComponentRendered?: (instance: AnyComponentInstance) => void;
	onComponentAttemptCheckpoint?: () => unknown;
	onComponentAttemptRollback?: (checkpoint: unknown) => void;
	onDirectComponentCreated?: (snapshot: DirectSsrComponentSnapshot) => void;
	onDirectComponentRendered?: (snapshot: DirectSsrComponentSnapshot) => void;
	/** Request-local scheduler shared by every eligible sibling group. */
	asyncScheduler: import('./render/async-scheduler.js').AsyncSsrScheduler;
	/** Child frames remain serial so nested groups cannot multiply permits or deadlock. */
	asyncFrame: boolean;
	/** Response-local compiler-finite boundary table. */
	hydrationTable: import('./render/hydration-table.js').SsrHydrationTable;
	/** Reusable immutable plan cache selected by the rendered root component. */
	rootExecutionBlueprint?: import('./render/root-execution-cache.js').SsrRootExecutionBlueprint;
};

/** Request-local state published by a compiler-closed synchronous server component. */
export type DirectSsrComponentSnapshot = Readonly<{
	componentId: string;
	contract: ExactCompiledComponentContract;
	state: Record<string, unknown>;
}>;

export type {
	Child,
	ComponentFunction,
	ComponentInstance,
	ExactInvocationRequest,
	ExactInvocationResult,
	ExactRequestLike,
	ExactResponseLike,
	ExactServerContext,
	Logger,
	TaskObserver,
	VNode
};
