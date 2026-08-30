import { publishExactProfile, type ExactProfileSink } from '@exactjs/instrumentation';
import { profileTimestamp } from '@exactjs/instrumentation';
import type {
	EffectScope,
	EffectScopeImpl,
	Reaction,
	ReactiveProfileEvent,
	WorkPriority
} from './types.js';

type QueuedComputation = {
	priority: WorkPriority;
	onError?: (error: unknown) => void;
	scope?: EffectScopeImpl;
};

/** Opaque ownership captured when reactive work is invalidated. */
export type ScheduledWorkContext = {
	run(work: () => void): void;
	cancel(): void;
};

type QueuedReaction = {
	priority: WorkPriority;
	context?: ScheduledWorkContext;
};

const queuedReactions = new Map<Reaction, QueuedReaction>();
const queuedComputations = new Map<() => void, QueuedComputation>();
const priorityStack: WorkPriority[] = [];
let foregroundFlushScheduled = false;
let deferredFlushScheduled = false;
let consecutiveForegroundFlushes = 0;

const maxFlushPasses = 1_000;
const maxForegroundFlushesBeforeDeferred = 8;
const priorityOrder: Record<WorkPriority, number> = {
	interactive: 0,
	normal: 1,
	deferred: 2
};
let captureScheduledWorkContext:
	| ((priority: WorkPriority) => ScheduledWorkContext | undefined)
	| undefined;
const settlementCallbacks = new Set<() => void>();
let settlementScheduled = false;
let settling = false;

/** Queues one coalesced callback for the first stable point after reactive work drains. */
export function requestSchedulerSettlement(callback: () => void): void {
	settlementCallbacks.add(callback);
	if (settlementScheduled) return;
	settlementScheduled = true;
	queueMicrotask(settleScheduler);
}

/** Installs framework ownership capture for subsequently scheduled reactive work. */
export function setScheduledWorkContextCapture(
	capture: ((priority: WorkPriority) => ScheduledWorkContext | undefined) | undefined
): void {
	captureScheduledWorkContext = capture;
}

/** Queues a reaction to run during the next scheduler flush. */
export function queueReaction(
	reaction: Reaction,
	priority: WorkPriority = currentWorkPriority()
): void {
	priority = constrainedPriority(reaction.scope, priority);
	const previous = queuedReactions.get(reaction);
	const context = captureScheduledWorkContext?.(priority);
	if (context) previous?.context?.cancel();
	if (!previous || isHigherWorkPriority(priority, previous.priority) || context)
		queuedReactions.set(reaction, {
			priority:
				previous && !isHigherWorkPriority(priority, previous.priority)
					? previous.priority
					: priority,
			context: context ?? previous?.context
		});
	scheduleFlush(priority);
}

/** Queues an arbitrary computation to run before reactions during the next flush. */
export function queueComputation(
	computation: () => void,
	onError?: (error: unknown) => void,
	priority: WorkPriority = currentWorkPriority(),
	scope?: EffectScope
): void {
	priority = constrainedPriority(scope as EffectScopeImpl | undefined, priority);
	const previous = queuedComputations.get(computation);
	if (!previous || isHigherWorkPriority(priority, previous.priority)) {
		queuedComputations.set(computation, {
			priority,
			onError: onError ?? previous?.onError,
			scope: (scope as EffectScopeImpl | undefined) ?? previous?.scope
		});
	}
	scheduleFlush(priority);
}

/** Removes a computation that was queued but has already been run synchronously. */
export function removeQueuedComputation(computation: () => void): void {
	queuedComputations.delete(computation);
}

/**
 * Releases every scheduler entry owned directly by a stopped scope.
 *
 * Paused work is deliberately ineligible for ordinary draining, so scope teardown must remove it
 * explicitly rather than relying on a later flush to observe that the scope is inactive.
 */
export function discardScheduledScopeWork(scope: EffectScopeImpl): void {
	for (const reaction of queuedReactions.keys()) {
		if (reaction.scope === scope) {
			queuedReactions.get(reaction)?.context?.cancel();
			queuedReactions.delete(reaction);
		}
	}
	for (const [computation, queued] of queuedComputations) {
		if (queued.scope === scope) queuedComputations.delete(computation);
	}
}

/** Returns the priority inherited by work scheduled in the current synchronous execution scope. */
export function currentWorkPriority(): WorkPriority {
	return priorityStack[priorityStack.length - 1] ?? 'normal';
}

/** Returns a read-only snapshot of queued scheduler work for framework tests and tooling. */
export function inspectScheduledWork(): Readonly<{
	currentPriority: WorkPriority;
	computations: Readonly<Record<WorkPriority, number>>;
	reactions: Readonly<Record<WorkPriority, number>>;
}> {
	const computations = { interactive: 0, normal: 0, deferred: 0 };
	const reactions = { interactive: 0, normal: 0, deferred: 0 };
	for (const queued of queuedComputations.values()) computations[queued.priority]++;
	for (const queued of queuedReactions.values()) reactions[queued.priority]++;
	return Object.freeze({
		currentPriority: currentWorkPriority(),
		computations: Object.freeze(computations),
		reactions: Object.freeze(reactions)
	});
}

/** Runs synchronous work so its reactive invalidations inherit the requested priority. */
export function runWithPriority<T>(priority: WorkPriority, work: () => T): T {
	priorityStack.push(priority);
	try {
		return work();
	} finally {
		priorityStack.pop();
	}
}

/** Schedules framework-owned computation work at an explicit priority. */
export function scheduleWork(
	work: () => void,
	priority: WorkPriority = currentWorkPriority(),
	onError?: (error: unknown) => void,
	scope?: EffectScope
): void {
	queueComputation(work, onError, priority, scope);
}

/** Reschedules queued work whose owning scopes may just have become runnable. */
export function resumeScheduledWork(): void {
	scheduleRemainingWork();
}

/**
 * Drains pending work through a priority until the eligible scheduler reaches a stable state.
 *
 * The default drains every priority for deterministic SSR, testing, and explicit synchronous
 * rendering. Passing `normal` leaves deferred work queued for its host turn.
 */
export function flushSync(through: WorkPriority = 'deferred'): void {
	// Computations run before reactions so derived values settle before render/watch effects observe them.
	let passes = 0;
	let firstError: unknown;
	let hasError = false;
	let profileStarted: number | undefined;
	const profiledReactions = new Map<ExactProfileSink<ReactiveProfileEvent>, number>();
	try {
		while (hasEligibleWork(through)) {
			if (++passes > maxFlushPasses) {
				const overflow = new Error(
					'eXact reactive scheduler exceeded its flush limit; a reaction is repeatedly invalidating itself'
				);
				if (settleOverflow(overflow)) return;
				throw overflow;
			}
			while (hasEligibleComputations(through)) {
				if (++passes > maxFlushPasses) {
					const overflow = new Error(
						'eXact reactive scheduler exceeded its flush limit; a computation is repeatedly invalidating itself'
					);
					if (settleOverflow(overflow)) return;
					throw overflow;
				}
				const computations = takeEligibleComputations(through);
				for (const [computation, queued] of computations) {
					if (queued.scope && !queued.scope.active) continue;
					try {
						runWithPriority(queued.priority, computation);
					} catch (error) {
						if (queued.onError) {
							try {
								queued.onError(error);
							} catch (handlerError) {
								if (!hasError) firstError = handlerError;
								hasError = true;
							}
						} else {
							if (!hasError) firstError = error;
							hasError = true;
						}
					}
				}
			}

			const reactions = takeEligibleReactions(through);

			for (const [reaction, queued] of reactions) {
				if (
					!reaction.active ||
					(reaction.scope && (!reaction.scope.active || reaction.scope.paused))
				) {
					queued.context?.cancel();
					continue;
				}
				const profile = reaction.scope?.onProfile;
				if (profile) {
					profileStarted ??= profileTimestamp();
					profiledReactions.set(profile, (profiledReactions.get(profile) ?? 0) + 1);
				}
				try {
					if (queued.context)
						queued.context.run(() => runReactionWithPriority(queued.priority, reaction));
					else runReactionWithPriority(queued.priority, reaction);
				} catch (error) {
					if (!hasError) firstError = error;
					hasError = true;
				}
			}
		}
	} finally {
		if (through === 'deferred') {
			foregroundFlushScheduled = false;
			deferredFlushScheduled = false;
		} else {
			foregroundFlushScheduled = false;
		}
		// Errors must not leave work queued without a corresponding microtask.
		// Overflow deliberately clears both queues above; ordinary failures may
		// have queued new work while their error was being handled.
		scheduleRemainingWork();
		if (!hasEligibleWork('deferred')) settleScheduler();
		if (profileStarted !== undefined) {
			for (const [sink, reactions] of profiledReactions) {
				publishExactProfile(
					sink,
					Object.freeze({
						subsystem: 'reactive',
						phase: 'flush',
						elapsedMs: profileTimestamp() - profileStarted,
						counts: Object.freeze({ passes, reactions })
					})
				);
			}
		}
	}
	if (hasError) throw firstError;
}

function runReactionWithPriority(priority: WorkPriority, reaction: Reaction): void {
	priorityStack.push(priority);
	try {
		reaction.run();
	} finally {
		priorityStack.pop();
	}
}

/** Publishes one stable settlement generation without admitting recursive reconciliation. */
function settleScheduler(): void {
	if (settling || hasEligibleWork('deferred')) return;
	settlementScheduled = false;
	if (!settlementCallbacks.size) return;
	const callbacks = [...settlementCallbacks];
	settlementCallbacks.clear();
	settling = true;
	try {
		for (const callback of callbacks) callback();
	} finally {
		settling = false;
		if (settlementCallbacks.size && !settlementScheduled) {
			settlementScheduled = true;
			queueMicrotask(settleScheduler);
		}
	}
}

/** Clears a runaway generation and reports it once to each owning scope. */
function settleOverflow(error: Error): boolean {
	const handlers = new Set<(error: unknown) => void>();
	for (const queued of queuedComputations.values())
		if (queued.onError) handlers.add(queued.onError);
	for (const [reaction, queued] of queuedReactions) {
		reaction.scheduled = false;
		reaction.pendingPriority = undefined;
		queued.context?.cancel();
		if (reaction.scope?.onError) handlers.add(reaction.scope.onError);
	}
	queuedComputations.clear();
	queuedReactions.clear();
	if (!handlers.size) return false;
	let firstError: unknown;
	let failed = false;
	for (const handler of handlers) {
		try {
			handler(error);
		} catch (handlerError) {
			if (!failed) firstError = handlerError;
			failed = true;
		}
	}
	if (failed) throw firstError;
	return true;
}

function scheduleFlush(priority: WorkPriority): void {
	if (priority === 'deferred') {
		if (foregroundFlushScheduled || deferredFlushScheduled) return;
		deferredFlushScheduled = true;
		scheduleDeferredFlush(() => {
			deferredFlushScheduled = false;
			consecutiveForegroundFlushes = 0;
			flushSync();
		});
		return;
	}
	if (foregroundFlushScheduled) return;
	foregroundFlushScheduled = true;
	queueMicrotask(() => {
		foregroundFlushScheduled = false;
		const drainDeferred =
			hasQueuedPriority('deferred') &&
			++consecutiveForegroundFlushes >= maxForegroundFlushesBeforeDeferred;
		if (drainDeferred) consecutiveForegroundFlushes = 0;
		flushSync(drainDeferred ? 'deferred' : 'normal');
	});
}

function scheduleRemainingWork(): void {
	const priority = highestQueuedPriority();
	if (priority) scheduleFlush(priority);
}

function highestQueuedPriority(): WorkPriority | undefined {
	let selected: WorkPriority | undefined;
	for (const [reaction, queued] of queuedReactions) {
		if (reaction.scope?.paused) continue;
		if (!selected || isHigherWorkPriority(queued.priority, selected)) selected = queued.priority;
	}
	for (const queued of queuedComputations.values()) {
		if (queued.scope?.paused) continue;
		if (!selected || isHigherWorkPriority(queued.priority, selected)) selected = queued.priority;
	}
	return selected;
}

function hasEligibleWork(through: WorkPriority): boolean {
	return hasEligibleComputations(through) || hasEligibleReactions(through);
}

function hasEligibleComputations(through: WorkPriority): boolean {
	for (const queued of queuedComputations.values()) {
		if (queued.scope?.paused) continue;
		if (isEligible(queued.priority, through)) return true;
	}
	return false;
}

function hasEligibleReactions(through: WorkPriority): boolean {
	for (const [reaction, queued] of queuedReactions) {
		if (reaction.scope?.paused) continue;
		if (isEligible(queued.priority, through)) return true;
	}
	return false;
}

function hasQueuedPriority(priority: WorkPriority): boolean {
	for (const [reaction, queued] of queuedReactions)
		if (!reaction.scope?.paused && queued.priority === priority) return true;
	for (const queued of queuedComputations.values())
		if (!queued.scope?.paused && queued.priority === priority) return true;
	return false;
}

function takeEligibleComputations(through: WorkPriority): Array<[() => void, QueuedComputation]> {
	const selected: Array<[() => void, QueuedComputation]> = [];
	for (const [computation, queued] of queuedComputations) {
		if (queued.scope?.paused) continue;
		if (!isEligible(queued.priority, through)) continue;
		queuedComputations.delete(computation);
		selected.push([computation, queued]);
	}
	selected.sort(
		(left, right) => priorityOrder[left[1].priority] - priorityOrder[right[1].priority]
	);
	return selected;
}

function takeEligibleReactions(through: WorkPriority): Array<[Reaction, QueuedReaction]> {
	const selected: Array<[Reaction, QueuedReaction]> = [];
	for (const [reaction, queued] of queuedReactions) {
		if (reaction.scope?.paused) continue;
		if (!isEligible(queued.priority, through)) continue;
		queuedReactions.delete(reaction);
		selected.push([reaction, queued]);
	}
	selected.sort(
		(left, right) =>
			priorityOrder[left[1].priority] - priorityOrder[right[1].priority] ||
			(left[0].order ?? 1) - (right[0].order ?? 1)
	);
	return selected;
}

function isEligible(priority: WorkPriority, through: WorkPriority): boolean {
	return priorityOrder[priority] <= priorityOrder[through];
}

/** Reports whether candidate should run before current. */
export function isHigherWorkPriority(candidate: WorkPriority, current: WorkPriority): boolean {
	return priorityOrder[candidate] < priorityOrder[current];
}

function constrainedPriority(
	scope: EffectScopeImpl | undefined,
	requested: WorkPriority
): WorkPriority {
	let resolved = requested;
	for (let cursor = scope; cursor; cursor = cursor.parent) {
		if (cursor.workPriority && isHigherWorkPriority(resolved, cursor.workPriority))
			resolved = cursor.workPriority;
	}
	return resolved;
}

function scheduleDeferredFlush(flush: () => void): void {
	setTimeout(flush, 0);
}
