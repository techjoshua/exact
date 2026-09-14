import { inheritRequestRenderScheduler } from '@exactjs/server/framework/render-scheduling';
import { combineTaskSignal } from '@exactjs/core/framework/server-task-helpers';

/** Combines request ownership with an optional render-specific cancellation source. */
export function renderSignal(
	request: AbortSignal | undefined,
	explicit: AbortSignal | undefined
): AbortSignal | undefined {
	if (!request) return explicit;
	const signal = combineTaskSignal(request, explicit);
	inheritRequestRenderScheduler(request, signal);
	return signal;
}
