/** Controls how accepted invocations of one component action overlap. */
export type ActionConcurrency = 'parallel' | 'latest' | 'queue';

/** Selects where authored action work is required to execute. */
export type ActionPlacementRequest = 'inferred' | 'client' | 'server';

/** Runtime-owned capability supplied only to the active action generation. */
export type ActionContext = {
	/** Aborts when the generation is cancelled, superseded, or disposed with its component. */
	readonly signal: AbortSignal;
	/** Monotonically increasing generation within the registered component action. */
	readonly generation: number;
	/**
	 * Immediately publishes synchronous component-state mutations with rollback ownership.
	 *
	 * The callback must not start asynchronous work or mutate values outside the owning component.
	 */
	optimistic(work: () => void): void;
};

/** Inspectable, reactive callable owned by one component instance. */
export type ComponentAction<Args extends readonly unknown[], Result> = {
	(...args: Args): Promise<Result>;
	readonly pending: boolean;
	readonly pendingCount: number;
	readonly generation: number;
	readonly result: Result | undefined;
	readonly error: unknown;
	/** Cancels every active or queued generation without publishing an application error. */
	cancel(reason?: unknown): void;
};

/** Callable action registrar shared by each placement and scheduling facet. */
export type ComponentActionRegistration = {
	<Args extends readonly unknown[], Result>(
		name: string,
		work: (...args: [...Args, ActionContext]) => Result | PromiseLike<Result>,
		concurrency?: ActionConcurrency
	): ComponentAction<Args, Awaited<Result>>;
	<Args extends readonly unknown[], Result>(
		name: string,
		work: (...args: Args) => Result | PromiseLike<Result>,
		concurrency?: ActionConcurrency
	): ComponentAction<Args, Awaited<Result>>;
	readonly deferred: ComponentActionRegistration;
};

/** Component-owned action registrar with composable placement facets. */
export type ComponentActionFactory = ComponentActionRegistration & {
	readonly client: ComponentActionRegistration;
	readonly server: ComponentActionRegistration;
};

/** Immutable diagnostic snapshot of one component-owned action resource. */
export type ComponentActionInspection = Readonly<{
	name: string;
	concurrency: ActionConcurrency;
	placement: ActionPlacementRequest;
	priority: 'normal' | 'deferred';
	pending: boolean;
	pendingCount: number;
	optimistic: boolean;
	generation: number;
	result: unknown;
	error: unknown;
	cancellationReason?: unknown;
	disposed: boolean;
}>;

/** Compiler-recognized brand for callbacks that begin framework interaction scopes. */
export const interactionHandler: unique symbol = Symbol('exact.interaction-handler');

/**
 * Marks a callback position as an interaction source without changing ordinary call semantics.
 */
export type InteractionHandler<Args extends readonly unknown[]> = InteractionCallable<Args> & {
	readonly [interactionHandler]?: true;
};

/**
 * Expands common callback arities explicitly because the TypeScript 7 native
 * checker currently contextualizes a generic rest tuple as one tuple parameter.
 */
type InteractionCallable<Args extends readonly unknown[]> = Args extends readonly []
	? () => unknown
	: Args extends readonly [infer First]
		? (first: First) => unknown
		: Args extends readonly [infer First, infer Second]
			? (first: First, second: Second) => unknown
			: Args extends readonly [infer First, infer Second, infer Third]
				? (first: First, second: Second, third: Third) => unknown
				: Args extends readonly [infer First, infer Second, infer Third, infer Fourth]
					? (first: First, second: Second, third: Third, fourth: Fourth) => unknown
					: (...args: Args) => unknown;
