import { scheduleWork } from '@exactjs/reactive';

import type {
	ContinuationDependencySnapshot,
	ContinuationDependencySource
} from './dependency-source.js';

const noDependencyValues: readonly unknown[] = Object.freeze([]);

/** Values and publication identities captured atomically for one continuation issue. */
export type ContinuationDependencyVector = Readonly<{
	values: readonly unknown[];
}>;

/** Observes all dependencies for one authored continuation invocation. */
export type ContinuationDependencyWatcher = Disposable & {
	/** Reads and evaluates dependencies synchronously, primarily for initial host setup. */
	evaluate(): void;
};

/**
 * Watches one continuation invocation and issues it only when every dependency is available.
 *
 * Notifications within one turn are coalesced. A pending or terminal dependency invalidates active
 * work immediately; failure and cancellation are reported without leaving downstream work pending.
 */
export function watchContinuationDependencies(
	sources: readonly ContinuationDependencySource[],
	callbacks: Readonly<{
		onReady(vector: ContinuationDependencyVector): void;
		onUnavailable(
			state: Exclude<ContinuationDependencySnapshot<unknown>['status'], 'available'>,
			snapshot: ContinuationDependencySnapshot<unknown>
		): void;
	}>
): ContinuationDependencyWatcher {
	let disposed = false;
	let scheduled = false;
	let ready = false;
	const generations = Array<number>(sources.length).fill(-1);
	const versions = Array<number>(sources.length).fill(-1);
	const nextGenerations = Array<number>(sources.length);
	const nextVersions = Array<number>(sources.length);
	const nextValues = Array<unknown>(sources.length);
	const evaluate = (): void => {
		scheduled = false;
		if (disposed) return;
		let changed = !ready;
		for (let index = 0; index < sources.length; index++) {
			const snapshot = sources[index]!.read();
			if (snapshot.status !== 'available') {
				ready = false;
				callbacks.onUnavailable(snapshot.status, snapshot);
				return;
			}
			nextGenerations[index] = snapshot.generation;
			nextVersions[index] = snapshot.version;
			nextValues[index] = snapshot.value;
			if (snapshot.generation !== generations[index] || snapshot.version !== versions[index])
				changed = true;
		}
		if (!changed) return;
		ready = true;
		const values = sources.length ? new Array<unknown>(sources.length) : undefined;
		for (let index = 0; index < sources.length; index++) {
			generations[index] = nextGenerations[index]!;
			versions[index] = nextVersions[index]!;
			values![index] = nextValues[index];
		}
		callbacks.onReady({ values: values ?? noDependencyValues });
	};
	const schedule = (): void => {
		if (disposed || scheduled) return;
		scheduled = true;
		// The reactive scheduler deduplicates this computation and runs it after every dependency
		// notification in the current invalidation wave has published its new version.
		scheduleWork(evaluate);
	};
	// Subscribe before the first read so a source cannot publish between observation and ownership.
	const subscriptions = new Array<Disposable>(sources.length);
	for (let index = 0; index < sources.length; index++)
		subscriptions[index] = sources[index]!.subscribe(schedule);
	return {
		evaluate,
		[Symbol.dispose]() {
			if (disposed) return;
			disposed = true;
			for (const subscription of subscriptions) subscription[Symbol.dispose]();
		}
	};
}
