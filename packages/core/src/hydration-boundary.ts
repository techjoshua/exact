const finiteClientBoundaries = new WeakSet<object>();

/** Marks a client boundary whose complete prop keys were proven by the compiler. */
export function markFiniteClientBoundary<Value extends object>(boundary: Value): Value {
	finiteClientBoundaries.add(boundary);
	return boundary;
}

/** Returns whether a boundary carries the module-private compiler proof. */
export function isFiniteClientBoundary(boundary: object): boolean {
	return finiteClientBoundaries.has(boundary);
}
