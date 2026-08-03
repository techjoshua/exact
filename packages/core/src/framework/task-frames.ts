import type { TaskContext } from '../tasks/contracts.js';
import { TaskCancellation } from '../tasks/cancellation.js';
import {
	attachTaskFrameSettlement,
	currentTaskFrameRecord,
	executeTaskFrame,
	withTaskFrameRecord,
	type TaskFrameRecord
} from '../tasks/frame-runtime.js';

declare const taskFrameTokenBrand: unique symbol;

/** Opaque authority identifying a live task frame. */
export interface TaskFrameToken {
	readonly [taskFrameTokenBrand]: true;
}

/** Framework-owned child frame policy. */
export interface RunTaskFrameOptions {
	readonly parent?: TaskFrameToken;
	readonly kind: string;
	readonly label?: string;
	readonly generation?: number;
	readonly detached?: boolean;
	readonly priority?: 'immediate' | 'normal' | 'deferred';
	readonly readiness?: 'blocking' | 'nonblocking';
}

/** Terminal structural outcome reported to framework coordinators. */
export type TaskFrameOutcome<T> =
	| { readonly status: 'fulfilled'; readonly value: T }
	| { readonly status: 'rejected'; readonly error: unknown }
	| { readonly status: 'cancelled'; readonly reason: unknown };

/** Foreground readiness outcome reported exactly once. */
export type TaskForegroundOutcome =
	| { readonly status: 'ready' }
	| { readonly status: 'rejected'; readonly error: unknown }
	| { readonly status: 'cancelled'; readonly reason: unknown };

/**
 * Structurally settled framework work with cooperative cancellation.
 *
 * Cancelling aborts the frame and every attached descendant. The promise does
 * not settle until foreground work, descendants, and cleanup have responded.
 */
export interface TaskFrameExecution<T> extends Promise<T> {
	/** Signal inherited by the frame's context and attached descendants. */
	readonly signal: AbortSignal;

	/** Requests cooperative cancellation while preserving structural settlement. */
	cancel(reason?: unknown): void;
}

/** Work and settlement hooks for a framework-created task frame. */
export interface RunTaskFrameHooks<T> {
	work(context: TaskContext): T | Promise<T>;
	afterForeground?(outcome: TaskForegroundOutcome): void | Promise<void>;
	afterChildren?(outcome: TaskFrameOutcome<T>): void | Promise<void>;
}

/** Atomically reserved frame that must be run or released exactly once. */
export interface TaskFrameReservation extends Disposable {
	run<T>(work: (context: TaskContext) => T | Promise<T>): TaskFrameExecution<T>;
	cancel(reason?: unknown): void;
}

/** Captures the synchronously active opaque task frame. */
export function captureTaskFrame(): TaskFrameToken | undefined {
	return currentTaskFrameRecord() as TaskFrameToken | undefined;
}

/**
 * Runs framework work in a structurally attached, cooperatively cancelable
 * task frame.
 */
export function runTaskFrame<T>(
	options: RunTaskFrameOptions,
	hooks: RunTaskFrameHooks<T>
): TaskFrameExecution<T> {
	return createTaskFrameExecution(options, hooks, false);
}

/** Creates the cancelable public execution around one internal frame. */
function createTaskFrameExecution<T>(
	options: RunTaskFrameOptions,
	hooks: RunTaskFrameHooks<T>,
	parentReserved: boolean
): TaskFrameExecution<T> {
	const controller = new AbortController();
	const execution = runTaskFrameInternal(options, hooks, parentReserved, controller);
	const parent = options.detached
		? undefined
		: ((options.parent as TaskFrameRecord | undefined) ?? currentTaskFrameRecord());
	if (parent && !parentReserved && parent.producerOpen && !parent.settled)
		attachTaskFrameSettlement(parent, execution);
	return exposeTaskFrameExecution(execution, controller);
}

/** Adds framework cancellation authority to a native settlement promise. */
function exposeTaskFrameExecution<T>(
	execution: Promise<T>,
	controller: AbortController
): TaskFrameExecution<T> {
	let settled = false;
	void execution.then(
		() => {
			settled = true;
		},
		() => {
			settled = true;
		}
	);
	return Object.defineProperties(execution, {
		signal: {
			configurable: false,
			enumerable: true,
			value: controller.signal,
			writable: false
		},
		cancel: {
			configurable: false,
			enumerable: false,
			value(reason?: unknown) {
				if (!settled) controller.abort(reason);
			},
			writable: false
		}
	}) as TaskFrameExecution<T>;
}

async function runTaskFrameInternal<T>(
	options: RunTaskFrameOptions,
	hooks: RunTaskFrameHooks<T>,
	parentReserved: boolean,
	controller: AbortController
): Promise<T> {
	let foregroundReported = false;
	let childrenReported = false;
	try {
		const value = await executeTaskFrame(
			{
				parent: options.parent as TaskFrameRecord | undefined,
				parentReserved,
				controller,
				generation: options.generation,
				detached: options.detached,
				kind: options.kind,
				label: options.label,
				priority: options.priority,
				readiness: options.readiness
			},
			async (context) => {
				try {
					const result = await hooks.work(context);
					foregroundReported = true;
					await hooks.afterForeground?.({ status: 'ready' });
					return result;
				} catch (error) {
					if (!foregroundReported) {
						foregroundReported = true;
						await hooks.afterForeground?.(foregroundOutcome(controller.signal, error));
					}
					throw error;
				}
			}
		);
		childrenReported = true;
		await hooks.afterChildren?.({ status: 'fulfilled', value });
		return value;
	} catch (error) {
		if (!foregroundReported) {
			foregroundReported = true;
			await hooks.afterForeground?.(foregroundOutcome(controller.signal, error));
		}
		if (!childrenReported) {
			childrenReported = true;
			await hooks.afterChildren?.(structuralOutcome(controller.signal, error));
		}
		throw error;
	}
}

/** Classifies foreground failure using the frame's cancellation authority. */
function foregroundOutcome(signal: AbortSignal, error: unknown): TaskForegroundOutcome {
	return signal.aborted || error instanceof TaskCancellation
		? { status: 'cancelled', reason: cancellationReason(signal, error) }
		: { status: 'rejected', error };
}

/** Classifies structural failure using the frame's cancellation authority. */
function structuralOutcome<T>(signal: AbortSignal, error: unknown): TaskFrameOutcome<T> {
	return error instanceof TaskCancellation
		? { status: 'cancelled', reason: cancellationReason(signal, error) }
		: { status: 'rejected', error };
}

/** Preserves the originating abort reason after runtime cancellation wrapping. */
function cancellationReason(signal: AbortSignal, error: unknown): unknown {
	if (error instanceof TaskCancellation) return error.reason;
	return signal.aborted ? signal.reason : error;
}

/** Reserves an attached child before handing work to an external scheduler. */
export function reserveTaskFrame(options: RunTaskFrameOptions): TaskFrameReservation {
	const parent = (options.parent as TaskFrameRecord | undefined) ?? currentTaskFrameRecord();
	if (!parent) throw new Error('A task frame reservation requires an active or explicit parent');
	let used = false;
	let release!: () => void;
	const placeholder = new Promise<void>((resolve) => {
		release = resolve;
	});
	attachTaskFrameSettlement(parent, placeholder);
	return {
		run<T>(work: (context: TaskContext) => T | Promise<T>): TaskFrameExecution<T> {
			if (used)
				return rejectedTaskFrameExecution(new Error('Task frame reservation was already released'));
			used = true;
			const execution = createTaskFrameExecution(
				{ ...options, parent: parent as unknown as TaskFrameToken },
				{ work },
				true
			);
			// Keep the atomic placeholder until the public execution, including
			// its structural finalizer, has settled.
			void execution.then(release, release);
			return execution;
		},
		cancel() {
			if (used) return;
			used = true;
			release();
		},
		[Symbol.dispose]() {
			if (used) return;
			used = true;
			release();
		}
	};
}

/** Creates a settled execution for invalid reservation reuse. */
function rejectedTaskFrameExecution<T>(error: unknown): TaskFrameExecution<T> {
	const controller = new AbortController();
	return exposeTaskFrameExecution(Promise.reject<T>(error), controller);
}

/** Restores a captured frame for one synchronous callback segment. */
export function runWithTaskFrame<T>(frame: TaskFrameToken, work: () => T): T {
	return withTaskFrameRecord(frame as unknown as TaskFrameRecord, work);
}
