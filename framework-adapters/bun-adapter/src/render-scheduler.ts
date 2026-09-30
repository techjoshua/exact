import { clearImmediate, setImmediate } from 'node:timers';
import * as timerPromises from 'node:timers/promises';

/** Limits how many render starts one event-loop turn releases. */
export interface BunRenderSchedulerOptions {
	/** Maximum starts per turn. Defaults to 32 and must be a positive safe integer. */
	maxBatchSize?: number;
}

interface RenderBatch {
	starts: Array<(() => void) | undefined>;
	failures: Array<((reason: unknown) => void) | undefined>;
	active: number;
	previous: RenderBatch | undefined;
	next: RenderBatch | undefined;
}

interface ScheduledTurn {
	timer: ReturnType<typeof setImmediate> | undefined;
}

/**
 * Creates a host-owned FIFO queue for native Fetch admission. Share one queue across requests.
 * Each host yield releases at most maxBatchSize starts before yielding again, so a backlog cannot
 * drain several batches in one turn. Cancellation promptly rejects and unlinks empty batches.
 * Render work and response ownership remain with SSR. This low-level queue always yields.
 * Bun request handlers select whether admission should use it.
 */
export function createBunRenderScheduler(
	options: BunRenderSchedulerOptions = {}
): (signal?: AbortSignal) => Promise<void> {
	const limit = options.maxBatchSize ?? 32;
	if (!Number.isSafeInteger(limit) || limit < 1)
		throw new RangeError('maxBatchSize must be a positive safe integer');
	let head: RenderBatch | undefined;
	let tail: RenderBatch | undefined;
	let pending: RenderBatch | undefined;
	let turn: ScheduledTurn | undefined;
	const scheduler = timerPromises.scheduler;
	const yieldTask = typeof scheduler?.yield === 'function' ? () => scheduler.yield() : undefined;

	/** Unlinks a batch before settling its promises, retaining the remaining queue's order. */
	function unlink(batch: RenderBatch): void {
		if (batch.previous) batch.previous.next = batch.next;
		else head = batch.next;
		if (batch.next) batch.next.previous = batch.previous;
		else tail = batch.previous;
		batch.previous = batch.next = undefined;
		if (pending === batch) pending = undefined;
	}

	/** Cancels the owned timer and fences an uncancelable scheduler.yield callback. */
	function cancelTurn(): void {
		if (turn?.timer !== undefined) clearImmediate(turn.timer);
		turn = undefined;
	}

	/** Keeps one outstanding host wakeup regardless of the number of queued batches. */
	function scheduleTurn(): void {
		if (turn || !head) return;
		const scheduled: ScheduledTurn = { timer: undefined };
		turn = scheduled;
		const release = () => {
			if (turn !== scheduled) return;
			turn = undefined;
			const batch = head!;
			unlink(batch);
			for (const start of batch.starts) start?.();
			batch.starts = [];
			batch.failures = [];
			scheduleTurn();
		};
		const fail = (reason: unknown) => {
			if (turn !== scheduled) return;
			turn = undefined;
			while (head) {
				const batch = head;
				unlink(batch);
				for (const reject of batch.failures) reject?.(reason);
				batch.starts = [];
				batch.failures = [];
			}
		};
		try {
			if (yieldTask) void yieldTask().then(release, fail);
			else scheduled.timer = setImmediate(release);
		} catch (reason) {
			fail(reason);
		}
	}

	return (signal) =>
		new Promise<void>((resolve, reject) => {
			if (signal?.aborted) {
				reject(signal.reason);
				return;
			}
			let batch = pending;
			if (!batch) {
				batch = { starts: [], failures: [], active: 0, previous: tail, next: undefined };
				if (tail) tail.next = batch;
				else head = batch;
				tail = pending = batch;
			}
			const owned = batch;
			const index = owned.starts.length;
			owned.active++;
			if (signal) {
				const abort = () => {
					owned.starts[index] = undefined;
					owned.failures[index] = undefined;
					signal.removeEventListener('abort', abort);
					if (--owned.active === 0) {
						unlink(owned);
						owned.starts = [];
						owned.failures = [];
						if (!head) cancelTurn();
					}
					reject(signal.reason);
				};
				owned.starts.push(() => {
					signal.removeEventListener('abort', abort);
					resolve();
				});
				owned.failures.push((reason) => {
					signal.removeEventListener('abort', abort);
					reject(reason);
				});
				signal.addEventListener('abort', abort, { once: true });
			} else {
				owned.starts.push(resolve);
				owned.failures.push(reject);
			}
			if (owned.starts.length === limit) pending = undefined;
			scheduleTurn();
		});
}
