import type { AnyComponentInstance } from '../component/contracts.js';
import {
	markComponentTrace,
	componentTraceStarter,
	type LazyComponentTraceAttributes,
	type ComponentTraceSpan,
	type ComponentTraceStarter
} from '../component/performance-trace.js';
import {
	currentTaskFrameRecord,
	executeTaskFrame,
	taskFrameSynchronousError,
	withDeferredTaskFrame,
	type TaskFrameRecord
} from '../tasks/frame-runtime.js';
import { taskOwnerForHost } from '../tasks/owner-hosts.js';

/** Identifies the framework host that began an interaction task. */
export type InteractionSource = 'event' | 'form' | 'invoked' | 'navigation';

/** Scheduling class inherited by work attached to an interaction task. */
export type InteractionPriority = 'interactive' | 'normal' | 'deferred';

/** Supplies a generation only when a direct compiled interaction needs a structural frame. */
export type DeferredInteractionGeneration = (owner: AnyComponentInstance) => number;

/** Diagnostic metadata associated with an interaction-root task frame. */
export type InteractionScope = {
	readonly id: number;
	readonly owner: AnyComponentInstance;
	readonly source: InteractionSource;
	readonly priority: InteractionPriority;
	readonly generation: number;
};

let nextInteractionId = 1;
const interactionsByFrame = new WeakMap<TaskFrameRecord, InteractionScope>();
let interactionTraces: WeakMap<InteractionScope, ComponentTraceSpan> | undefined;

/** Returns metadata for the synchronously active interaction-root task. */
export function currentInteraction(): InteractionScope | undefined {
	const frame = currentTaskFrameRecord();
	for (let candidate = frame; candidate; candidate = candidate.parent) {
		const interaction = interactionsByFrame.get(candidate);
		if (interaction) return interaction;
	}
	return undefined;
}

/** Emits a correlated performance mark for a currently executing interaction. */
export function traceInteractionPhase(
	interaction: InteractionScope | undefined,
	phase: string,
	attributes?: LazyComponentTraceAttributes
): void {
	if (!interaction) return;
	markComponentTrace(interaction.owner, interactionTraces?.get(interaction), phase, attributes);
}

/**
 * Executes a component interaction as a task-frame root.
 *
 * The frame exclusively owns cancellation, descendants, cleanup, continuation restoration, and
 * structural settlement. Interaction state exists only as inspection metadata associated with it.
 */
export function runComponentInteraction<Result>(
	owner: AnyComponentInstance,
	source: InteractionSource,
	generation: number,
	priority: InteractionPriority,
	controller: AbortController,
	work: (scope: InteractionScope) => Result | PromiseLike<Result>
): Promise<Result> {
	return executeComponentInteraction(owner, source, generation, priority, controller, true, work);
}

/**
 * Executes a compiler-owned DOM interaction without allocating diagnostic metadata when component
 * tracing is disabled. Structural task parenting and settlement still use the canonical frame.
 */
export function runCompiledComponentInteraction<Result>(
	owner: AnyComponentInstance,
	source: InteractionSource,
	generation: number,
	priority: InteractionPriority,
	controller: AbortController,
	work: () => Result | PromiseLike<Result>,
	onTraceScope?: (scope: InteractionScope) => void,
	trace?: ComponentTraceStarter | false
): Promise<Result> {
	return executeComponentInteraction(
		owner,
		source,
		generation,
		priority,
		controller,
		false,
		work,
		onTraceScope,
		trace
	);
}

/**
 * Executes a compiled interaction directly until task work requests a structural parent.
 * Trace-enabled builds retain the complete observable interaction contract from the start.
 */
export function runDirectCompiledComponentInteraction<Result>(
	owner: AnyComponentInstance,
	source: InteractionSource,
	generation: number | DeferredInteractionGeneration,
	priority: InteractionPriority,
	work: () => Result | PromiseLike<Result>,
	onTraceScope?: (scope: InteractionScope) => void,
	trace?: ComponentTraceStarter | false
): Result | PromiseLike<Result> {
	const startTrace = trace === undefined ? componentTraceStarter(owner) : trace;
	if (startTrace)
		return runCompiledComponentInteraction(
			owner,
			source,
			interactionGeneration(generation, owner),
			priority,
			new AbortController(),
			work,
			onTraceScope,
			startTrace
		);

	let frame: TaskFrameRecord | undefined;
	let execution: Promise<Result> | undefined;
	let resolveForeground: ((value: Result | PromiseLike<Result>) => void) | undefined;
	let rejectForeground: ((error: unknown) => void) | undefined;
	const materialize = (): TaskFrameRecord => {
		if (frame) return frame;
		const taskOwner = taskOwnerForHost(owner);
		if (!taskOwner) throw new Error('Component interaction requires a registered task owner');
		const foreground = new Promise<Result>((resolve, reject) => {
			resolveForeground = resolve;
			rejectForeground = reject;
		});
		execution = executeTaskFrame(
			{
				owner: taskOwner,
				generation: interactionGeneration(generation, owner),
				activation: 'interaction',
				label: `${source} interaction`,
				concurrency: 'latest',
				priority: priority === 'interactive' ? 'immediate' : priority,
				readiness: priority === 'deferred' ? 'nonblocking' : 'blocking',
				publicContext: false,
				detached: true
			},
			() => {
				frame = currentTaskFrameRecord()!;
				return foreground;
			}
		);
		return frame!;
	};

	let directResult: Result | PromiseLike<Result>;
	try {
		directResult = withDeferredTaskFrame(materialize, work);
	} catch (error) {
		if (execution) {
			rejectForeground!(error);
			void execution.catch(() => undefined);
		}
		throw error;
	}
	if (!execution) return directResult;
	resolveForeground!(directResult);
	return execution;
}

function interactionGeneration(
	generation: number | DeferredInteractionGeneration,
	owner: AnyComponentInstance
): number {
	return typeof generation === 'function' ? generation(owner) : generation;
}

function executeComponentInteraction<Result>(
	owner: AnyComponentInstance,
	source: InteractionSource,
	generation: number,
	priority: InteractionPriority,
	controller: AbortController,
	exposeScope: boolean,
	work:
		| ((scope: InteractionScope) => Result | PromiseLike<Result>)
		| (() => Result | PromiseLike<Result>),
	onTraceScope?: (scope: InteractionScope) => void,
	trace?: ComponentTraceStarter | false
): Promise<Result> {
	const taskOwner = taskOwnerForHost(owner);
	if (!taskOwner) throw new Error('Component interaction requires a registered task owner');
	const startTrace = trace === undefined ? componentTraceStarter(owner) : trace || undefined;
	let interactionScope: InteractionScope | undefined;
	const execution = executeTaskFrame(
		{
			owner: taskOwner,
			controller,
			generation,
			activation: 'interaction',
			label: `${source} interaction`,
			concurrency: 'latest',
			priority: priority === 'interactive' ? 'immediate' : priority,
			readiness: priority === 'deferred' ? 'nonblocking' : 'blocking',
			// Interaction hosts receive InteractionScope rather than the public task context.
			publicContext: false
		},
		() => {
			if (exposeScope || startTrace) {
				const frame = currentTaskFrameRecord()!;
				const scope: InteractionScope = Object.freeze({
					id: nextInteractionId++,
					owner,
					source,
					priority,
					generation
				});
				interactionScope = scope;
				interactionsByFrame.set(frame, scope);
				const trace = startTrace?.('interaction', `interaction:${scope.id}`, {
					source,
					priority,
					generation
				});
				if (trace) (interactionTraces ??= new WeakMap()).set(scope, trace);
				onTraceScope?.(scope);
				return (work as (scope: InteractionScope) => Result | PromiseLike<Result>)(scope);
			}
			return (work as () => Result | PromiseLike<Result>)();
		}
	);
	const synchronousError = taskFrameSynchronousError(execution);
	if (synchronousError) {
		if (interactionScope && interactionTraces?.has(interactionScope))
			finishInteractionTrace(interactionScope, 'error');
		throw synchronousError.error;
	}
	if (interactionScope && interactionTraces?.has(interactionScope)) {
		void execution.then(
			() => finishInteractionTrace(interactionScope!, 'success'),
			() => finishInteractionTrace(interactionScope!, 'error')
		);
	}
	return execution;
}

function finishInteractionTrace(interaction: InteractionScope, outcome: 'success' | 'error'): void {
	traceInteractionPhase(interaction, 'settled', { outcome });
	interactionTraces?.delete(interaction);
}
