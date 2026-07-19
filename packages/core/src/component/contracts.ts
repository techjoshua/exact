import type {
	EffectScope,
	Reactive,
	ReactiveRef,
	ReactiveValue,
	StopHandle
} from '@exact/reactive';

import type { ComponentLog } from '../logging.js';

import type {
	Cell,
	Dynamic,
	Fragment,
	Portal,
	ServerBoundary,
	ServerSlot,
	Text,
	UnsafeHtml
} from '../symbols.js';

/** Defines the vnode type type contract. */
export type VNodeType =
	| string
	| typeof Fragment
	| typeof Text
	| typeof Cell
	| typeof Dynamic
	| typeof Portal
	| typeof ServerBoundary
	| typeof ServerSlot
	| typeof UnsafeHtml
	| ComponentFunction<any, any>;

/** Defines the vnode type contract. */
export type VNode<Props = Record<string, unknown>> = {
	type: VNodeType;
	props: Props;
	children: Child[];
	key?: string;
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

/** Defines the error source type contract. */
export type ErrorSource =
	| 'component'
	| 'construct'
	| 'render'
	| 'task'
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

/** Defines the context token type contract. */
export type ContextToken<T> = {
	readonly id: symbol;
	readonly description: string;
	readonly global: boolean;
	readonly reactive: boolean;
	readonly keep?: 'server' | 'client' | 'secret';
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

/** Defines the component task type contract. */
export type ComponentTask = {
	(work: (ctx: TaskContext) => TaskResult): void;
	<Deps extends readonly unknown[]>(
		...args: [...deps: Deps, work: (...args: [...Unwrapped<Deps>, TaskContext]) => TaskResult]
	): void;
	server: ComponentTaskRegistration;
	client: ComponentTaskRegistration;
};

/** Defines the component task registration type contract. */
export type ComponentTaskRegistration = {
	(work: (ctx: TaskContext) => TaskResult): void;
	<Deps extends readonly unknown[]>(
		...args: [...deps: Deps, work: (...args: [...Unwrapped<Deps>, TaskContext]) => TaskResult]
	): void;
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
	onUnmount(handler: LifecycleHandler): void;
	onRender(handler: RenderEventHandler): void;
}

/** Defines the component instance type contract. */
export type ComponentInstance<State extends object> = Component<State> & {
	readonly type: ComponentFunction<State, any>;
	readonly parent?: ComponentInstance<any>;
	readonly props: Reactive<Record<string, unknown>>;
	readonly contexts: Map<symbol, unknown>;
	/** Server-owned values inherited by the whole component root. */
	readonly ambientContexts?: ComponentContextValues;
	readonly id: string;
	readonly mounted: boolean;
	readonly scope: EffectScope;
	readonly renderFunction: RenderFunction;
	renderStop?: StopHandle;
	mountController?: AbortController;
	tasks: TaskRegistration[];
	mountHandlers: LifecycleHandler[];
	unmountHandlers: LifecycleHandler[];
	renderHandlers: RenderEventHandler[];
	invalidate?: () => void;
	errorFallback?: RenderFunction;
	beginRender(): void;
	endRender(): void;
	markMounted(): void;
	updateProps(props: Record<string, unknown>): void;
	unmount(reason?: string): void;
};

/** Defines the task registration type contract. */
export type TaskRegistration = {
	deps: unknown[];
	sources: ReactiveRef[];
	work: (...args: any[]) => TaskResult;
	stops: StopHandle[];
	controller?: AbortController;
	cleanup?: () => void | Promise<void>;
	settlement?: Promise<void>;
	queuedGeneration?: number;
	stopped: boolean;
	generation: number;
	run(): void;
	stop(): void;
};
