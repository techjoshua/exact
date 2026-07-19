import { flushSync } from '@exact/reactive';
import {
	reactCompatibilityTarget,
	ReactSharedInternals18,
	ReactSharedInternals19
} from '../internals.js';

/** Runs a test interaction and flushes compatibility work until it settles. */
export async function act<T>(callback: () => T | Promise<T>): Promise<T> {
	type ActCallback = (didTimeout: boolean) => ActCallback | null;
	const target = reactCompatibilityTarget();
	const previous18 = ReactSharedInternals18.ReactCurrentActQueue.current as ActCallback[] | null;
	const previous19 = ReactSharedInternals19.actQueue as ActCallback[] | null;
	const previousBatching18 = ReactSharedInternals18.ReactCurrentActQueue.isBatchingLegacy;
	const previousBatching19 = ReactSharedInternals19.isBatchingLegacy;
	const existing = target === 18 ? previous18 : previous19;
	const queue = existing ?? [];
	const outermost = existing === null;
	if (target === 18) ReactSharedInternals18.ReactCurrentActQueue.current = queue;
	else ReactSharedInternals19.actQueue = queue;
	ReactSharedInternals18.ReactCurrentActQueue.isBatchingLegacy = true;
	ReactSharedInternals19.isBatchingLegacy = true;
	try {
		const result = await callback();
		if (outermost) {
			let stablePasses = 0;
			for (let pass = 0; pass < 100 && stablePasses < 2; pass++) {
				// Give concurrent work one cooperative pass, then force expired work
				// through on later passes so a scheduler deadline cannot starve act().
				flushCompatibilityActQueue(queue, pass > 0);
				flushSync();
				await Promise.resolve();
				stablePasses = queue.length === 0 ? stablePasses + 1 : 0;
			}
			if (queue.length)
				throw new Error('React compatibility act() did not settle after 100 flush passes');
		}
		return result;
	} finally {
		ReactSharedInternals18.ReactCurrentActQueue.current = previous18;
		ReactSharedInternals19.actQueue = previous19;
		ReactSharedInternals18.ReactCurrentActQueue.isBatchingLegacy = previousBatching18;
		ReactSharedInternals19.isBatchingLegacy = previousBatching19;
	}
}
export const unstable_act = act;

function flushCompatibilityActQueue(
	queue: Array<(didTimeout: boolean) => ((didTimeout: boolean) => unknown) | null>,
	didTimeout: boolean
): void {
	let index = 0;
	try {
		while (index < queue.length) {
			const callback = queue[index]!;
			const continuation = callback(didTimeout);
			if (typeof continuation === 'function') {
				queue[index] = continuation as (
					didTimeout: boolean
				) => ((didTimeout: boolean) => unknown) | null;
				if (index > 0) queue.splice(0, index);
				return;
			}
			index++;
		}
		queue.length = 0;
	} catch (error) {
		queue.splice(0, index + 1);
		throw error;
	}
}
