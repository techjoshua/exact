import type { TaskContextPolicy } from './contracts.js';

function uncompiledPolicy(): never {
	throw new Error(
		'TaskContext policy builders are compiler syntax and cannot execute without eXact compilation'
	);
}

/**
 * Compiler-recognized task policy marker.
 *
 * Production compilation erases calls rooted at this value. Executing a
 * builder in uncompiled code fails with a focused diagnostic.
 */
export const TaskContext: TaskContextPolicy = new Proxy(
	{},
	{
		get: () => uncompiledPolicy
	}
) as TaskContextPolicy;
