import type { TaskFrameRecord } from './frame-runtime.js';

type FrameSettlement = {
	state: 'pending' | 'fulfilled' | 'rejected';
	reason?: unknown;
	promise?: Promise<void>;
	resolve?: () => void;
	reject?: (error: unknown) => void;
};

const frameSettlements = new WeakMap<TaskFrameRecord, FrameSettlement>();

/** Associates a task frame with the promise representing its structural settlement. */
export function registerTaskFrameSettlement(frame: TaskFrameRecord): void {
	frameSettlements.set(frame, { state: 'pending' });
}

/** Resolves one registered frame settlement without forcing a promise allocation. */
export function resolveTaskFrameSettlement(frame: TaskFrameRecord): void {
	const settlement = frameSettlements.get(frame);
	if (!settlement || settlement.state !== 'pending') return;
	settlement.state = 'fulfilled';
	settlement.resolve?.();
}

/** Rejects one registered frame settlement without forcing a promise allocation. */
export function rejectTaskFrameSettlement(frame: TaskFrameRecord, error: unknown): void {
	const settlement = frameSettlements.get(frame);
	if (!settlement || settlement.state !== 'pending') return;
	settlement.state = 'rejected';
	settlement.reason = error;
	settlement.reject?.(error);
}

/** Returns the structural settlement promise retained for a task frame. */
export function waitForTaskFrameSettlement(frame: TaskFrameRecord): Promise<void> {
	const settlement = frameSettlements.get(frame);
	return settlement ? materializeFrameSettlement(settlement) : Promise.resolve();
}

function materializeFrameSettlement(settlement: FrameSettlement): Promise<void> {
	if (settlement.promise) return settlement.promise;
	if (settlement.state === 'fulfilled') return Promise.resolve();
	if (settlement.state === 'rejected') return Promise.reject(settlement.reason);
	settlement.promise = new Promise<void>((resolve, reject) => {
		settlement.resolve = resolve;
		settlement.reject = reject;
	});
	return settlement.promise;
}

/**
 * Waits for every attached descendant, including children transferred from an
 * atomic reservation, then reports the first structural failure.
 */
export async function settleTaskFrameChildren(frame: TaskFrameRecord): Promise<void> {
	let primary: unknown;
	let failed = false;
	while (frame.children?.size) {
		const results = await Promise.allSettled([...frame.children]);
		for (const result of results) {
			if (result.status === 'fulfilled' || failed) continue;
			primary = result.reason;
			failed = true;
		}
	}
	if (failed) throw primary;
}

/** Runs frame-owned cleanup in last-in-first-out order and reports its first failure. */
export async function runTaskFrameCleanups(frame: TaskFrameRecord): Promise<void> {
	let primary: unknown;
	for (const cleanup of frame.cleanups?.reverse() ?? []) {
		try {
			await cleanup();
		} catch (error) {
			primary ??= error;
		}
	}
	if (primary !== undefined) throw primary;
}
