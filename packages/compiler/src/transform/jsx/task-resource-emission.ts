import type { ExpressionTaskResourceKind } from '../../expression/task-contracts.js';
import type { HelperNames } from '../../types.js';

/** Resolves the runtime helper used to manage one compiler-classified task resource. */
export function taskResourceHelper(
	kind: ExpressionTaskResourceKind,
	helpers: HelperNames
): readonly [string, string] {
	if (kind === 'timeout') return ['taskTimeout', helpers.taskTimeout];
	if (kind === 'interval') return ['taskInterval', helpers.taskInterval];
	if (kind === 'animation-frame') return ['taskAnimationFrame', helpers.taskAnimationFrame];
	if (kind === 'idle-callback') return ['taskIdleCallback', helpers.taskIdleCallback];
	if (kind === 'observer') return ['taskObserver', helpers.taskObserver];
	if (kind === 'owned') return ['ownTaskResource', helpers.taskResource];
	return ['taskFetch', helpers.taskFetch];
}
