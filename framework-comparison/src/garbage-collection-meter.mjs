import { PerformanceObserver } from 'node:perf_hooks';

/**
 * Counts supported GC observations without forcing collection. Unsupported observers report
 * unavailable values, not measured zeroes. The owner resets intervals and closes the observer.
 */
export function createGarbageCollectionMeter(Observer = PerformanceObserver) {
	let observer;
	let count = 0;
	let durationMs = 0;
	const collect = (entries) => {
		for (const entry of entries) {
			count++;
			durationMs += entry.duration;
		}
	};
	if (Observer?.supportedEntryTypes?.includes('gc')) {
		try {
			observer = new Observer((list) => collect(list.getEntries()));
			observer.observe({ entryTypes: ['gc'] });
		} catch {
			observer?.disconnect();
			observer = undefined;
		}
	}
	return {
		snapshot() {
			if (!observer) return { available: false, count: null, durationMs: null };
			collect(observer.takeRecords());
			return { available: true, count, durationMs };
		},
		reset() {
			observer?.takeRecords();
			count = 0;
			durationMs = 0;
		},
		close() {
			observer?.disconnect();
		}
	};
}
