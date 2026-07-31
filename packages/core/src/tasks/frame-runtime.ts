import { InteractionCancellation } from '../interaction/execution.js';
import { peek, setScheduledWorkContextCapture, type ScheduledWorkContext } from '@exactjs/reactive';
import type { TaskContext, TaskOwner } from './contracts.js';
import { publishTaskFrameEvent } from './frame-inspection.js';
import { runTaskFrameCleanups, settleTaskFrameChildren } from './frame-settlement.js';

import {
	taskFrameTokenBrand,
	taskOwnerBrand,
	type InternalTaskFrameOptions,
	type TaskActivationRegistration,
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
	const controller = new AbortController();
	const frames = new Set<TaskFrameRecord>();
	const settlements = new Set<PromiseLike<unknown>>();
	const ownerCleanups = new Set<TaskFrameCleanup>();
	const activationRegistrations = new Set<TaskActivationRegistration>();
	const owner: TaskOwnerRecord = {
		[taskOwnerBrand]: true,
		...(label === undefined ? {} : { label }),
		controller,
		frames,
		settlements,
		ownerCleanups,
		activationRegistrations,
		activationsDeferred: false,
		disposed: false,
		get signal() {
			return controller.signal;
		},
		async [Symbol.asyncDispose]() {
			if (owner.disposed) return;
			owner.disposed = true;
			controller.abort('task-owner-disposed');
			for (const frame of frames) frame.controller.abort('task-owner-disposed');
			for (const cleanup of [...ownerCleanups].reverse()) await cleanup();
			ownerCleanups.clear();
			await Promise.allSettled([
				...[...frames].map((frame) => waitForFrame(frame)),
				...settlements
			]);
		}
	};
	return owner;
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

/** Establishes a durable host owner while component or adapter setup runs. */
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
		children: new Set<Promise<void>>(),
		cleanups: [],
		...(options.label === undefined ? {} : { label: options.label }),
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
		startedAt: monotonicTimestamp(),
		context: undefined as unknown as TaskContext
	};
	(frame as { context: TaskContext }).context = createFrameContext(frame, options);
	frameWaiters.set(frame, settlement);
	owner.frames.add(frame);
	publishTaskFrameEvent(frame, 'task.frame.enter');
	publishTaskFrameEvent(frame, 'task.start');
	if (structuralParent) {
		structuralParent.children.add(settlement);
		void settlement
			.finally(() => structuralParent.children.delete(settlement))
			.catch(() => undefined);
	} else {
		// Root settlement is observed through executeTaskFrame's returned
		// promise; the internal structural signal has no parent consumer.
		void settlement.catch(() => undefined);
	}

	let directResult: T | PromiseLike<T>;
	let synchronousError: unknown;
	try {
		if (controller.signal.aborted) throw new InteractionCancellation(controller.signal.reason);
		directResult = withTaskFrameRecord(frame, () => work(frame.context));
	} catch (error) {
		synchronousError = error;
		directResult = Promise.reject(error);
	}
	const execution = Promise.resolve(directResult);

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
			if (controller.signal.aborted) throw new InteractionCancellation(controller.signal.reason);
			if (structuralFailed) throw structuralError;
			return value;
		},
		async (error) => {
			const outcomeError =
				controller.signal.aborted && !(error instanceof InteractionCancellation)
					? new InteractionCancellation(controller.signal.reason)
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
			owner.frames.delete(frame);
			resolveSettlement();
			publishTaskFrameEvent(frame, 'task.frame.exit');
			publishTaskFrameEvent(frame, 'task.structural-settle');
			publishTaskFrameEvent(frame, 'task.settle');
			return value;
		},
		(error) => {
			frame.settled = true;
			owner.frames.delete(frame);
			if (options.propagateFailure?.() === false) resolveSettlement();
			else rejectSettlement(error);
			publishTaskFrameEvent(frame, 'task.frame.exit');
			publishTaskFrameEvent(
				frame,
				error instanceof InteractionCancellation ? 'task.cancel' : 'task.fail',
				error
			);
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
	frame.children.add(normalized);
	void normalized.finally(() => frame.children.delete(normalized)).catch(() => undefined);
}

/** Resolves the opaque frame retained by a task context. */
export function frameForTaskContext(context: TaskContext): TaskFrameRecord {
	const frame = contextFrames.get(context);
	if (!frame || frame.settled)
		throw new Error('Task context belongs to a settled or unknown frame');
	return frame;
}

const contextFrames = new WeakMap<TaskContext, TaskFrameRecord>();
const frameWaiters = new WeakMap<TaskFrameRecord, Promise<void>>();
type ScheduledReactionBatch = {
	readonly frame: TaskFrameRecord;
	readonly resolve: () => void;
	readonly reject: (error: unknown) => void;
	pending: number;
	failed: boolean;
	failure?: unknown;
	closed: boolean;
};
const scheduledReactionBatches = new WeakMap<TaskFrameRecord, ScheduledReactionBatch>();

function createFrameContext(
	frame: TaskFrameRecord,
	options: InternalTaskFrameOptions
): TaskContext {
	const context: TaskContext = {
		signal: frame.controller.signal,
		generation: options.generation ?? 1,
		activation: options.activation ?? 'invoked',
		peek,
		optimistic:
			options.optimistic ??
			(() => {
				throw new Error('Optimistic state is not available for this task activation');
			}),
		cleanup(cleanup) {
			if (frame.settled || !frame.producerOpen)
				throw new Error('Cannot register cleanup after the task producer has closed');
			frame.cleanups.push(cleanup);
		},
		own(resource) {
			context.cleanup(async () => {
				if (Symbol.asyncDispose in resource) await resource[Symbol.asyncDispose]();
				else resource[Symbol.dispose]();
			});
			return resource;
		}
	};
	contextFrames.set(context, frame);
	return context;
}

function linkAbort(signal: AbortSignal, target: AbortController): void {
	if (signal.aborted) {
		target.abort(signal.reason);
		return;
	}
	signal.addEventListener('abort', () => target.abort(signal.reason), { once: true });
}

function waitForFrame(frame: TaskFrameRecord): Promise<void> {
	return frameWaiters.get(frame) ?? Promise.resolve();
}

function monotonicTimestamp(): number {
	return globalThis.performance?.now() ?? Date.now();
}

setScheduledWorkContextCapture(() => {
	const parent = currentTaskFrameRecord();
	if (!parent || !parent.producerOpen || parent.settled) return undefined;
	return acquireScheduledReactionBatch(parent);
});

/**
 * Acquires one lease on the reactive consequence frame shared by a task invalidation wave.
 *
 * A single state transition can invalidate hundreds of DOM bindings. They have the same parent,
 * cancellation lifetime, and scheduler turn, so allocating a complete child task frame for every
 * reaction adds ownership machinery without adding an independently meaningful lifetime.
 */
function acquireScheduledReactionBatch(parent: TaskFrameRecord): ScheduledWorkContext {
	let batch = scheduledReactionBatches.get(parent);
	if (!batch || batch.closed) {
		batch = createScheduledReactionBatch(parent);
		scheduledReactionBatches.set(parent, batch);
	}
	batch.pending++;
	let released = false;
	const release = (error?: unknown, failed = false) => {
		if (released) return;
		released = true;
		if (failed && !batch!.failed) {
			batch!.failed = true;
			batch!.failure = error;
		}
		if (--batch!.pending !== 0) return;
		batch!.closed = true;
		if (scheduledReactionBatches.get(parent) === batch) scheduledReactionBatches.delete(parent);
		if (batch!.failed) batch!.reject(batch!.failure);
		else batch!.resolve();
	};
	return {
		run(work) {
			if (released) return;
			try {
				if (batch!.frame.controller.signal.aborted)
					throw new InteractionCancellation(batch!.frame.controller.signal.reason);
				withTaskFrameRecord(batch!.frame, work);
			} catch (error) {
				release(error, true);
				throw error;
			}
			release();
		},
		cancel: release
	};
}

/** Creates the one structurally attached frame that owns a scheduled reaction batch. */
function createScheduledReactionBatch(parent: TaskFrameRecord): ScheduledReactionBatch {
	let resolve!: () => void;
	let reject!: (error: unknown) => void;
	const completion = new Promise<void>((accept, fail) => {
		resolve = accept;
		reject = fail;
	});
	let frame!: TaskFrameRecord;
	const execution = executeTaskFrame(
		{
			parent,
			owner: parent.owner,
			activation: parent.context.activation,
			kind: 'reactive',
			label: 'reactive consequences'
		},
		() => {
			frame = currentTaskFrameRecord()!;
			return completion;
		}
	);
	// Structural attachment propagates failure to the parent. This observer only
	// prevents a second process-level unhandled rejection.
	void execution.catch(() => undefined);
	return {
		frame,
		resolve,
		reject,
		pending: 0,
		failed: false,
		closed: false
	};
}
