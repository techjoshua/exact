/** Serializes complete hot-update transactions while preserving each caller's failure. */
export class ExactViteDevelopmentUpdates {
	#settled: Promise<void> = Promise.resolve();

	/** Runs after previous updates settle, including when a prior update was rejected. */
	run<T>(update: () => Promise<T>): Promise<T> {
		const pending = this.#settled.then(update);
		this.#settled = pending.then(
			() => undefined,
			() => undefined
		);
		return pending;
	}
}
