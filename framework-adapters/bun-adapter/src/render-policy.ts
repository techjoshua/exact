import { performance } from 'node:perf_hooks';
import { setImmediate } from 'node:timers';
import type { RequestRenderScheduler } from '@exactjs/server/framework/render-scheduling';
import type { BunRequestGate } from './adaptive-gate.js';

/**
 * Keeps adaptive admission and string rendering on the host-wide observer while progressive
 * rendering uses a cooperative work window. Native departure accounting still observes every
 * request. Both output policies share the host's bounded, cancellation-aware continuation queue.
 */
export function createBunRenderPolicy(
	gate: Pick<BunRequestGate, 'shouldSchedule'>,
	enqueue: (signal?: AbortSignal) => Promise<void>
): RequestRenderScheduler {
	const budget = new StreamingWorkWindow();
	const streaming: RequestRenderScheduler = (signal) => {
		signal?.throwIfAborted();
		return budget.shouldSchedule() ? enqueue(signal) : undefined;
	};
	const adaptive: RequestRenderScheduler = (signal) => {
		signal?.throwIfAborted();
		return gate.shouldSchedule() ? enqueue(signal) : undefined;
	};
	adaptive.streaming = streaming;
	return adaptive;
}

/**
 * Measures shared streaming CPU work until an immediate callback observes another turn.
 * Promise completion alone does not reset the budget. The half-millisecond threshold is
 * cooperative: uninterrupted authored work can exceed it. Idle hosts retain no recurring timer.
 */
class StreamingWorkWindow {
	private marker: ReturnType<typeof setImmediate> | undefined;
	private started = 0;

	/** Checks only at render entry and data resumption, outside component span traversal. */
	shouldSchedule(): boolean {
		if (this.marker === undefined) {
			this.started = performance.now();
			this.marker = setImmediate(() => {
				this.marker = undefined;
			});
			this.marker.unref?.();
		}
		return performance.now() - this.started >= 0.5;
	}
}
