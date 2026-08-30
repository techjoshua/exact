/** Defines the reactive type contract. */
export type Reactive<T> = T;

/** Orders framework work without changing reactive dependency semantics. */
export type WorkPriority = 'interactive' | 'normal' | 'deferred';

/** Defines the reactive ref type contract. */
export type ReactiveRef<T = unknown> = {
	readonly target: object;
	readonly key: PropertyKey;
	get(): T;
	set(value: T): void;
};

/** Defines the reactive value type contract. */
export type ReactiveValue<T = unknown> = {
	get(): T;
	toJSON(): T;
	toString(): string;
	valueOf(): T;
	[Symbol.toPrimitive](): T;
};

/** Defines the dep type contract. */
export type Dep = Set<Reaction>;

/** Defines the reaction type contract. */
export type Reaction = {
	active: boolean;
	scheduled: boolean;
	/** Framework-internal ordering within one user-visible work priority. */
	order?: number;
	/** Highest-priority invalidation waiting to run this reaction. */
	pendingPriority?: WorkPriority;
	scope?: EffectScopeImpl;
	deps: Set<Dep>;
	run(): void;
	schedule(): void;
	stop(): void;
};

/** Configures reactive. */
export type ReactiveOptions = {
	readonly?: boolean;
	passthroughKeys?: readonly PropertyKey[];
	onReadonlyWrite?(key: PropertyKey): void;
	/**
	 * Observes successful mutations after dependency invalidation.
	 * Failures are isolated so diagnostics cannot alter reactive semantics.
	 */
	onMutation?(key: PropertyKey | undefined, operation: string): void;
};

/** Defines the stop handle type contract. */
export type StopHandle = () => void;

/** Defines the effect scope type contract. */
export type EffectScope = {
	active: boolean;
	/** Whether this scope is paused directly or by an ancestor. */
	readonly paused: boolean;
	/** Prevents owned scheduled work from running without disposing ownership. */
	pause(): void;
	/** Releases this scope's own pause and schedules eligible accumulated work. */
	resume(): void;
	stop(): void;
};

/** Defines the effect scope impl type contract. */
export type EffectScopeImpl = EffectScope & {
	selfPaused: boolean;
	workPriority?: WorkPriority;
	parent?: EffectScopeImpl;
	children: Set<EffectScopeImpl>;
	reactions: Set<Reaction>;
	cleanups: Set<StopHandle>;
	resumeWaiters: Set<() => void>;
	onError?: (error: unknown) => void;
	onProfile?: ExactProfileSink<ReactiveProfileEvent>;
};

/** Configures watch. */
export type WatchOptions = {
	scope?: EffectScope;
	onSchedule?(): void;
	onError?(error: unknown): void;
};
import type { ExactProfileEvent, ExactProfileSink } from '@exactjs/instrumentation';

/** Reports an observable reactive profile event. */
export type ReactiveProfileEvent = ExactProfileEvent<'reactive', 'flush'>;
