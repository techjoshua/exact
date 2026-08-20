import type { AnyComponentInstance } from '../component/contracts.js';
import { taskOwnerForHost } from './owner-hosts.js';

const exactContinuationTask = Symbol.for('@exactjs/continuation-task');

/** Existential continuation callable whose concrete signature is retained by branding helpers. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Continuations may accept heterogeneous authored arguments that these helpers never inspect.
type AnyContinuationCallable = (...args: any[]) => unknown;

type TaggedContinuationTask = AnyContinuationCallable & {
	[exactContinuationTask]?: string;
};

/** Tags compiler-generated task work with its opaque cross-runtime continuation identity. */
export function markComponentContinuationTask<T extends AnyContinuationCallable>(
	id: string,
	work: T
): T {
	return markContinuationWork(id, work);
}

/** Applies the shared non-enumerable continuation identity without changing callable behavior. */
function markContinuationWork<T extends AnyContinuationCallable>(id: string, work: T): T {
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
export function componentContinuationTaskId(work: AnyContinuationCallable): string | undefined {
	return (work as TaggedContinuationTask)[exactContinuationTask];
}

/** Copies compiler-owned continuation identity through a runtime callable wrapper. */
export function inheritComponentContinuationIdentity(
	source: AnyContinuationCallable,
	target: AnyContinuationCallable
): void {
	const id = componentContinuationTaskId(source);
	if (id) markContinuationWork(id, target);
}

/** Lists continuation generations that completed successfully on one component instance. */
export function settledComponentContinuationIds(instance: AnyComponentInstance): readonly string[] {
	const owner = taskOwnerForHost(instance);
	if (!owner) return [];
	const taskIds = [...owner.activationRegistrations]
		.filter((registration) => registration.settled)
		.map((registration) => componentContinuationTaskId(registration.task))
		.filter((id): id is string => id !== undefined);
	return [...new Set(taskIds)];
}
