import type { ComponentInstance, TaskResult } from '../component/contracts.js';

const exactContinuationTask = Symbol.for('@exactjs/continuation-task');

type TaggedContinuationTask = ((...args: any[]) => unknown) & {
	[exactContinuationTask]?: string;
};

/** Tags compiler-generated task work with its opaque cross-runtime continuation identity. */
export function markComponentContinuationTask<T extends (...args: any[]) => TaskResult>(
	id: string,
	work: T
): T {
	return markContinuationWork(id, work);
}

/** Tags compiler-generated action work while preserving its authored result type. */
export function markComponentContinuationAction<T extends (...args: any[]) => unknown>(
	id: string,
	work: T
): T {
	return markContinuationWork(id, work);
}

/** Applies the shared non-enumerable continuation identity without changing callable behavior. */
function markContinuationWork<T extends (...args: any[]) => unknown>(id: string, work: T): T {
	if (!id) throw new Error('eXact continuation id must be non-empty');
	Object.defineProperty(work, exactContinuationTask, {
		value: id,
		configurable: false,
		enumerable: false,
		writable: false
	});
	return work;
}

/** Returns the private continuation identity attached by compiler output. */
export function componentContinuationTaskId(work: (...args: any[]) => unknown): string | undefined {
	return (work as TaggedContinuationTask)[exactContinuationTask];
}

/** Lists continuation generations that completed successfully on one component instance. */
export function settledComponentContinuationIds(
	instance: ComponentInstance<any>
): readonly string[] {
	return instance.tasks
		.filter(
			(task) =>
				task.completedGeneration === task.generation && task.failedGeneration !== task.generation
		)
		.map((task) => componentContinuationTaskId(task.work))
		.filter((id): id is string => id !== undefined);
}
