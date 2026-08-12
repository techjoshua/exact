import { setScheduledWorkContextCapture, type ScheduledWorkContext } from '@exactjs/reactive';
import type { TaskContext, TaskOwner } from './contracts.js';
import { raceTaskCancellation, TaskCancellation } from './cancellation.js';
import {
	registerTaskFrameSignal,
	releaseTaskFrameSignal,
	resumeTaskFrameContinuation
} from './frame-continuation.js';
import { createTaskFrameContext, frameForTaskContext } from './frame-context.js';
import { publishTaskFrameEvent, taskFrameInspectionAttached } from './frame-inspection.js';
import {
	registerTaskFrameSettlement,
	runTaskFrameCleanups,
	settleTaskFrameChildren
} from './frame-settlement.js';
import { createLazyTaskOwnerRecord } from './owner-record.js';
import { acquireScheduledReactionBatch } from './scheduled-reactions.js';

import {
	taskFrameTokenBrand,
	taskOwnerBrand,
	type InternalTaskFrameOptions,
	type TaskFrameCleanup,
	type TaskFrameRecord,
	type TaskOwnerRecord
} from './frame-contracts.js';
export type {
	InternalTaskFrameOptions,
	TaskActivationRegistration,
	TaskFrameRecord,
	TaskOwnerRecord
} from './frame-contracts.js';
let nextFrameId = 1;
let currentFrame: TaskFrameRecord | undefined;
let currentOwner: TaskOwnerRecord | undefined;
const synchronousFrameErrors = new WeakMap<Promise<unknown>, { readonly error: unknown }>();

/** Creates a durable task owner and its cancellation lifetime. */
export function createTaskOwnerRecord(label?: string): TaskOwnerRecord {
	return createLazyTaskOwnerRecord(label);
}

/** Retains setup-owned cleanup until its durable task owner is disposed. */
export function registerTaskOwnerCleanup(owner: TaskOwnerRecord, cleanup: TaskFrameCleanup): void {
	if (owner.disposed) throw new Error('Task owner has been disposed');
	owner.ownerCleanups.add(cleanup);
}

/** Validates and returns the internal representation of a public owner. */
export function taskOwnerRecord(owner: TaskOwner): TaskOwnerRecord {
	if (!(taskOwnerBrand in owner)) throw new TypeError('Task owner was not created by eXact');
	return owner as TaskOwnerRecord;
}

/** Returns the frame active for the current synchronous execution segment. */
export function currentTaskFrameRecord(): TaskFrameRecord | undefined {
	return currentFrame;
}

/** Returns the durable owner supplied by the current framework host. */
export function currentTaskOwnerRecord(): TaskOwnerRecord | undefined {
	return currentFrame?.owner ?? currentOwner;
}

/** Establishes a durable host owner during component state-machine construction or adapter setup. */
export function withTaskOwnerRecord<T>(owner: TaskOwnerRecord, work: () => T): T {
	const previous = currentOwner;
	currentOwner = owner;
	try {
		return work();
	} finally {
		currentOwner = previous;
	}
}

/** Runs a synchronous segment with one frame as ambient context. */
export function withTaskFrameRecord<T>(frame: TaskFrameRecord, work: () => T): T {
	if (frame.settled) throw new Error('Cannot resume a settled task frame');
	const previous = currentFrame;
	currentFrame = frame;
	try {
		return work();
	} finally {
		currentFrame = previous;
	}
}

/**
 * Runs work in a frame, then waits for dynamically attached descendants and
 * executes cleanup in last-in-first-out order.
 */
export function executeTaskFrame<T>(
	options: InternalTaskFrameOptions,
	work: (context: TaskContext) => T | PromiseLike<T>
): Promise<T> {
	const structuralParent = options.detached ? undefined : (options.parent ?? currentFrame);
	if (
		structuralParent &&
		!options.parentReserved &&
		(!structuralParent.producerOpen || structuralParent.settled)
	)
		return Promise.reject(
			new Error('Cannot attach work after the parent task producer has closed')
		);
	const owner =
		options.owner ?? structuralParent?.owner ?? createTaskOwnerRecord('implicit task invocation');
	if (owner.disposed) return Promise.reject(new Error('Task owner has been disposed'));
	const controller = options.controller ?? new AbortController();
	linkAbort(owner.signal, controller);
	if (structuralParent) linkAbort(structuralParent.controller.signal, controller);

	let resolveSettlement!: () => void;
	let rejectSettlement!: (error: unknown) => void;
	const settlement = new Promise<void>((resolve, reject) => {
		resolveSettlement = resolve;
		rejectSettlement = reject;
	});
	const frame: TaskFrameRecord = {
		[taskFrameTokenBrand]: true as const,
		id: nextFrameId++,
		owner,
		parent: structuralParent,
		controller,
		...(options.label === undefined ? {} : { label: options.label }),
		...(options.sourceEntityId === undefined ? {} : { sourceEntityId: options.sourceEntityId }),
		activation: options.activation ?? 'invoked',
		generation: options.generation ?? 1,
		placement: options.placement ?? 'current',
		concurrency: options.concurrency ?? 'parallel',
		priority: options.priority ?? structuralParent?.priority ?? 'normal',
		readiness:
			options.readiness ??
			(options.priority === 'deferred'
				? 'nonblocking'
				: (structuralParent?.readiness ?? 'blocking')),
		kind: options.kind ?? 'task',
		producerOpen: true,
		settled: false,
		startedAt: monotonicTimestamp()
	};
	if (options.publicContext !== false)
		(frame as { context: TaskContext }).context = createTaskFrameContext(frame, options);
	registerTaskFrameSignal(controller.signal, frame);
	registerTaskFrameSettlement(frame, settlement);
	owner.frames.add(frame);
	const inspectedAtStart = taskFrameInspectionAttached(frame);
	if (inspectedAtStart) {
		publishTaskFrameEvent(frame, 'task.frame.enter');
		publishTaskFrameEvent(frame, 'task.start', undefined, {
			kind: 'start',
			arguments: options.inspectionArguments
		});
	} else uninspectedSynchronousFrames.add(frame);
	if (structuralParent) {
		(structuralParent.children ??= new Set()).add(settlement);
		void settlement
			.finally(() => structuralParent.children?.delete(settlement))
			.catch(() => undefined);
	} else {
		// Root settlement is observed through executeTaskFrame's returned
		// promise; the internal structural signal has no parent consumer.
		void settlement.catch(() => undefined);
	}

	let directResult: T | PromiseLike<T>;
	let synchronousError: unknown;
	try {
		if (controller.signal.aborted) throw new TaskCancellation(controller.signal.reason);
		directResult = withTaskFrameRecord(frame, () => work(frame.context!));
	} catch (error) {
		synchronousError = error;
		directResult = Promise.reject(error);
	} finally {
		uninspectedSynchronousFrames.delete(frame);
	}
	const execution = raceTaskCancellation(controller.signal, directResult);

	const result = execution.then(
		async (value) => {
			frame.producerOpen = false;
			publishTaskFrameEvent(frame, 'task.foreground-settle');
			let structuralError: unknown;
			let structuralFailed = false;
			try {
				await settleTaskFrameChildren(frame);
			} catch (error) {
				structuralError = error;
				structuralFailed = true;
			}
			try {
				await runTaskFrameCleanups(frame);
			} catch (cleanupError) {
				if (!structuralFailed) throw cleanupError;
				if (structuralError && typeof structuralError === 'object')
					Object.defineProperty(structuralError, 'suppressed', {
						configurable: true,
						value: [cleanupError]
					});
			}
			if (controller.signal.aborted) throw new TaskCancellation(controller.signal.reason);
			if (structuralFailed) throw structuralError;
			return value;
		},
		async (error) => {
			const outcomeError =
				controller.signal.aborted && !(error instanceof TaskCancellation)
					? new TaskCancellation(controller.signal.reason)
					: error;
			frame.producerOpen = false;
			publishTaskFrameEvent(frame, 'task.foreground-settle');
			controller.abort(error);
			let childError: unknown;
			let childFailed = false;
			try {
				await settleTaskFrameChildren(frame);
			} catch (error) {
				childError = error;
				childFailed = true;
			}
			try {
				await runTaskFrameCleanups(frame);
			} catch (cleanupError) {
				if (outcomeError && typeof outcomeError === 'object')
					Object.defineProperty(outcomeError, 'suppressed', {
						configurable: true,
						value: [cleanupError]
					});
			}
			if (outcomeError === undefined && childFailed) throw childError;
			throw outcomeError;
		}
	);
	const output = result.then(
		(value) => {
			frame.settled = true;
			releaseTaskFrameSignal(controller.signal);
			owner.frames.delete(frame);
			resolveSettlement();
			publishTaskFrameEvent(frame, 'task.frame.exit');
			publishTaskFrameEvent(frame, 'task.structural-settle');
			publishTaskFrameEvent(frame, 'task.settle', undefined, {
				kind: 'outcome',
				status: 'settled',
				value
			});
			return value;
		},
		(error) => {
			frame.settled = true;
			releaseTaskFrameSignal(controller.signal);
			owner.frames.delete(frame);
			if (options.propagateFailure?.() === false) resolveSettlement();
			else rejectSettlement(error);
			publishTaskFrameEvent(frame, 'task.frame.exit');
			const cancelled = error instanceof TaskCancellation;
			publishTaskFrameEvent(frame, cancelled ? 'task.cancel' : 'task.fail', error, {
				kind: 'outcome',
				status: cancelled ? 'cancelled' : 'failed',
				value: error
			});
			throw error;
		}
	);
	if (synchronousError !== undefined) {
		synchronousFrameErrors.set(output, { error: synchronousError });
		// Callers that preserve a synchronous host contract rethrow this error
		// immediately. The frame still settles asynchronously to release ownership.
		void output.catch(() => undefined);
	}
	return output;
}

/** Returns an error thrown before a task frame's producer yielded to asynchronous work. */
export function taskFrameSynchronousError(
	execution: PromiseLike<unknown>
): { readonly error: unknown } | undefined {
	return execution instanceof Promise ? synchronousFrameErrors.get(execution) : undefined;
}

/** Adds a structural contribution to a frame before its producer closes. */
export function attachTaskFrameSettlement(
	frame: TaskFrameRecord,
	settlement: PromiseLike<unknown>
): void {
	if (frame.settled || !frame.producerOpen)
		throw new Error('Cannot attach work after the task frame producer has closed');
	const normalized = Promise.resolve(settlement).then(() => undefined);
	(frame.children ??= new Set()).add(normalized);
	void normalized.finally(() => frame.children?.delete(normalized)).catch(() => undefined);
}

/** Adds structural work to the synchronously active task frame, when present. */
export function joinTask(settlement: PromiseLike<unknown>): void {
	const frame = currentTaskFrameRecord();
	if (frame) attachTaskFrameSettlement(frame, settlement);
}

/** Publishes a task-owned mutation only while its generation remains current. */
export function taskMutation<Result>(signal: AbortSignal, mutation: () => Result): Result {
	if (signal.aborted) throw new TaskCancellation(signal.reason);
	return mutation();
}

/** Restores the owning task frame around one compiler-lowered async continuation. */
export function resumeTaskFrame(signal: AbortSignal, resume: () => void): void {
	resumeTaskFrameContinuation(signal, resume, (frame) => {
		if (frame.settled) throw new Error('Cannot resume a settled task frame');
		const previous = currentFrame;
		currentFrame = frame;
		return () => {
			currentFrame = previous;
		};
	});
}

export { frameForTaskContext };
const interactiveReactionContexts = new WeakMap<TaskFrameRecord, ScheduledWorkContext>();
const uninspectedSynchronousFrames = new WeakSet<TaskFrameRecord>();

function linkAbort(signal: AbortSignal, target: AbortController): void {
	if (signal.aborted) {
		target.abort(signal.reason);
		return;
	}
	signal.addEventListener('abort', () => target.abort(signal.reason), { once: true });
}

function monotonicTimestamp(): number {
	return globalThis.performance?.now() ?? Date.now();
}

/** Allocates one process-local frame identity for internal consequence frames. */
export function allocateTaskFrameId(): number {
	return nextFrameId++;
}

setScheduledWorkContextCapture((priority) => {
	const parent = currentTaskFrameRecord();
	if (!parent || !parent.producerOpen || parent.settled) return undefined;
	if (priority === 'interactive' && uninspectedSynchronousFrames.has(parent))
		return interactiveReactionContext(parent);
	return acquireScheduledReactionBatch(parent);
});

/** Reuses an open interaction producer for consequences drained inside the same DOM callback. */
function interactiveReactionContext(parent: TaskFrameRecord): ScheduledWorkContext {
	let context = interactiveReactionContexts.get(parent);
	if (context) return context;
	context = {
		run: (work) => withTaskFrameRecord(parent, work),
		cancel() {}
	};
	interactiveReactionContexts.set(parent, context);
	return context;
}
