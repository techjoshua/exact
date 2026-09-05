import type {
	AnyExactComponentCallable,
	ExactComponentContinuationExecutorContract
} from '../component-contracts.js';

/** Adds one generated continuation implementation while rejecting ambiguous authority. */
export function addUniqueExecutor(
	target: Record<string, ExactComponentContinuationExecutorContract>,
	executor: ExactComponentContinuationExecutorContract
): void {
	const previous = target[executor.id];
	if (
		previous &&
		(previous.componentId !== executor.componentId || previous.execute !== executor.execute)
	)
		throw new Error(`Conflicting eXact component continuation executor ${executor.id}`);
	target[executor.id] = executor;
}

/** Adds one implementation while rejecting ID or runtime-name collisions. */
export function addUniqueImplementation(
	target: Record<string, AnyExactComponentCallable>,
	key: string,
	implementation: AnyExactComponentCallable
): void {
	const previous = target[key];
	if (previous && previous !== implementation)
		throw new Error(`Conflicting eXact component implementation ${key}`);
	target[key] = implementation;
}

/** Adds immutable JSON-shaped metadata while rejecting conflicting identities. */
export function addUniqueJson<T>(
	target: Record<string, T>,
	key: string,
	value: T,
	kind: string
): void {
	const previous = target[key];
	if (previous && JSON.stringify(previous) !== JSON.stringify(value))
		throw new Error(`Conflicting eXact component ${kind} ${key}`);
	target[key] = value;
}
