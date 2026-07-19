/** Identifies values that participate in promise-style asynchronous settlement. */
export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
	return (
		!!value &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as PromiseLike<void>).then === 'function'
	);
}
