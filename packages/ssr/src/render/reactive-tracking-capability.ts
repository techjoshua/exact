type ReactivePeek = <T>(work: () => T) => T;

let runWithoutTracking: ReactivePeek = (work) => work();

/** Installs dependency-tracking suppression for generic reactive server component snapshots. */
export function registerSsrReactivePeek(next: ReactivePeek): void {
	runWithoutTracking = next;
}

/** Reads plain compiler-owned props directly or suppresses tracking in a generic reactive lane. */
export function withSsrReactivePeek<T>(work: () => T): T {
	return runWithoutTracking(work);
}
