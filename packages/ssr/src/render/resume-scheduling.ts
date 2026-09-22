import type { ServerComponentExecutionFrame } from '@exactjs/core/framework/server-component-execution';
import { requestRenderScheduler } from '@exactjs/server/framework/render-scheduling';
import type { RenderToStringOptions } from '../types.js';
import { awaitWithAbort } from './context.js';
import type { SsrRenderOptions } from './entrypoints.js';

/** Resolves host policy once before rendering, retaining explicit caller overrides. */
export function withRequestRenderScheduling<T extends RenderToStringOptions>(options: T): T {
	if (options.scheduleRender) return options;
	const scheduleRender = requestRenderScheduler(options.signal);
	return scheduleRender ? { ...options, scheduleRender } : options;
}

/** Selects an optional progressive policy without adding dispatch to the string-rendering path. */
export function withRequestStreamScheduling<T extends RenderToStringOptions>(options: T): T {
	if (options.scheduleRender) return options;
	const host = requestRenderScheduler(options.signal);
	const scheduleRender = host?.streaming ?? host;
	return scheduleRender ? { ...options, scheduleRender } : options;
}

/** Consults host admission after actual data readiness; no promise is created for an immediate policy. */
export function resumeSsrWork<T>(
	options: SsrRenderOptions,
	resume: () => T | Promise<T>
): T | Promise<T> {
	options.signal?.throwIfAborted();
	const pending = options.scheduleRender?.(options.signal);
	if (!pending) return resume();
	return awaitWithAbort(pending, options.signal, options.taskDeadline).then(() => {
		options.signal?.throwIfAborted();
		return resume();
	});
}

/** Drains actual blocking generations, then rechecks readiness after conditional admission. */
export function settleSsrReadiness(
	execution: Pick<ServerComponentExecutionFrame, 'blockingWork'>,
	options: SsrRenderOptions,
	maxPasses: number,
	pass = 0,
	admitted = false
): void | Promise<void> {
	const pending = execution.blockingWork();
	if (!pending) {
		// Queued admission can overlap a new generation. Never publish before rechecking it.
		if (pass && !admitted)
			return resumeSsrWork(options, () =>
				settleSsrReadiness(execution, options, maxPasses, pass, true)
			);
		return;
	}
	if (pass === maxPasses) throw new Error(`SSR task drain exceeded ${maxPasses} passes`);
	return awaitWithAbort(pending, options.signal, options.taskDeadline).then(() =>
		settleSsrReadiness(execution, options, maxPasses, pass + 1)
	);
}
