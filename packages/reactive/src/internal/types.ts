export type Reactive<T> = T;

export type ReactiveRef<T = unknown> = {
  readonly target: object;
  readonly key: PropertyKey;
  get(): T;
  set(value: T): void;
};

export type ReactiveValue<T = unknown> = {
  get(): T;
  toJSON(): T;
  toString(): string;
  valueOf(): T;
  [Symbol.toPrimitive](): T;
};

export type Dep = Set<Reaction>;

export type Reaction = {
  active: boolean;
  scheduled: boolean;
  scope?: EffectScopeImpl;
  deps: Set<Dep>;
  run(): void;
  schedule(): void;
  stop(): void;
};

export type ReactiveOptions = {
  readonly?: boolean;
  passthroughKeys?: readonly PropertyKey[];
  onReadonlyWrite?(key: PropertyKey): void;
};

export type StopHandle = () => void;

export type EffectScope = {
  active: boolean;
  stop(): void;
};

export type EffectScopeImpl = EffectScope & {
  parent?: EffectScopeImpl;
  children: Set<EffectScopeImpl>;
  reactions: Set<Reaction>;
  cleanups: Set<StopHandle>;
  onError?: (error: unknown) => void;
  onProfile?: ExactProfileSink<ReactiveProfileEvent>;
};

export type WatchOptions = {
  scope?: EffectScope;
  onSchedule?(): void;
  onError?(error: unknown): void;
};
import type { ExactProfileEvent, ExactProfileSink } from "@exact/instrumentation";

export type ReactiveProfileEvent = ExactProfileEvent<"reactive", "flush">;
