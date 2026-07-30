import type { TaskInvocation } from './contracts.js';

/** Thenable task result that records when application code observes its result edge. */
export class TaskInvocationValue<Result> implements TaskInvocation<Result> {
	readonly [Symbol.toStringTag] = 'TaskInvocation' as const;

	constructor(
		private readonly promise: Promise<Result>,
		private readonly observe: () => void = () => undefined
	) {}

	/** Observes the result edge and chains fulfillment or rejection handlers. */
	then<TResult1 = Result, TResult2 = never>(
		onFulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
		onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
	): TaskInvocation<TResult1 | TResult2> {
		this.observe();
		return new TaskInvocationValue(this.promise.then(onFulfilled, onRejected));
	}

	/** Observes the result edge and chains a rejection handler. */
	catch<TResult = never>(
		onRejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
	): TaskInvocation<Result | TResult> {
		this.observe();
		return new TaskInvocationValue(this.promise.catch(onRejected));
	}

	/** Observes the result edge and runs a handler after settlement. */
	finally(onFinally?: (() => void) | null): TaskInvocation<Result> {
		this.observe();
		return new TaskInvocationValue(this.promise.finally(onFinally ?? undefined));
	}
}
