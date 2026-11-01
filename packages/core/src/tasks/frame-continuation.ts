import { sharedTaskRuntimeState } from './runtime-state.js';
import { taskResourceOwnerSignal } from './resource-owner-signals.js';
import type { TaskFrameRecord } from './frame-contracts.js';

const framesBySignal = sharedTaskRuntimeState(
	'signal-frames',
	() => new WeakMap<AbortSignal, TaskFrameRecord>()
);
const continuationState = sharedTaskRuntimeState('continuation-resumptions', () => ({
	pending: [] as Array<{
		readonly frame: TaskFrameRecord;
		readonly resume: () => void;
		readonly enter: (frame: TaskFrameRecord | undefined) => () => void;
	}>,
	scheduled: false
}));
const pendingResumptions = continuationState.pending;

/** Associates a frame signal with the frame restored after compiler-lowered awaits. */
export function registerTaskFrameSignal(signal: AbortSignal, frame: TaskFrameRecord): void {
	framesBySignal.set(signal, frame);
}

/** Releases continuation restoration state when its frame settles. */
export function releaseTaskFrameSignal(signal: AbortSignal): void {
	framesBySignal.delete(signal);
}

/** Finds active frame ownership retained by an original or adapted resource signal. */
export function frameForTaskSignal(signal: AbortSignal): TaskFrameRecord | undefined {
	return framesBySignal.get(taskResourceOwnerSignal(signal));
}

/** Queues one serialized continuation resumption for the frame owning a task signal. */
export function resumeTaskFrameContinuation(
	signal: AbortSignal,
	resume: () => void,
	enter: (frame: TaskFrameRecord | undefined) => () => void
): void {
	const frame = frameForTaskSignal(signal);
	if (!frame || frame.settled) {
		resume();
		return;
	}
	pendingResumptions.push({ frame, resume, enter });
	if (continuationState.scheduled) return;
	continuationState.scheduled = true;
	// The promise-resolution job is already an asynchronous boundary. Enter the uncontended first
	// continuation there and retain the queue only for resolutions that overlap its authored job.
	runNextTaskResumption();
}

/** Serializes restoration so concurrent promise resolutions cannot exchange task ownership. */
function runNextTaskResumption(): void {
	const next = pendingResumptions.shift();
	if (!next) {
		continuationState.scheduled = false;
		return;
	}
	let leave: (() => void) | undefined;
	try {
		// Cancellation may settle a frame while an earlier resumption owns the queue.
		// Deliver the pending promise settlement without reviving that frame.
		leave = next.enter(next.frame.settled ? undefined : next.frame);
		next.resume();
	} finally {
		// Promise resolution queues the authored continuation before the restoration job.
		queueMicrotask(() => {
			try {
				leave?.();
			} finally {
				if (pendingResumptions.length) queueMicrotask(runNextTaskResumption);
				else continuationState.scheduled = false;
			}
		});
	}
}
