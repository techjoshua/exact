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
export function attachCleanupError(primary: unknown, cleanup: unknown): void {
	if (!primary || (typeof primary !== 'object' && typeof primary !== 'function')) return;
	try {
		Object.defineProperty(primary, 'cleanupError', { configurable: true, value: cleanup });
	} catch {}
}
