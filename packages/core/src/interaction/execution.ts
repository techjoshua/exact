import type { ComponentInstance } from '../component/contracts.js';
import { executeTaskFrame, taskFrameSynchronousError } from '../tasks/frame-runtime.js';
import { taskOwnerForHost } from '../tasks/owner-hosts.js';

/** Identifies the framework host that began an interaction lifetime. */
export type InteractionSource = 'event' | 'form' | 'invoked' | 'navigation';

/** Scheduling class inherited by work joined to an interaction. */
export type InteractionPriority = 'interactive' | 'normal' | 'deferred';

/** Internal execution scope coordinating settlement and cancellation for one invocation. */
export type InteractionScope = {
	readonly id: number;
	readonly owner: ComponentInstance<any>;
	readonly source: InteractionSource;
	readonly controller: AbortController;
	readonly priority: InteractionPriority;
	readonly generation: number;
	readonly parent?: InteractionScope;
	phase: 'running' | 'settling' | 'succeeded' | 'failed' | 'cancelled';
	readonly settlements: Set<PromiseLike<unknown>>;
};

let nextInteractionId = 1;
let currentScope: InteractionScope | undefined;
const controllersByOwner = new WeakMap<ComponentInstance<any>, Set<AbortController>>();
const scopeBySignal = new WeakMap<AbortSignal, InteractionScope>();
const pendingResumptions: Array<{
	readonly scope: InteractionScope;
	readonly resume: () => void;
}> = [];
let resumptionScheduled = false;

/** Error used internally when an interaction generation loses ownership before settlement. */
export class InteractionCancellation extends Error {
	readonly reason: unknown;

	/** Creates a cancellation result that is excluded from application interaction error state. */
	constructor(reason?: unknown) {
		super('Component interaction was cancelled');
		this.name = 'AbortError';
		this.reason = reason;
	}
}

/** Returns the synchronously active interaction, when compiler-lowered work is joining one. */
export function currentInteraction(): InteractionScope | undefined {
	return currentScope;
}

/** Adds asynchronous work to the synchronously active interaction settlement lifetime. */
export function joinCurrentInteraction(settlement: PromiseLike<unknown>): void {
	currentScope?.settlements.add(settlement);
}

/**
 * Awaits interaction-owned work with generation cancellation fencing.
 *
 * The compiler supplies the active interaction signal. Cancellation rejects before an authored
 * continuation can publish stale state; the underlying external promise is not itself cancelled.
 */
export function interactionAwait<Result>(
	signal: AbortSignal,
	value: Result | PromiseLike<Result>
): Promise<Result> {
	if (signal.aborted) return Promise.reject(new InteractionCancellation(signal.reason));
	return new Promise<Result>((resolve, reject) => {
		let settled = false;
		const cancel = () => {
			if (settled) return;
			settled = true;
			resumeInteraction(signal, () => reject(new InteractionCancellation(signal.reason)));
		};
		signal.addEventListener('abort', cancel, { once: true });
		Promise.resolve(value).then(
			(result) => {
				if (settled) return;
				settled = true;
				signal.removeEventListener('abort', cancel);
				resumeInteraction(signal, () => {
					if (signal.aborted) reject(new InteractionCancellation(signal.reason));
					else resolve(result);
				});
			},
			(error) => {
				if (settled) return;
				settled = true;
				signal.removeEventListener('abort', cancel);
				resumeInteraction(signal, () => reject(error));
			}
		);
	});
}

/**
 * Publishes an interaction-owned mutation only while its generation still owns the interaction.
 *
 * Await cancellation can be observed by application `catch` blocks. Compiler-lowered writes
 * therefore use this second fence at the actual commit boundary so a caught cancellation cannot
 * publish stale component state.
 */
export function interactionMutation<Result>(signal: AbortSignal, mutation: () => Result): Result {
	if (signal.aborted) throw new InteractionCancellation(signal.reason);
	return mutation();
}

/**
 * Executes work inside a component-owned interaction and awaits every joined settlement.
 *
 * Child interactions are automatically joined to their active parent. Cancellation rejects with
 * {@link InteractionCancellation}; callers should not publish it as an application error.
 */
export function runComponentInteraction<Result>(
	owner: ComponentInstance<any>,
	source: InteractionSource,
	generation: number,
	priority: InteractionPriority,
	controller: AbortController,
	work: (scope: InteractionScope) => Result | PromiseLike<Result>
): Promise<Result> {
	const taskOwner = taskOwnerForHost(owner);
	if (!taskOwner)
		return runComponentInteractionScope(owner, source, generation, priority, controller, work);
	const execution = executeTaskFrame(
		{
			owner: taskOwner,
			controller,
			generation,
			activation: 'interaction',
			label: `${source} interaction`,
			concurrency: 'latest',
			priority: priority === 'interactive' ? 'immediate' : priority,
			readiness: priority === 'deferred' ? 'nonblocking' : 'blocking'
		},
		() => runComponentInteractionScope(owner, source, generation, priority, controller, work)
	);
	const synchronousError = taskFrameSynchronousError(execution);
	if (synchronousError) throw synchronousError.error;
	return execution;
}

function runComponentInteractionScope<Result>(
	owner: ComponentInstance<any>,
	source: InteractionSource,
	generation: number,
	priority: InteractionPriority,
	controller: AbortController,
	work: (scope: InteractionScope) => Result | PromiseLike<Result>
): Promise<Result> {
	const parent = currentScope;
	const scope: InteractionScope = {
		id: nextInteractionId++,
		owner,
		source,
		controller,
		priority,
		generation,
		parent,
		phase: 'running',
		settlements: new Set()
	};

	let controllers = controllersByOwner.get(owner);
	if (!controllers) controllersByOwner.set(owner, (controllers = new Set()));
	controllers.add(controller);
	scopeBySignal.set(controller.signal, scope);

	if (scope.controller.signal.aborted) {
		releaseInteraction(owner, controller, controllers);
		throw new InteractionCancellation(scope.controller.signal.reason);
	}

	let result: Result | PromiseLike<Result>;
	const previous = currentScope;
	currentScope = scope;
	try {
		result = work(scope);
	} catch (error) {
		scope.phase =
			scope.controller.signal.aborted || isInteractionCancellation(error) ? 'cancelled' : 'failed';
		releaseInteraction(owner, controller, controllers);
		throw error;
	} finally {
		currentScope = previous;
	}

	const execution = settleInteraction(scope, result);
	void execution.then(
		() => releaseInteraction(owner, controller, controllers),
		() => releaseInteraction(owner, controller, controllers)
	);
	parent?.settlements.add(execution);
	return execution;
}

function releaseInteraction(
	owner: ComponentInstance<any>,
	controller: AbortController,
	controllers: Set<AbortController>
): void {
	controllers!.delete(controller);
	if (!controllers!.size) controllersByOwner.delete(owner);
	scopeBySignal.delete(controller.signal);
}

/** Cancels every unsettled interaction owned by a component being disposed. */
export function cancelComponentInteractions(
	owner: ComponentInstance<any>,
	reason: unknown = 'component-disposed'
): void {
	const controllers = controllersByOwner.get(owner);
	if (!controllers) return;
	for (const controller of controllers) controller.abort(reason);
	controllersByOwner.delete(owner);
}

/** Reports whether a rejected value represents framework cancellation. */
export function isInteractionCancellation(error: unknown): error is InteractionCancellation {
	return error instanceof InteractionCancellation;
}

function settleInteraction<Result>(
	scope: InteractionScope,
	result: Result | PromiseLike<Result>
): Promise<Result> {
	const primary = Promise.resolve(result);
	scope.settlements.add(primary);
	scope.phase = 'settling';
	return new Promise<Result>((resolve, reject) => {
		const fail = (error: unknown) => {
			scope.controller.signal.removeEventListener('abort', cancel);
			scope.phase =
				scope.controller.signal.aborted || isInteractionCancellation(error)
					? 'cancelled'
					: 'failed';
			reject(error);
		};
		const cancel = () => fail(new InteractionCancellation(scope.controller.signal.reason));
		scope.controller.signal.addEventListener('abort', cancel, { once: true });
		primary.then((value) => {
			void settleJoinedWork(scope).then(() => {
				if (scope.controller.signal.aborted) {
					fail(new InteractionCancellation(scope.controller.signal.reason));
					return;
				}
				scope.controller.signal.removeEventListener('abort', cancel);
				scope.phase = 'succeeded';
				resolve(value);
			}, fail);
		}, fail);
	});
}

async function settleJoinedWork(scope: InteractionScope): Promise<void> {
	const observed = new Set<PromiseLike<unknown>>();
	while (true) {
		const pending = [...scope.settlements].filter((settlement) => !observed.has(settlement));
		if (!pending.length) return;
		for (const settlement of pending) observed.add(settlement);
		await raceCancellation(scope, Promise.all(pending));
	}
}

function raceCancellation<Result>(
	scope: InteractionScope,
	settlement: PromiseLike<Result>
): Promise<Result> {
	if (scope.controller.signal.aborted)
		return Promise.reject(new InteractionCancellation(scope.controller.signal.reason));
	return new Promise<Result>((resolve, reject) => {
		const cancel = () => reject(new InteractionCancellation(scope.controller.signal.reason));
		scope.controller.signal.addEventListener('abort', cancel, { once: true });
		Promise.resolve(settlement)
			.then(resolve, reject)
			.finally(() => {
				scope.controller.signal.removeEventListener('abort', cancel);
			});
	});
}

/**
 * Restores one compiler-lowered continuation to its interaction without
 * exposing a process-global async context. Resumptions are serialized because
 * resolving two awaited promises in the same microtask turn would otherwise
 * let one continuation observe the other's scope.
 */
function resumeInteraction(signal: AbortSignal, resume: () => void): void {
	const scope = scopeBySignal.get(signal);
	if (!scope) {
		resume();
		return;
	}
	pendingResumptions.push({ scope, resume });
	if (resumptionScheduled) return;
	resumptionScheduled = true;
	queueMicrotask(runNextInteractionResumption);
}

function runNextInteractionResumption(): void {
	const next = pendingResumptions.shift();
	if (!next) {
		resumptionScheduled = false;
		return;
	}
	const previous = currentScope;
	currentScope = next.scope;
	next.resume();
	// Promise resolution queues the authored async continuation before this
	// restoration job, keeping precisely that continuation in scope.
	queueMicrotask(() => {
		currentScope = previous;
		if (pendingResumptions.length) queueMicrotask(runNextInteractionResumption);
		else resumptionScheduled = false;
	});
}
