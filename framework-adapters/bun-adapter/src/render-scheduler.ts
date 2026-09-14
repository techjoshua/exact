import { clearImmediate, setImmediate } from 'node:timers';
import * as timerPromises from 'node:timers/promises';

/** Limits how many render starts one event-loop callback releases. */
export interface BunRenderSchedulerOptions {
	/** Maximum starts per batch. Defaults to 32; must be a positive safe integer. */
	maxBatchSize?: number;
}

interface RenderBatch {
	starts: Array<(() => void) | undefined>;
	failures: Array<((reason: unknown) => void) | undefined>;
	active: number;
	timer: ReturnType<typeof setImmediate> | undefined;
}

/**
 * Creates a host-owned queue for native Fetch admission. Share one
 * scheduler across requests to batch starts through scheduler.yield(), falling
 * back to setImmediate when that API is unavailable. Cancellation
 * rejects promptly and removes the queued continuation. Batches release at most
 * maxBatchSize starts; render work and response ownership remain with SSR. This low-level gate
 * always yields. Bun request handlers apply automatic adaptive admission around it.
 */
export function createBunRenderScheduler(
	options: BunRenderSchedulerOptions = {}
): (signal?: AbortSignal) => Promise<void> {
	const limit = options.maxBatchSize ?? 32;
	if (!Number.isSafeInteger(limit) || limit < 1)
		throw new RangeError('maxBatchSize must be a positive safe integer');
	let pending: RenderBatch | undefined;
	const scheduler = timerPromises.scheduler;
	const yieldTask = typeof scheduler?.yield === 'function' ? () => scheduler.yield() : undefined;
	const enqueue = (signal?: AbortSignal) =>
		new Promise<void>((resolve, reject) => {
			if (signal?.aborted) {
				reject(signal.reason);
				return;
			}
			const first = !pending;
			const batch: RenderBatch = pending ?? {
				starts: [],
				failures: [],
				active: 0,
				timer: undefined
			};
			if (first) pending = batch;
			const index = batch.starts.length;
			batch.active++;
			if (signal) {
				const abort = () => {
					batch.starts[index] = undefined;
					batch.failures[index] = undefined;
					signal.removeEventListener('abort', abort);
					if (--batch.active === 0) {
						if (batch.timer !== undefined) clearImmediate(batch.timer);
						batch.timer = undefined;
						batch.starts = [];
						batch.failures = [];
						if (pending === batch) pending = undefined;
					}
					reject(signal.reason);
				};
				batch.starts.push(() => {
					signal.removeEventListener('abort', abort);
					resolve();
				});
				batch.failures.push((reason) => {
					signal.removeEventListener('abort', abort);
					reject(reason);
				});
				signal.addEventListener('abort', abort, { once: true });
			} else {
				batch.starts.push(resolve);
				batch.failures.push(reject);
			}
			if (batch.starts.length === limit) pending = undefined;
			if (first) {
				const release = () => {
					if (pending === batch) pending = undefined;
					batch.timer = undefined;
					for (const start of batch.starts) start?.();
					batch.starts = [];
					batch.failures = [];
				};
				const fail = (reason: unknown) => {
					if (pending === batch) pending = undefined;
					for (const rejectStart of batch.failures) rejectStart?.(reason);
					batch.starts = [];
					batch.failures = [];
				};
				try {
					if (yieldTask) void yieldTask().then(release, fail);
					else batch.timer = setImmediate(release);
				} catch (reason) {
					fail(reason);
				}
			}
		});
	return enqueue;
}
