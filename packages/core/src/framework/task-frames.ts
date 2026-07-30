import type { TaskContext } from '../tasks/contracts.js';
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

/** Work and settlement hooks for a framework-created task frame. */
export interface RunTaskFrameHooks<T> {
	work(context: TaskContext): T | Promise<T>;
	afterForeground?(outcome: TaskForegroundOutcome): void | Promise<void>;
	afterChildren?(outcome: TaskFrameOutcome<T>): void | Promise<void>;
}

/** Atomically reserved frame that must be run or released exactly once. */
export interface TaskFrameReservation extends Disposable {
	run<T>(work: (context: TaskContext) => T | Promise<T>): Promise<T>;
	cancel(reason?: unknown): void;
}

/** Captures the synchronously active opaque task frame. */
export function captureTaskFrame(): TaskFrameToken | undefined {
	return currentTaskFrameRecord() as TaskFrameToken | undefined;
}

/** Runs framework work in a structurally attached task frame. */
export async function runTaskFrame<T>(
	options: RunTaskFrameOptions,
	hooks: RunTaskFrameHooks<T>
): Promise<T> {
	return runTaskFrameInternal(options, hooks, false);
}

async function runTaskFrameInternal<T>(
	options: RunTaskFrameOptions,
	hooks: RunTaskFrameHooks<T>,
	parentReserved: boolean
): Promise<T> {
	let foregroundReported = false;
	try {
		const value = await executeTaskFrame(
			{
				parent: options.parent as TaskFrameRecord | undefined,
				parentReserved,
				generation: options.generation,
				detached: options.detached,
				priority: options.priority,
				readiness: options.readiness
			},
			async (context) => {
				try {
					const result = await hooks.work(context);
					await hooks.afterForeground?.({ status: 'ready' });
					foregroundReported = true;
					return result;
				} catch (error) {
					await hooks.afterForeground?.({ status: 'rejected', error });
					foregroundReported = true;
					throw error;
				}
			}
		);
		await hooks.afterChildren?.({ status: 'fulfilled', value });
		return value;
	} catch (error) {
		if (!foregroundReported) await hooks.afterForeground?.({ status: 'rejected', error });
		await hooks.afterChildren?.({ status: 'rejected', error });
		throw error;
	}
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
		run<T>(work: (context: TaskContext) => T | Promise<T>): Promise<T> {
			if (used) return Promise.reject(new Error('Task frame reservation was already released'));
			used = true;
			const execution = runTaskFrameInternal(
				{ ...options, parent: parent as unknown as TaskFrameToken },
				{ work },
				true
			);
			// The child is attached synchronously before runTaskFrame returns, so
			// ownership transfers without an empty-tree race.
			release();
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

/** Restores a captured frame for one synchronous callback segment. */
export function runWithTaskFrame<T>(frame: TaskFrameToken, work: () => T): T {
	return withTaskFrameRecord(frame as unknown as TaskFrameRecord, work);
}
