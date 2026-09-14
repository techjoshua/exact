/**
 * Bounds how long the caller waits, in milliseconds. Settlement clears the timer; a timeout
 * rejects with the lazily created error but does not cancel the underlying work.
 */
export function withTimeout<T>(
	promise: Promise<T>,
	timeout: number,
	error: () => Error
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(error()), timeout);
		void promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(cause) => {
				clearTimeout(timer);
				reject(cause);
			}
		);
	});
}
/**
 * Preserves a primary failure while attaching a secondary cleanup failure when the thrown
 * value is extensible. Primitive and frozen failures remain unchanged; annotation cannot throw.
 */
export function attachCleanupError(primary: unknown, cleanup: unknown): void {
	if (!primary || (typeof primary !== 'object' && typeof primary !== 'function')) return;
	try {
		Object.defineProperty(primary, 'cleanupError', { configurable: true, value: cleanup });
	} catch {}
}
