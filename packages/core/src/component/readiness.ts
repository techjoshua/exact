import { unwrap } from '@exactjs/reactive';
import { ReadinessContext } from './contexts.js';
import type {
	BlockingWork,
	ComponentInstance,
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
	const entries = new Set<Entry>();
	const waiters = new Set<
		(value: { readonly generation: number; readonly retry: boolean }) => void
	>();
	const pendingCount = () => {
		let count = 0;
		for (const entry of entries) if (entry.pending) count++;
		return count;
	};
	const publish = (): void => {
		const pending = pendingCount();
		onPendingChange(pending, generation, generationNeedsRetry);
		if (pending) return;
		const result = Object.freeze({ generation, retry: generationNeedsRetry });
		for (const resolve of waiters) resolve(result);
		waiters.clear();
	};
	const finalize = (entry: Entry, commit: boolean): void => {
		if (!entry.active) return;
		entry.active = false;
		entries.delete(entry);
		if (commit) entry.work.commit?.();
		else entry.work.discard?.();
		publish();
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
				if (work.retry) generationNeedsRetry = true;
				publish();
				const settle = () => {
					if (!entry.active || !entry.pending || disposed || boundaryGeneration !== generation)
						return;
					entry.pending = false;
					if (options.commitSettled) {
						entry.active = false;
						entries.delete(entry);
						entry.work.commit?.();
					}
					publish();
				};
				Promise.resolve(work.settlement).then(settle, settle);
				return registration;
			}
		},
		get generation() {
			return generation;
		},
		get pending() {
			return pendingCount();
		},
		beginGeneration() {
			for (const entry of [...entries]) finalize(entry, false);
			generation++;
			generationNeedsRetry = false;
			return generation;
		},
		whenReady() {
			if (!pendingCount())
				return Promise.resolve(Object.freeze({ generation, retry: generationNeedsRetry }));
			return new Promise((resolve) => waiters.add(resolve));
		},
		commitGeneration() {
			for (const entry of [...entries]) finalize(entry, true);
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			for (const entry of [...entries]) finalize(entry, false);
			publish();
		}
	};
	return coordinator;
}

/** Resolves the nearest readiness context inherited by a component instance. */
export function componentReadinessContext(
	instance: ComponentInstance<any> | undefined
): ReadinessContextValue | undefined {
	for (let cursor = instance; cursor; cursor = cursor.parent) {
		if (cursor.contexts.has(ReadinessContext.id))
			return unwrap(cursor.contexts.get(ReadinessContext.id)) as ReadinessContextValue;
	}
	return undefined;
}
