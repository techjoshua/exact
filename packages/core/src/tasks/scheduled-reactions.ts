import type { ScheduledWorkContext } from '@exactjs/reactive';
import { TaskCancellation } from './cancellation.js';
import { taskFrameTokenBrand, type TaskFrameRecord } from './frame-contracts.js';
import { taskFrameInspectionAttached } from './frame-inspection-capability.js';
import {
	allocateTaskFrameId,
	attachTaskFrameSettlement,
	currentTaskFrameRecord,
	executeTaskFrame,
	withTaskFrameRecord
} from './frame-runtime.js';
import { settleTaskFrameChildren } from './frame-settlement.js';

type ScheduledReactionBatch = {
	readonly frame: TaskFrameRecord;
	readonly signal: AbortSignal;
	readonly resolve: () => void;
	readonly reject: (error: unknown) => void;
	pending: number;
	failed: boolean;
	failure?: unknown;
	closed: boolean;
};

const scheduledReactionBatches = new WeakMap<TaskFrameRecord, ScheduledReactionBatch>();

/** Acquires one lease on the consequence frame shared by a task invalidation wave. */
export function acquireScheduledReactionBatch(parent: TaskFrameRecord): ScheduledWorkContext {
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
				if (batch!.signal.aborted) throw new TaskCancellation(batch!.signal.reason);
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

function createScheduledReactionBatch(parent: TaskFrameRecord): ScheduledReactionBatch {
	return taskFrameInspectionAttached(parent)
		? createInspectedScheduledReactionBatch(parent)
		: createInlineScheduledReactionBatch(parent);
}

/** Attaches one completion lease without a complete public task frame. */
function createInlineScheduledReactionBatch(parent: TaskFrameRecord): ScheduledReactionBatch {
	let controller: AbortController | undefined;
	let acceptCompletion!: () => void;
	let rejectCompletion!: (error: unknown) => void;
	const completion = new Promise<void>((accept, fail) => {
		acceptCompletion = accept;
		rejectCompletion = fail;
	});
	const frame: TaskFrameRecord = {
		[taskFrameTokenBrand]: true,
		id: allocateTaskFrameId(),
		owner: parent.owner,
		parent,
		get controller() {
			if (!controller) {
				controller = new AbortController();
				linkAbort(parent.controller.signal, controller);
			}
			return controller;
		},
		kind: 'reactive',
		label: 'reactive consequences',
		activation: parent.activation,
		generation: parent.generation,
		placement: parent.placement,
		concurrency: parent.concurrency,
		priority: parent.priority,
		readiness: parent.readiness,
		startedAt: monotonicTimestamp(),
		producerOpen: true,
		settled: false
	};
	attachTaskFrameSettlement(parent, completion);
	return {
		frame,
		signal: parent.controller.signal,
		resolve() {
			frame.producerOpen = false;
			void settleTaskFrameChildren(frame).then(
				() => finishInlineFrame(frame, acceptCompletion),
				(error) => finishInlineFrame(frame, () => rejectCompletion(error))
			);
		},
		reject(error) {
			frame.producerOpen = false;
			controller?.abort(error);
			const finish = () => finishInlineFrame(frame, () => rejectCompletion(error));
			void settleTaskFrameChildren(frame).then(finish, finish);
		},
		pending: 0,
		failed: false,
		closed: false
	};
}

function finishInlineFrame(frame: TaskFrameRecord, settle: () => void): void {
	frame.settled = true;
	settle();
}

/** Retains the complete consequence projection while DevTools inspection is attached. */
function createInspectedScheduledReactionBatch(parent: TaskFrameRecord): ScheduledReactionBatch {
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
			activation: parent.activation,
			kind: 'reactive',
			label: 'reactive consequences',
			publicContext: false
		},
		() => {
			frame = currentTaskFrameRecord()!;
			return completion;
		}
	);
	void execution.catch(() => undefined);
	return {
		frame,
		signal: frame.controller.signal,
		resolve,
		reject,
		pending: 0,
		failed: false,
		closed: false
	};
}

function linkAbort(signal: AbortSignal, target: AbortController): void {
	if (signal.aborted) target.abort(signal.reason);
	else signal.addEventListener('abort', () => target.abort(signal.reason), { once: true });
}

function monotonicTimestamp(): number {
	return globalThis.performance?.now() ?? Date.now();
}
