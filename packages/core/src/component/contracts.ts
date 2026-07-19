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

export type VNode<Props = Record<string, unknown>> = {
	type: VNodeType;
	props: Props;
	children: Child[];
	key?: string;
};

export type VNodeCell = {
	readonly id: symbol;
	readonly vnode: VNode;
};

export type ListBinding<T = unknown> = {
	collection: Iterable<T>;
	source?: ReactiveRef<Iterable<T>>;
	key: (item: T) => string;
	render: (item: T) => VNode;
	cache?: Map<string, { item: T; vnode: VNode }>;
};

export type Child = VNode | string | number | boolean | null | undefined | object;

export type RenderResult = Child | Child[];
export type RenderFunction = () => RenderResult;
export type UnsafeHtmlAuditEvent = {
	/** UTF-16 code units accepted by the raw range; the content is never included. */
	characters: number;
};
export type ComponentFunction<State extends object = Record<string, unknown>, Props = any> = (
	this: Component<State>,
	props: Props
) => RenderFunction | RenderResult;

export type ErrorSource =
	| 'component'
	| 'construct'
	| 'render'
	| 'task'
	| 'event'
	| 'lifecycle'
	| 'reactive'
	| 'dom';

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

export type ErrorReportOptions = {
	source?: ErrorSource;
	phase?: string;
	component?: ErrorReport['component'];
};

export type ErrorContextValue = {
	errors: ErrorReport[];
	/** Optional owning boundary; errors thrown by that boundary itself skip this context. */
	boundary?: ComponentInstance<any>;
	report(error: unknown, options?: ErrorReportOptions): ErrorReport;
	clear(error: ErrorReport | string): void;
	clearAll(): void;
};

export type SuspensionContextValue = {
	suspend(promise: PromiseLike<unknown>): void;
};

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

export type ComponentContextValues = ReadonlyMap<symbol, unknown>;

export type RefKey<T> = {
	readonly id: symbol;
	readonly description: string;
	/** Carries the referenced value type without affecting runtime representation. */
	readonly __value?: T;
};

export type RefBinding<T> = {
	readonly key: RefKey<T>;
	readonly owner: ComponentInstance<any>;
	fulfill(value: T | undefined): void;
};

export type RefRegistry = {
	get<T>(key: RefKey<T>): T | undefined;
};

export type TaskContext = {
	signal: AbortSignal;
};

export type TaskResourceDisposal = string;
export type TaskCleanup = (reason?: unknown) => void | Promise<void>;
export type TaskIdleDeadline = { readonly didTimeout: boolean; timeRemaining(): number };
export type TaskIdleOptions = { timeout?: number };

export type TaskObserver = {
	register(promise: Promise<unknown>, instance: ComponentInstance<any>): void;
	/** Retains a constructed component for the lifetime of an owning renderer. */
	retain?(instance: ComponentInstance<any>): void;
};

export type Cleanup = void | (() => void | Promise<void>);
export type TaskResult = Cleanup | Promise<Cleanup>;
export type Unwrapped<Deps extends readonly unknown[]> = {
	[K in keyof Deps]: Deps[K] extends ReactiveValue<infer T>
		? T
		: Deps[K] extends Reactive<infer T>
			? T
			: Deps[K];
};
export type ComponentReactiveValue<T> = ReactiveValue<T> & {
	task(work: (value: T, ctx: TaskContext) => TaskResult): void;
};
export type IterableItem<T> = T extends Iterable<infer Item> ? Item : never;

export type ComponentTask = {
	(work: (ctx: TaskContext) => TaskResult): void;
	<Deps extends readonly unknown[]>(
		...args: [...deps: Deps, work: (...args: [...Unwrapped<Deps>, TaskContext]) => TaskResult]
	): void;
	server: ComponentTaskRegistration;
	client: ComponentTaskRegistration;
};

export type ComponentTaskRegistration = {
	(work: (ctx: TaskContext) => TaskResult): void;
	<Deps extends readonly unknown[]>(
		...args: [...deps: Deps, work: (...args: [...Unwrapped<Deps>, TaskContext]) => TaskResult]
	): void;
};

// Callback return values are intentionally permissive: concise callbacks often
// return values such as Array#push's number. Promise-like values are observed at
// runtime, while all other results are ignored.
export type LifecycleHandler = (ctx: { signal: AbortSignal; reason?: string }) => unknown;
export type RenderEventHandler = (event: { duration: number; dependencies?: unknown[] }) => unknown;

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
