import { scheduleWork } from '@exactjs/reactive';

import type { InternalTaskGeneration } from './runtime-types.js';

/** Raises queued task work to a more urgent inherited priority when possible. */
export function donateTaskPriority<Result>(
	record: InternalTaskGeneration<Result>,
	donated: 'immediate' | 'normal' | 'deferred'
): void {
	if (record.executing || priorityRank(donated) >= priorityRank(record.priority)) return;
	record.priority = donated;
	if (record.scheduledWork) scheduleWork(record.scheduledWork, taskWorkPriority(donated));
}

/** Maps authored task priority onto the reactive scheduler's work classes. */
export function taskWorkPriority(
	priority: 'immediate' | 'normal' | 'deferred'
): 'interactive' | 'normal' | 'deferred' {
	return priority === 'immediate' ? 'interactive' : priority;
}

function priorityRank(priority: 'immediate' | 'normal' | 'deferred'): number {
	return priority === 'immediate' ? 0 : priority === 'normal' ? 1 : 2;
}
