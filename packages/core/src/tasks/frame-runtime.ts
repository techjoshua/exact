import { sharedTaskRuntimeState } from './runtime-state.js';
import { attachSuppressedCleanupFailure } from '../cleanup.js';
import { withTaskPropertyMutationCapture } from './property-mutations.js';
import { registerTaskResourceOwner } from './resource-lifetime.js';
import {
	setScheduledWorkContextCapture,
	type ScheduledWorkContext
} from '@exactjs/reactive/framework/runtime';
import type { TaskContext, TaskOwner } from './contracts.js';
import {
	linkTaskAbort,
	raceTaskCancellation,
	TaskCancellation,
	isTaskCancellation
} from './cancellation.js';
import {
	frameForTaskSignal,
	registerTaskFrameSignal,
	releaseTaskFrameSignal,
	resumeTaskFrameContinuation
} from './frame-continuation.js';
import { createTaskFrameContext, frameForTaskContext } from './frame-context.js';
import {
	publishTaskFrameEvent,
	taskFrameInspectionAttached
} from './frame-inspection-capability.js';
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
/** Synchronous ownership is shared across compatible providers. Explicit frame scopes restore it before promises continue. */
const ambient = sharedTaskRuntimeState('ambient-frame-context', () => ({
	nextFrameId: 1,
	currentFrame: undefined as TaskFrameRecord | undefined,
	currentOwner: undefined as TaskOwnerRecord | undefined,
	deferredFrameMaterializer: undefined as (() => TaskFrameRecord) | undefined
}));
let scheduledWorkCaptureInstalled = false;
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
	return ambient.currentFrame;
}

/** Materializes an interaction frame only when synchronous work requests structural ownership. */
export function materializeDeferredTaskFrame(): TaskFrameRecord | undefined {
	return ambient.deferredFrameMaterializer?.();
}

/** Installs the lazy structural parent available to task and navigation operations during work. */
export function withDeferredTaskFrame<T>(materialize: () => TaskFrameRecord, work: () => T): T {
	const previous = ambient.deferredFrameMaterializer;
	ambient.deferredFrameMaterializer = materialize;
	try {
		return work();
	} finally {
		ambient.deferredFrameMaterializer = previous;
	}
}

/** Returns the durable owner supplied by the current framework host. */
export function currentTaskOwnerRecord(): TaskOwnerRecord | undefined {
	return ambient.currentFrame?.owner ?? ambient.currentOwner;
}

/** Establishes a durable host owner during component state-machine construction or adapter setup. */
export function withTaskOwnerRecord<T>(owner: TaskOwnerRecord, work: () => T): T {
	const previous = ambient.currentOwner;
	ambient.currentOwner = owner;
	try {
		return work();
	} finally {
		ambient.currentOwner = previous;
	}
}

/** Runs a synchronous segment with the supplied frame, or clears ambient frame ownership. */
export function withTaskFrameRecord<T>(frame: TaskFrameRecord | undefined, work: () => T): T {
	if (frame?.settled) throw new Error('Cannot resume a settled task frame');
	ensureScheduledWorkContextCapture();
	const previous = ambient.currentFrame;
	const previousMaterializer = ambient.deferredFrameMaterializer;
	ambient.currentFrame = frame;
	if (!frame) ambient.deferredFrameMaterializer = undefined;
	try {
		return work();
	} finally {
		ambient.currentFrame = previous;
		ambient.deferredFrameMaterializer = previousMaterializer;
	}
}

/** Runs a synchronous resource callback in its generation and restores unrelated ambient ownership. */
export function withTaskFrameForSignal<T>(signal: AbortSignal, work: () => T): T {
	const frame = frameForTaskSignal(signal);
	return withTaskFrameRecord(frame && !frame.settled ? frame : undefined, work);
}

/**
 * Runs work in a frame, then waits for dynamically attached descendants and
 * executes cleanup in last-in-first-out order.
 */
export function executeTaskFrame<T>(
	options: InternalTaskFrameOptions,
	work: (context: TaskContext) => T | PromiseLike<T>
): Promise<T> {
	const structuralParent = options.detached ? undefined : (options.parent ?? ambient.currentFrame);
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
	if (owner.disposed) {
		options.controller?.abort('task-owner-disposed');
		return Promise.reject(
			new TaskCancellation(
				options.controller ? options.controller.signal.reason : 'task-owner-disposed'
			)
		);
	}
	const controller = options.controller ?? new AbortController();
	// The owner cancels its active frame controllers directly during disposal. Subscribing every
	// frame to its durable signal would retain settled controllers until the owner itself is released.
	const releaseParent =
		structuralParent && linkTaskAbort(structuralParent.controller.signal, controller);

	let resolveSettlement!: () => void;
	let rejectSettlement!: (error: unknown) => void;
	const settlement = new Promise<void>((resolve, reject) => {
		resolveSettlement = resolve;
		rejectSettlement = reject;
	});
	const frame: TaskFrameRecord = {
		[taskFrameTokenBrand]: true as const,
		id: ambient.nextFrameId++,
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
	registerTaskResourceOwner(controller.signal);
	owner.registerSignal?.(controller.signal);
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
	let synchronousError: { readonly error: unknown } | undefined;
	try {
		if (controller.signal.aborted) throw new TaskCancellation(controller.signal.reason);
		directResult = withTaskFrameRecord(frame, () => work(frame.context!));
	} catch (error) {
		synchronousError = { error };
		directResult = Promise.reject(error);
	} finally {
		uninspectedSynchronousFrames.delete(frame);
	}
	const execution = raceTaskCancellation(controller.signal, directResult);

	const result = execution.then(
		(value) => settleTaskFrame(frame, false, value),
		(error) =>
			settleTaskFrame(
				frame,
				true,
				controller.signal.aborted && !isTaskCancellation(error)
					? new TaskCancellation(controller.signal.reason)
					: error
			)
	);
	const output = result.then(
		(value) => {
			frame.settled = true;
			releaseParent?.();
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
			releaseParent?.();
			releaseTaskFrameSignal(controller.signal);
			owner.frames.delete(frame);
			if (options.propagateFailure?.() === false) resolveSettlement();
			else rejectSettlement(error);
			publishTaskFrameEvent(frame, 'task.frame.exit');
			const cancelled = isTaskCancellation(error);
			publishTaskFrameEvent(frame, cancelled ? 'task.cancel' : 'task.fail', error, {
				kind: 'outcome',
				status: cancelled ? 'cancelled' : 'failed',
				value: error
			});
			throw error;
		}
	);
	if (synchronousError !== undefined) {
		synchronousFrameErrors.set(output, synchronousError);
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
	const frame = currentTaskFrameRecord() ?? materializeDeferredTaskFrame();
	if (frame) attachTaskFrameSettlement(frame, settlement);
}

/** Publishes a task-owned mutation only while its generation remains current. */
export function taskMutation<Result>(signal: AbortSignal, mutation: () => Result): Result {
	if (signal.aborted) throw new TaskCancellation(signal.reason);
	return withTaskPropertyMutationCapture(signal, mutation);
}

/** Restores the owning task frame around one compiler-lowered async continuation. */
export function resumeTaskFrame(signal: AbortSignal, resume: () => void): void {
	resumeTaskFrameContinuation(signal, resume, (frame) => {
		const previous = ambient.currentFrame;
		const previousMaterializer = ambient.deferredFrameMaterializer;
		ambient.currentFrame = frame;
		if (!frame) ambient.deferredFrameMaterializer = undefined;
		return () => {
			ambient.currentFrame = previous;
			ambient.deferredFrameMaterializer = previousMaterializer;
		};
	});
}

export { frameForTaskContext };
const interactiveReactionContexts = new WeakMap<TaskFrameRecord, ScheduledWorkContext>();
const uninspectedSynchronousFrames = new WeakSet<TaskFrameRecord>();

/** Drains descendants and cleanup once, preserving a producer or child failure before cleanup diagnostics. */
function settleTaskFrame(frame: TaskFrameRecord, failed: true, error: unknown): Promise<never>;
function settleTaskFrame<Result>(
	frame: TaskFrameRecord,
	failed: false,
	value: Result
): Promise<Result>;
async function settleTaskFrame<Result>(
	frame: TaskFrameRecord,
	foregroundFailed: boolean,
	value: Result
): Promise<Result> {
	let failed = foregroundFailed;
	let error: unknown = failed ? value : undefined;
	frame.producerOpen = false;
	publishTaskFrameEvent(frame, 'task.foreground-settle');
	if (failed) frame.controller.abort(error);
	try {
		await settleTaskFrameChildren(frame);
	} catch (childError) {
		if (!failed) error = childError;
		failed = true;
	}
	try {
		await runTaskFrameCleanups(frame);
	} catch (cleanupError) {
		if (!failed) throw cleanupError;
		attachSuppressedCleanupFailure(error, cleanupError);
	}
	if (!foregroundFailed && frame.controller.signal.aborted)
		throw new TaskCancellation(frame.controller.signal.reason);
	if (failed) throw error;
	return value;
}

function monotonicTimestamp(): number {
	return globalThis.performance?.now() ?? Date.now();
}

/** Allocates one process-local frame identity for internal consequence frames. */
export function allocateTaskFrameId(): number {
	return ambient.nextFrameId++;
}

function ensureScheduledWorkContextCapture(): void {
	if (scheduledWorkCaptureInstalled) return;
	scheduledWorkCaptureInstalled = true;
	setScheduledWorkContextCapture((priority) => {
		const parent = currentTaskFrameRecord();
		if (!parent || !parent.producerOpen || parent.settled) return undefined;
		if (priority === 'interactive' && uninspectedSynchronousFrames.has(parent))
			return interactiveReactionContext(parent);
		return acquireScheduledReactionBatch(parent);
	});
}

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
