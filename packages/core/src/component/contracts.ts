import type {
	EffectScope,
	Reactive,
	ReactiveRef,
	ReactiveValue,
	StopHandle
} from '@exactjs/reactive';

import type { ComponentLog } from '../logging.js';
import type { ComponentActionFactory } from './action-contracts.js';
import type { ExactRuntimeInspectionOwner } from './inspection.js';

import type {
	Activity,
	Cell,
	Dynamic,
	Fragment,
	Portal,
	ServerBoundary,
	ServerSlot,
	Suspense,
	Text,
	UnsafeHtml
} from '../symbols.js';

/** Defines the vnode type type contract. */
export type VNodeType =
	| string
	| typeof Activity
	| typeof Fragment
	| typeof Text
	| typeof Cell
	| typeof Dynamic
	| typeof Portal
	| typeof ServerBoundary
	| typeof ServerSlot
	| typeof Suspense
	| typeof UnsafeHtml
	| ComponentFunction<any, any>;

/** Controls whether a native Activity subtree is connected, parked, or prepared in background. */
export type ActivityMode = 'active' | 'parked' | 'background';

/** Immutable execution-root ownership for one component instance. */
export type ComponentDomain = {
	readonly executionRoot: string;
	/** Optional explicit runtime inspection owner; absent from hardened builds. */
	readonly inspection?: ExactRuntimeInspectionOwner;
	/** Framework-private activation phase inherited by the root component. */
	readonly inspectionActivation?: 'hydration';
	/** Framework-private bridge used by compiler-generated distributed continuations. */
	readonly dispatchContinuation?: ComponentContinuationDispatcher;
	/** Framework-private source of one serialized SSR component activation. */
	readonly resumeComponent?: (
		type: ComponentFunction<any, any>
	) => ComponentResumptionActivation | undefined;
};

/** Client-visible state and settled work used to reconstruct one SSR component instance. */
export type ComponentResumptionActivation = Readonly<{
	componentId: string;
	values: Readonly<Record<string, unknown>>;
	contexts: Readonly<Record<string, unknown>>;
	settledContinuations: readonly string[];
}>;

/** Client-local token identity paired with a compiler-stable context contract name. */
export type ComponentContinuationContextBinding = Readonly<{
	name: string;
	token: ContextToken<any>;
}>;

/** Compiler-generated request to advance the server half of a component machine. */
export type ComponentContinuationDispatch = {
	readonly instance: ComponentInstance<any>;
	readonly id: string;
	readonly dependencies: readonly unknown[];
	readonly contextWrites: readonly ComponentContinuationContextBinding[];
	readonly signal: AbortSignal;
	readonly generation?: number;
};

/** Runtime-owned transport bridge for one immutable component domain. */
export type ComponentContinuationDispatcher = (
	request: ComponentContinuationDispatch
) => Promise<unknown>;

/** Defines the vnode type contract. */
export type VNode<Props = Record<string, unknown>> = {
	type: VNodeType;
	props: Props;
	children: Child[];
	key?: string;
	/** Captured when authored; explicit ownership survives cross-root composition. */
	readonly domain?: ComponentDomain;
};

/** Defines the vnode cell type contract. */
export type VNodeCell = {
	readonly id: symbol;
	readonly vnode: VNode;
};

/** Defines the list binding type contract. */
export type ListBinding<T = unknown> = {
	collection: Iterable<T>;
	source?: ReactiveRef<Iterable<T>>;
	key: (item: T) => string;
	render: (item: T) => VNode;
	cache?: Map<string, { item: T; vnode: VNode }>;
};

/** Defines the child type contract. */
export type Child = VNode | string | number | boolean | null | undefined | object;

/** Describes the result produced by render. */
export type RenderResult = Child | Child[];
/** Defines the render function type contract. */
export type RenderFunction = () => RenderResult;
/** Reports an observable unsafe html audit event. */
export type UnsafeHtmlAuditEvent = {
	/** UTF-16 code units accepted by the raw range; the content is never included. */
	characters: number;
};
/** Defines the component function type contract. */
export type ComponentFunction<State extends object = Record<string, unknown>, Props = any> = (
	this: Component<State>,
	props: Props
) => RenderFunction | RenderResult;

/**
 * Authored async component shape accepted by the eXact compiler.
 *
 * Compiled artifacts lower this function to a synchronous {@link ComponentFunction} plus owned
 * continuations. Runtime renderers intentionally do not accept an uncompiled async component.
 */
export type AsyncComponentFunction<State extends object = Record<string, unknown>, Props = any> = (
	this: Component<State>,
	props: Props
) => Promise<RenderFunction | RenderResult>;

/** Defines the error source type contract. */
export type ErrorSource =
	| 'component'
	| 'construct'
	| 'render'
	| 'task'
	| 'action'
	| 'event'
	| 'lifecycle'
	| 'reactive'
	| 'dom';

/** Defines the error report type contract. */
export type ErrorReport = {
	/** @exact key */
	id: string;
	error: unknown;
	source: ErrorSource;
	component?: {
		id: string;
		name: string;
		mounted: boolean;
	};
	phase?: string;
};

/** Configures error report. */
export type ErrorReportOptions = {
	source?: ErrorSource;
	phase?: string;
	component?: ErrorReport['component'];
};

/** Defines the error context value type contract. */
export type ErrorContextValue = {
	errors: ErrorReport[];
	/** Optional owning boundary; errors thrown by that boundary itself skip this context. */
	boundary?: ComponentInstance<any>;
	report(error: unknown, options?: ErrorReportOptions): ErrorReport;
	clear(error: ErrorReport | string): void;
	clearAll(): void;
};

/** Defines the suspension context value type contract. */
export type SuspensionContextValue = {
	suspend(promise: PromiseLike<unknown>): void;
};

/** Describes one task generation that participates in a readiness boundary. */
export type BlockingWork = {
	readonly owner: ComponentInstance<any>;
	readonly taskGeneration: number;
	readonly settlement: PromiseLike<unknown>;
	/** Whether settlement requires reconstructing the candidate rather than committing it directly. */
	readonly retry?: boolean;
	/** Publishes state staged by this generation when its boundary commits. */
	commit?(): void;
	/** Releases staged state when its boundary generation is discarded. */
	discard?(): void;
};

/** Cancels one generation-bound readiness registration without cancelling its underlying work. */
export type ReadinessRegistration = {
	readonly boundaryGeneration: number;
	readonly settlement: PromiseLike<unknown>;
	cancel(): void;
};

/** Registers blocking descendant work against the current candidate generation. */
export type ReadinessContextValue = {
	readonly generation: number;
	register(work: BlockingWork): ReadinessRegistration;
};

/** Defines the context token type contract. */
export type ContextToken<T> = {
	readonly id: symbol;
	readonly description: string;
	readonly global: boolean;
	readonly reactive: boolean;
	readonly keep?: 'server' | 'client' | 'shared' | 'secret';
	readonly scope: 'component' | 'application' | 'request';
	/** Carries the context value type without affecting runtime representation. */
	readonly __value?: T;
};

/** Defines the component context values type contract. */
export type ComponentContextValues = ReadonlyMap<symbol, unknown>;

/** Defines the ref key type contract. */
export type RefKey<T> = {
	readonly id: symbol;
	readonly description: string;
	/** Carries the referenced value type without affecting runtime representation. */
	readonly __value?: T;
};

/** Defines the ref binding type contract. */
export type RefBinding<T> = {
	readonly key: RefKey<T>;
	readonly owner: ComponentInstance<any>;
	fulfill(value: T | undefined): void;
};

/** Defines the ref registry type contract. */
export type RefRegistry = {
	get<T>(key: RefKey<T>): T | undefined;
};

/** Carries the context required by task. */
export type TaskContext = {
	signal: AbortSignal;
};

/** Defines the task resource disposal type contract. */
export type TaskResourceDisposal = string;
/** Defines the task cleanup type contract. */
export type TaskCleanup = (reason?: unknown) => void | Promise<void>;
/** Defines the task idle deadline type contract. */
export type TaskIdleDeadline = { readonly didTimeout: boolean; timeRemaining(): number };
/** Configures task idle. */
export type TaskIdleOptions = { timeout?: number };

/** Defines the task observer type contract. */
export type TaskObserver = {
	register(promise: Promise<unknown>, instance: ComponentInstance<any>): void;
	/** Retains a constructed component for the lifetime of an owning renderer. */
	retain?(instance: ComponentInstance<any>): void;
};

/** Defines the cleanup type contract. */
export type Cleanup = void | (() => void | Promise<void>);
/** Describes the result produced by task. */
export type TaskResult = Cleanup | Promise<Cleanup>;
/** Selects where authored task work is required to execute. */
export type TaskPlacementRequest = 'inferred' | 'client' | 'server';
/** Controls when a task generation runs and whether it participates in boundary readiness. */
export type TaskPolicy = {
	readonly placement: TaskPlacementRequest;
	readonly priority: 'normal' | 'deferred';
	readonly readiness: 'blocking' | 'nonblocking';
};
/** Defines the unwrapped type contract. */
export type Unwrapped<Deps extends readonly unknown[]> = {
	[K in keyof Deps]: Deps[K] extends ReactiveValue<infer T>
		? T
		: Deps[K] extends Reactive<infer T>
			? T
			: Deps[K];
};
/** Defines the component reactive value type contract. */
export type ComponentReactiveValue<T> = ReactiveValue<T> & {
	task(work: (value: T, ctx: TaskContext) => TaskResult): void;
};
/** Defines the iterable item type contract. */
export type IterableItem<T> = T extends Iterable<infer Item> ? Item : never;

/** Defines the callable task registration overloads shared by every task facet. */
export type ComponentTaskCallable = {
	/**
	 * Represents compiler-owned value flow from an awaited task into component state.
	 *
	 * The compiler lowers this form into a synchronous registration whose result is published by
	 * its blocking generation. The returned promise is source-level syntax and is not available
	 * when the component is executed without compilation.
	 */
	<Result>(work: (ctx: TaskContext) => PromiseLike<Result>): Promise<Awaited<Result>>;
	<Result, Deps extends readonly unknown[]>(
		...args: [
			...deps: Deps,
			work: (...args: [...Unwrapped<Deps>, TaskContext]) => PromiseLike<Result>
		]
	): Promise<Awaited<Result>>;
	(work: (ctx: TaskContext) => TaskResult): void;
	<Deps extends readonly unknown[]>(
		...args: [...deps: Deps, work: (...args: [...Unwrapped<Deps>, TaskContext]) => TaskResult]
	): void;
};

/** Defines a task registration with composable scheduling and readiness facets. */
export type ComponentTaskRegistration = ComponentTaskCallable & {
	readonly deferred: ComponentTaskRegistration;
	readonly blocking: ComponentTaskRegistration;
};

/** Defines the component task type contract. */
export type ComponentTask = ComponentTaskRegistration & {
	server: ComponentTaskRegistration;
	client: ComponentTaskRegistration;
};

// Callback return values are intentionally permissive: concise callbacks often
// return values such as Array#push's number. Promise-like values are observed at
// runtime, while all other results are ignored.
/** Defines the lifecycle handler type contract. */
export type LifecycleHandler = (ctx: { signal: AbortSignal; reason?: string }) => unknown;
/** Defines the render event handler type contract. */
export type RenderEventHandler = (event: { duration: number; dependencies?: unknown[] }) => unknown;

/** Defines the component interface contract. */
export interface Component<State extends object> {
	state: Reactive<State>;
	log: ComponentLog;
	/** Registers durable, inspectable work owned by this component instance. */
	action: ComponentActionFactory;
	/** Reports whether a context lookup would resolve without reading its value. */
	hasContext(token: ContextToken<unknown>): boolean;
	getContext<T>(token: ContextToken<T>): Reactive<T>;
	setContext<T>(token: ContextToken<T>, value: T): void;
	reactive(strings: TemplateStringsArray, ...values: unknown[]): ComponentReactiveValue<string>;
	reactive<T>(compute: () => T): ComponentReactiveValue<T>;
	reactive<T>(value: T): ComponentReactiveValue<T>;
	task: ComponentTask;
	ref<T>(key: RefKey<T>): RefBinding<T>;
	refs: RefRegistry;
	map<Collection extends Iterable<unknown>>(
		collection: ReactiveValue<Collection>,
		key: (item: IterableItem<Collection>) => string,
		render: (item: IterableItem<Collection>) => VNode,
		id?: string,
		provenance?: Iterable<IterableItem<Collection>>,
		keyIdentity?: string
	): VNode;
	map<T>(
		collection: Iterable<T>,
		key: (item: T) => string,
		render: (item: T) => VNode,
		id?: string,
		provenance?: Iterable<T>,
		keyIdentity?: string
	): VNode;
	onMount(handler: LifecycleHandler): void;
	onActivate(handler: LifecycleHandler): void;
	onDeactivate(handler: LifecycleHandler): void;
	onUnmount(handler: LifecycleHandler): void;
	onRender(handler: RenderEventHandler): void;
}

/** Defines the component instance type contract. */
export type ComponentInstance<State extends object> = Component<State> & {
	readonly type: ComponentFunction<State, any>;
	parent?: ComponentInstance<any>;
	readonly domain: ComponentDomain;
	readonly props: Reactive<Record<string, unknown>>;
	readonly contexts: Map<symbol, unknown>;
	/** Context policy identities accessed by this instance; values remain with their original owner. */
	readonly contextTokens: Map<symbol, ContextToken<unknown>>;
	/** Server-owned values inherited by the whole component root. */
	readonly ambientContexts?: ComponentContextValues;
	readonly id: string;
	readonly mounted: boolean;
	readonly scope: EffectScope;
	readonly renderFunction: RenderFunction;
	renderStop?: StopHandle;
	mountController?: AbortController;
	activationController?: AbortController;
	tasks: TaskRegistration[];
	mountHandlers: LifecycleHandler[];
	activateHandlers: LifecycleHandler[];
	deactivateHandlers: LifecycleHandler[];
	unmountHandlers: LifecycleHandler[];
	renderHandlers: RenderEventHandler[];
	invalidate?: () => void;
	errorFallback?: RenderFunction;
	beginRender(): void;
	endRender(): void;
	markMounted(): void;
	setActivity(token: symbol, active: boolean, reason?: string): void;
	updateProps(props: Record<string, unknown>): void;
	unmount(reason?: string): void;
};

/** Defines the task registration type contract. */
export type TaskRegistration = {
	deps: unknown[];
	sources: ReactiveRef[];
	work: (...args: any[]) => TaskResult;
	policy: TaskPolicy;
	stops: StopHandle[];
	controller?: AbortController;
	cleanup?: () => void | Promise<void>;
	settlement?: Promise<void>;
	queuedGeneration?: number;
	completedGeneration?: number;
	failedGeneration?: number;
	readinessRegistration?: ReadinessRegistration;
	stopped: boolean;
	generation: number;
	run(): void;
	/** Subscribes to future dependency changes without executing an initial generation. */
	resume(): void;
	stop(): void;
};
