import type { EffectScopeImpl, WorkPriority } from './types.js';

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
