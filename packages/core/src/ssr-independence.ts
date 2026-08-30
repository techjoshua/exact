const independentAsyncSiblings = new WeakSet<object>();

/** Marks a host whose direct async SSR siblings passed the compiler independence proof. */
export function markIndependentAsyncSiblings<Operation extends object>(
	operation: Operation
): Operation {
	independentAsyncSiblings.add(operation);
	return operation;
}

/** Rejects authored lookalikes by reading only the module-private proof set. */
export function hasIndependentAsyncSiblings(operation: object): boolean {
	return independentAsyncSiblings.has(operation);
}
