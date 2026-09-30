import { performance } from 'node:perf_hooks';
import { setImmediate } from 'node:timers';
import {
	StreamingRenderWorkWindow,
	type RequestRenderScheduler
} from '@exactjs/server/framework/render-scheduling';
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
	const budget = new StreamingRenderWorkWindow((reset) => {
		const marker = setImmediate(reset);
		marker.unref?.();
	});
	const streaming: RequestRenderScheduler = (signal) => {
		signal?.throwIfAborted();
		return budget.shouldSchedule(performance.now()) ? enqueue(signal) : undefined;
	};
	const adaptive: RequestRenderScheduler = (signal) => {
		signal?.throwIfAborted();
		return gate.shouldSchedule() ? enqueue(signal) : undefined;
	};
	adaptive.streaming = streaming;
	return adaptive;
}
