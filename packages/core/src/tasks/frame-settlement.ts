import type { TaskFrameRecord } from './frame-runtime.js';

/**
 * Waits for every attached descendant, including children transferred from an
 * atomic reservation, then reports the first structural failure.
 */
export async function settleTaskFrameChildren(frame: TaskFrameRecord): Promise<void> {
	let primary: unknown;
	let failed = false;
	while (frame.children.size) {
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
	for (const cleanup of frame.cleanups.reverse()) {
		try {
			await cleanup();
		} catch (error) {
			primary ??= error;
		}
	}
	if (primary !== undefined) throw primary;
}
