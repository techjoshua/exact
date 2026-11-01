import { unwrap } from '@exactjs/reactive/framework/runtime';
import { ReadinessContext } from './contexts.js';
import {
	attemptCleanup,
	createCleanupFailure,
	recordCleanupFailure,
	throwCleanupFailure
} from '../cleanup.js';
import type {
	AnyComponentInstance,
	BlockingWork,
	ReadinessContextValue,
	ReadinessRegistration
} from './contracts.js';

/** Coordinates blocking work for one current boundary candidate. */
export type ReadinessCoordinator = {
	readonly context: ReadinessContextValue;
	readonly generation: number;
	readonly pending: number;
	beginGeneration(): number;
	whenReady(): Promise<{ readonly generation: number; readonly retry: boolean }>;
	commitGeneration(): void;
	dispose(): void;
};

/** Controls how a readiness coordinator publishes settled candidate work. */
export type ReadinessCoordinatorOptions = {
	/**
	 * Publishes each settled registration immediately.
	 *
	 * Async SSR uses this mode because its candidate state is isolated and must settle before HTML
	 * is emitted. Connected DOM boundaries leave this disabled and publish the whole generation
	 * atomically during commit.
	 */
	readonly commitSettled?: boolean;
};

/**
 * Creates a generation-fenced readiness coordinator.
 *
 * Registrations observe settlement but never own or cancel the underlying task. Beginning a new
 * generation invalidates prior tokens, preventing stale promise settlement from revealing it.
 */
export function createReadinessCoordinator(
	onPendingChange: (pending: number, generation: number, retry: boolean) => void,
	options: ReadinessCoordinatorOptions = {}
): ReadinessCoordinator {
	type Entry = {
		active: boolean;
		pending: boolean;
		readonly work: BlockingWork;
		readonly registration: ReadinessRegistration;
	};
	let generation = 0;
	let disposed = false;
	let generationNeedsRetry = false;
	let publicationFailure: { error: unknown } | undefined;
	let pendingRegistrations = 0;
	const entries = new Set<Entry>();
	const waiters = new Set<{
		resolve(value: { readonly generation: number; readonly retry: boolean }): void;
		reject(error: unknown): void;
	}>();
	const publish = (settlement = false): void => {
		const failure = createCleanupFailure();
		attemptCleanup(failure, () =>
			onPendingChange(pendingRegistrations, generation, generationNeedsRetry)
		);
		if (settlement && failure.failed) publicationFailure ??= { error: failure.error };
		// Notifications can synchronously register more work, so inspect the current count afterward.
		if (!pendingRegistrations || publicationFailure) {
			const result = Object.freeze({ generation, retry: generationNeedsRetry });
			for (const waiter of waiters) {
				if (publicationFailure) waiter.reject(publicationFailure.error);
				else waiter.resolve(result);
			}
			waiters.clear();
		}
		if (!settlement) throwCleanupFailure(failure);
	};
	const finalize = (entry: Entry, commit: boolean): void => {
		if (!entry.active) return;
		entry.active = false;
		if (entry.pending) {
			entry.pending = false;
			pendingRegistrations--;
		}
		entries.delete(entry);
		const failure = createCleanupFailure();
		attemptCleanup(failure, () => {
			if (commit) entry.work.commit?.();
			else entry.work.discard?.();
		});
		if (commit && failure.failed) publicationFailure ??= { error: failure.error };
		attemptCleanup(failure, publish);
		throwCleanupFailure(failure);
	};
	const coordinator: ReadinessCoordinator = {
		context: {
			get generation() {
				return generation;
			},
			register(work) {
				const boundaryGeneration = generation;
				const registration: ReadinessRegistration = {
					boundaryGeneration,
					settlement: work.settlement,
					cancel() {
						finalize(entry, false);
					}
				};
				const entry: Entry = {
					active: !disposed,
					pending: !disposed,
					work,
					registration
				};
				if (!entry.active) return registration;
				entries.add(entry);
				pendingRegistrations++;
				if (work.retry) generationNeedsRetry = true;
				const settle = () => {
					if (!entry.active || !entry.pending || disposed || boundaryGeneration !== generation)
						return;
					entry.pending = false;
					pendingRegistrations--;
					if (options.commitSettled) {
						entry.active = false;
						entries.delete(entry);
						try {
							entry.work.commit?.();
						} catch (error) {
							publicationFailure ??= { error };
						}
					}
					publish(true);
				};
				Promise.resolve(work.settlement).then(settle, settle);
				publish();
				return registration;
			}
		},
		get generation() {
			return generation;
		},
		get pending() {
			return pendingRegistrations;
		},
		beginGeneration() {
			const failure = createCleanupFailure();
			const previous = [...entries];
			generation++;
			generationNeedsRetry = false;
			publicationFailure = undefined;
			for (const entry of previous) attemptCleanup(failure, () => finalize(entry, false));
			throwCleanupFailure(failure);
			return generation;
		},
		whenReady() {
			if (publicationFailure) return Promise.reject(publicationFailure.error);
			if (!pendingRegistrations)
				return Promise.resolve(Object.freeze({ generation, retry: generationNeedsRetry }));
			return new Promise((resolve, reject) => waiters.add({ resolve, reject }));
		},
		commitGeneration() {
			const failure = createCleanupFailure();
			if (publicationFailure) recordCleanupFailure(failure, publicationFailure.error);
			for (const entry of [...entries]) attemptCleanup(failure, () => finalize(entry, true));
			throwCleanupFailure(failure);
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			const failure = createCleanupFailure();
			for (const entry of [...entries]) attemptCleanup(failure, () => finalize(entry, false));
			attemptCleanup(failure, publish);
			throwCleanupFailure(failure);
		}
	};
	return coordinator;
}

/** Resolves the nearest readiness context inherited by a component instance. */
export function componentReadinessContext(
	instance: AnyComponentInstance | undefined
): ReadinessContextValue | undefined {
	for (let cursor = instance; cursor; cursor = cursor.parent) {
		if (cursor.contexts.has(ReadinessContext.id))
			return unwrap(cursor.contexts.get(ReadinessContext.id)) as ReadinessContextValue;
	}
	return undefined;
}
