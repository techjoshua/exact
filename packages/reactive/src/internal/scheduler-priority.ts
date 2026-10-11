import type { EffectScopeImpl, ScheduledComputation, WorkPriority } from './types.js';

/** Stable ordering used for queue selection and promotion. */
export const priorityOrder: Record<WorkPriority, number> = {
	interactive: 0,
	normal: 1,
	deferred: 2
};
/** Reports whether candidate should run before current. */
export function isHigherWorkPriority(candidate: WorkPriority, current: WorkPriority): boolean {
	return priorityOrder[candidate] < priorityOrder[current];
}

/** Applies every enclosing scope constraint to a requested work priority. */
export function constrainedPriority(
	scope: EffectScopeImpl | undefined,
	requested: WorkPriority
): WorkPriority {
	let resolved = requested;
	for (let cursor = scope; cursor; cursor = cursor.parent) {
		if (cursor.workPriority && isHigherWorkPriority(resolved, cursor.workPriority))
			resolved = cursor.workPriority;
	}
	return resolved;
}

const priorityStack: WorkPriority[] = [];

/** Returns the priority inherited by work scheduled during synchronous execution. */
export function currentWorkPriority(): WorkPriority {
	return priorityStack[priorityStack.length - 1] ?? 'normal';
}

/** Runs synchronous work with priority restored on ordinary and exceptional exits. */
export function runWithPriority<T>(priority: WorkPriority, work: () => T): T {
	return executeWithPriority(priority, work);
}

/** Executes a queued owner with its receiver intact, without allocating a dispatch callback. */
export function runScheduledComputation(priority: WorkPriority, work: ScheduledComputation): void {
	executeWithPriority(priority, work);
}

function executeWithPriority<T>(priority: WorkPriority, work: (() => T) | { run(): T }): T {
	priorityStack.push(priority);
	try {
		return typeof work === 'function' ? work() : work.run();
	} finally {
		priorityStack.pop();
	}
}
