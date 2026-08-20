/** Describes why a task generation began. */
export type TaskActivation =
	| 'initialization'
	| 'reactive'
	| 'interaction'
	| 'invoked'
	| 'lifecycle';

/** Capabilities scoped to one task frame. */
export interface TaskContext {
	readonly signal: AbortSignal;
	readonly generation: number;
	readonly activation: TaskActivation;
	peek<T>(read: () => T): T;
	optimistic(work: () => void): void;
	cleanup(cleanup: () => void | Promise<void>): void;
	own<T extends Disposable | AsyncDisposable>(resource: T): T;
}

/**
 * Declarative task policy accepted only as the default value of a final
 * {@link TaskContext} parameter in compiler-authored source.
 */
export interface TaskContextPolicy extends TaskContext {
	client(): TaskContextPolicy;
	server(): TaskContextPolicy;
	parallel(): TaskContextPolicy;
	latest(): TaskContextPolicy;
	queue(): TaskContextPolicy;
	key<T>(value: T): TaskContextPolicy;
	immediate(): TaskContextPolicy;
	normal(): TaskContextPolicy;
	deferred(): TaskContextPolicy;
	blocking(): TaskContextPolicy;
	nonblocking(): TaskContextPolicy;
	detached(): TaskContextPolicy;
}

/** Durable cancellation and concurrency ownership for task generations. */
export interface TaskOwner extends AsyncDisposable {
	readonly signal: AbortSignal;
}

/** Owner-bound observable state for one task definition. */
export interface TaskStatus<Result> {
	readonly pending: boolean;
	readonly pendingCount: number;
	readonly generation: number;
	readonly result: Result | undefined;
	readonly error: unknown;
	cancel(reason?: unknown): void;
}

/** A thenable whose result settles only after its attached task subtree. */
export interface TaskInvocation<Result> extends PromiseLike<Result> {
	then<TResult1 = Result, TResult2 = never>(
		onFulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
		onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
	): TaskInvocation<TResult1 | TResult2>;
	catch<TResult = never>(
		onRejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
	): TaskInvocation<Result | TResult>;
	finally(onFinally?: (() => void) | null): TaskInvocation<Result>;
	readonly [Symbol.toStringTag]: 'TaskInvocation';
}

/** Callable runtime task definition. */
export interface TaskFunction<Args extends unknown[], Result> {
	(...args: Args): TaskInvocation<Result>;
}

/** Existential task function retained where authored argument tuples are not inspected. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Runtime task registries preserve arbitrary authored argument tuples through callable identity.
export type AnyTaskFunction<Result = unknown> = TaskFunction<any[], Result>;

/** Owner-bound task callable with aggregate status. */
export interface BoundTaskFunction<Args extends unknown[], Result>
	extends TaskFunction<Args, Result>,
		TaskStatus<Result> {}

/** Runtime policy required when a library defines a task without the compiler. */
export interface RuntimeTaskOptions<Args extends unknown[]> {
	readonly label?: string;
	readonly placement?: 'current' | 'client' | 'server';
	readonly priority?: 'immediate' | 'normal' | 'deferred';
	readonly concurrency?: 'parallel' | 'latest' | 'queue';
	readonly concurrencyKey?: (...args: Args) => unknown;
	/**
	 * Compiler-generated resolver for defaulted task parameters. It evaluates
	 * omitted defaults once per generation without subscribing the task to
	 * reactive reads performed while resolving them.
	 */
	readonly captureArguments?: (args: unknown[]) => readonly unknown[];
	readonly readiness?: 'blocking' | 'nonblocking';
	readonly detached?: boolean;
	readonly owner?: TaskOwner;
}

/** Reserved callback that must run or be explicitly released exactly once. */
export interface ReservedTaskCallback<Args extends unknown[], Result> extends Disposable {
	(...args: Args): Result;
	cancel(reason?: unknown): void;
}
