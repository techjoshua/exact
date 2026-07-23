/** Defines the reactive type contract. */
export type Reactive<T> = T;

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
};

/** Defines the stop handle type contract. */
export type StopHandle = () => void;

/** Defines the effect scope type contract. */
export type EffectScope = {
	active: boolean;
	stop(): void;
};

/** Defines the effect scope impl type contract. */
export type EffectScopeImpl = EffectScope & {
	parent?: EffectScopeImpl;
	children: Set<EffectScopeImpl>;
	reactions: Set<Reaction>;
	cleanups: Set<StopHandle>;
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
