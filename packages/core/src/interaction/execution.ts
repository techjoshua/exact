import type { ComponentInstance } from '../component/contracts.js';
import {
	markComponentTrace,
	startComponentTrace,
	type ComponentTraceAttributes,
	type ComponentTraceSpan
} from '../component/performance-trace.js';
import {
	currentTaskFrameRecord,
	executeTaskFrame,
	taskFrameSynchronousError,
	type TaskFrameRecord
} from '../tasks/frame-runtime.js';
import { taskOwnerForHost } from '../tasks/owner-hosts.js';

/** Identifies the framework host that began an interaction task. */
export type InteractionSource = 'event' | 'form' | 'invoked' | 'navigation';

/** Scheduling class inherited by work attached to an interaction task. */
export type InteractionPriority = 'interactive' | 'normal' | 'deferred';

/** Diagnostic metadata associated with an interaction-root task frame. */
export type InteractionScope = {
	readonly id: number;
	readonly owner: ComponentInstance<any>;
	readonly source: InteractionSource;
	readonly priority: InteractionPriority;
	readonly generation: number;
};

let nextInteractionId = 1;
const interactionsByFrame = new WeakMap<TaskFrameRecord, InteractionScope>();
const interactionTraces = new WeakMap<InteractionScope, ComponentTraceSpan>();

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
	attributes?: ComponentTraceAttributes
): void {
	if (!interaction) return;
	markComponentTrace(interaction.owner, interactionTraces.get(interaction), phase, attributes);
}

/**
 * Executes a component interaction as a task-frame root.
 *
 * The frame exclusively owns cancellation, descendants, cleanup, continuation restoration, and
 * structural settlement. Interaction state exists only as inspection metadata associated with it.
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
	if (!taskOwner) throw new Error('Component interaction requires a registered task owner');
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
			const trace = startComponentTrace(owner, 'interaction', `interaction:${scope.id}`, {
				source,
				priority,
				generation
			});
			if (trace) interactionTraces.set(scope, trace);
			return work(scope);
		}
	);
	const synchronousError = taskFrameSynchronousError(execution);
	if (synchronousError) {
		traceInteractionPhase(interactionScope, 'settled', { outcome: 'error' });
		throw synchronousError.error;
	}
	if (interactionScope && interactionTraces.has(interactionScope)) {
		void execution.then(
			() => traceInteractionPhase(interactionScope, 'settled', { outcome: 'success' }),
			() => traceInteractionPhase(interactionScope, 'settled', { outcome: 'error' })
		);
	}
	return execution;
}
