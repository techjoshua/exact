import type {
	Child,
	ComponentContextValues,
	ComponentFunction,
	ComponentInstance,
	Logger,
	TaskObserver,
	UnsafeHtmlAuditEvent,
	VNode
} from '@exact/core';
import type {
	ExactEndpointRoutes,
	ExactInvocationRequest,
	ExactInvocationResult,
	ExactRequestLike,
	ExactResponseLike,
	ExactServerContext,
	ExactServerContextConfiguration,
	ExactServerManifest,
	ExactStateContract
} from '@exact/server';
import type { ExactOutputExtension } from '@exact/plugin-api';
import type { ExactProfileEvent, ExactProfileSink } from '@exact/instrumentation';

export type RenderToStringOptions = {
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
	/** Allows unsafeHtml() ranges. The application accepts responsibility for their contents. */
	allowUnsafeHtml?: boolean;
	/** Receives an audit notification whenever an unsafe HTML range is rendered. */
	onUnsafeHtml?: (event: UnsafeHtmlAuditEvent) => void;
	/** Trusted application/request values inherited by the component root. */
	contexts?: ComponentContextValues;
	/** Receives SSR rendering profiling observations. */
	onProfile?: ExactProfileSink;
};

export type SsrProfileEvent = ExactProfileEvent<'ssr', 'render-to-string' | 'create-stream'>;

export type RenderToStringResult = {
	html: string;
	state?: unknown;
};

export type HydrationScriptOptions = {
	pluginRegistryFingerprint?: string;
	endpoint?: string;
	endpoints?: ExactEndpointRoutes;
	state?: unknown;
	stateContracts?: Record<string, ExactStateContract>;
	actionBoundaries?: Record<string, readonly string[]>;
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

export type HydratableStringResult = RenderToStringResult & {
	hydrationScript: string;
	htmlWithHydration: string;
};

export type RenderToDocumentStreamOptions = RenderToStringOptions &
	HydrationScriptOptions & {
		rootId?: string;
		hydration?: boolean;
		maxStreamEvents?: number;
	};

export type RenderToProgressiveHtmlStreamOptions = RenderToDocumentStreamOptions & {
	rootId?: string;
	/**
	 * `inline` emits executable replacement scripts (optionally nonce-bearing).
	 * `inert` emits escaped template payloads for an approved external runtime.
	 */
	progressiveMode?: 'inline' | 'inert';
};

export type RenderToProgressiveHtmlResponseOptions = RenderToProgressiveHtmlStreamOptions & {
	status?: number;
	headers?: Record<string, string>;
	contentType?: string;
};

export type ExactRequestRenderFunction = (context: ExactServerContext) => VNode | Promise<VNode>;

export type RenderExactRequestToHtmlResponseOptions = RenderToStringOptions &
	HydrationScriptOptions & {
		hydration?: boolean;
		status?: number;
		headers?: Record<string, string>;
		contentType?: string;
	};

export type ExactDocumentStreamEvent =
	| { event: 'start'; version: 1 }
	| { event: 'shell'; version: 1; html: string }
	| { event: 'replace'; version: 1; id: string; html: string }
	| { event: 'hydration'; version: 1; html: string }
	| { event: 'complete'; version: 1 }
	| { event: 'error'; version: 1; message: string };

export type BoundaryRenderFunction = (
	input: ExactInvocationRequest,
	context: ExactServerContext
) => VNode | Promise<VNode>;

export type BoundaryRefreshOptions = RenderToStringOptions & {
	boundaryId: string;
	patchStrategy?: 'replace' | 'text' | 'element';
	previousHtml?(
		input: ExactInvocationRequest,
		context: ExactServerContext
	): string | Promise<string | undefined> | undefined;
};

export type ActionRefreshBoundaryOptions = BoundaryRefreshOptions & {
	render: BoundaryRenderFunction;
};

export type ActionRefreshOptions = {
	action(
		input: ExactInvocationRequest,
		context: ExactServerContext
	): Promise<ExactInvocationResult | void> | ExactInvocationResult | void;
	boundaries: readonly ActionRefreshBoundaryOptions[];
};

export type ExactBoundaryRenderer =
	| BoundaryRenderFunction
	| (Partial<BoundaryRefreshOptions> & { render: BoundaryRenderFunction });

export type ExactServerHandlerRegistryOptions = RenderToStringOptions & {
	manifest: ExactServerManifest;
	actions?: Record<
		string,
		(
			input: ExactInvocationRequest,
			context: ExactServerContext
		) => Promise<ExactInvocationResult | void> | ExactInvocationResult | void
	>;
	boundaries?: Record<string, ExactBoundaryRenderer>;
	patchStrategy?: BoundaryRefreshOptions['patchStrategy'];
};

export type ExactServerHandlerRegistry = {
	actions: NonNullable<ExactServerContext['actions']>;
	refreshBoundaries: NonNullable<ExactServerContext['refreshBoundaries']>;
};

export type ExactServerRuntimeOptions = ExactServerHandlerRegistryOptions &
	ExactServerContextConfiguration & {
		authorize?: ExactServerContext['authorize'];
		validateCsrf?: ExactServerContext['validateCsrf'];
	};

export type KeyedListSnapshotItem = {
	key: string;
	html: string;
};

export type KeyedListSnapshot = {
	listId: string;
	html: string;
	innerHtml: string;
	items: KeyedListSnapshotItem[];
};

export type KeyedListSnapshotOptions<T> = RenderToStringOptions & {
	listId: string;
	items: Iterable<T>;
	key(item: T): string;
	render(item: T): VNode;
};

export type KeyedListSnapshotParseOptions = {
	/** Maximum encoded snapshot bytes. Defaults to 16 MiB. */
	maxBytes?: number;
	/** Maximum top-level keyed items. Defaults to 100,000. */
	maxItems?: number;
	/** Maximum exact markers inspected. Defaults to 200,000. */
	maxMarkers?: number;
};

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

export type SsrContext = {
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
	reactSelectValue?: unknown;
	allowUnsafeHtml: boolean;
	onUnsafeHtml?: (event: UnsafeHtmlAuditEvent) => void;
	/** True until the first root host/text output determines document mode. */
	documentProbe: boolean;
	documentRootSeen: boolean;
	documentHeadSeen: boolean;
	documentBodySeen: boolean;
	hostStack: string[];
	componentContexts?: ComponentContextValues;
};

export type { Child, ComponentFunction, ComponentInstance, Logger, TaskObserver, VNode };
export type {
	ExactInvocationRequest,
	ExactInvocationResult,
	ExactRequestLike,
	ExactResponseLike,
	ExactServerContext
};
