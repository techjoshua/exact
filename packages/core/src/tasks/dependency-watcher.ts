import { scheduleWork } from '@exactjs/reactive';

import type {
	ContinuationDependencySnapshot,
	ContinuationDependencySource
} from './dependency-source.js';

/** Values and publication identities captured atomically for one continuation issue. */
export type ContinuationDependencyVector = Readonly<{
	values: readonly unknown[];
	publications: readonly Readonly<{ generation: number; version: number }>[];
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
	let lastPublications: readonly Readonly<{ generation: number; version: number }>[] | undefined;
	const evaluate = (): void => {
		scheduled = false;
		if (disposed) return;
		const snapshots = sources.map((source) => source.read());
		const unavailable = snapshots.find((snapshot) => snapshot.status !== 'available');
		if (unavailable) {
			lastPublications = undefined;
			callbacks.onUnavailable(unavailable.status, unavailable);
			return;
		}
		const available = snapshots as Extract<
			ContinuationDependencySnapshot<unknown>,
			{ status: 'available' }
		>[];
		const publications = available.map(({ generation, version }) => ({ generation, version }));
		if (samePublications(lastPublications, publications)) return;
		lastPublications = publications;
		callbacks.onReady({
			values: available.map((snapshot) => snapshot.value),
			publications
		});
	};
	const schedule = (): void => {
		if (disposed || scheduled) return;
		scheduled = true;
		// The reactive scheduler deduplicates this computation and runs it after every dependency
		// notification in the current invalidation wave has published its new version.
		scheduleWork(evaluate);
	};
	// Subscribe before the first read so a source cannot publish between observation and ownership.
	const subscriptions = sources.map((source) => source.subscribe(schedule));
	return {
		evaluate,
		[Symbol.dispose]() {
			if (disposed) return;
			disposed = true;
			for (const subscription of subscriptions) subscription[Symbol.dispose]();
		}
	};
}

function samePublications(
	left: readonly Readonly<{ generation: number; version: number }>[] | undefined,
	right: readonly Readonly<{ generation: number; version: number }>[]
): boolean {
	return (
		left?.length === right.length &&
		right.every(
			(publication, index) =>
				publication.generation === left[index]!.generation &&
				publication.version === left[index]!.version
		)
	);
}
