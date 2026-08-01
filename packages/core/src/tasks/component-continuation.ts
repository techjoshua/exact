import type { ComponentInstance } from '../component/contracts.js';
import { taskOwnerForHost } from './owner-hosts.js';

const exactContinuationTask = Symbol.for('@exactjs/continuation-task');

type TaggedContinuationTask = ((...args: any[]) => unknown) & {
	[exactContinuationTask]?: string;
};

/** Tags compiler-generated task work with its opaque cross-runtime continuation identity. */
export function markComponentContinuationTask<T extends (...args: any[]) => unknown>(
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

/** Copies compiler-owned continuation identity through a runtime callable wrapper. */
export function inheritComponentContinuationIdentity(
	source: (...args: any[]) => unknown,
	target: (...args: any[]) => unknown
): void {
	const id = componentContinuationTaskId(source);
	if (id) markContinuationWork(id, target);
}

/** Lists continuation generations that completed successfully on one component instance. */
export function settledComponentContinuationIds(
	instance: ComponentInstance<any>
): readonly string[] {
	const owner = taskOwnerForHost(instance);
	if (!owner) return [];
	const taskIds = [...owner.activationRegistrations]
		.filter((registration) => registration.settled)
		.map((registration) => componentContinuationTaskId(registration.task))
		.filter((id): id is string => id !== undefined);
	return [...new Set(taskIds)];
}
