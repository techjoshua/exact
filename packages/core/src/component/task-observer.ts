import type { AnyComponentInstance } from './contracts.js';

/** Coordinates component task settlement with an owning renderer. */
export type TaskObserver = {
	register(promise: Promise<unknown>, instance: AnyComponentInstance): void;
	/** Runs one root task generation under renderer-owned concurrency control. */
	runTask?<T>(work: () => Promise<T>): Promise<T>;
	/** Retains a constructed component for the lifetime of an owning renderer. */
	retain?(instance: AnyComponentInstance): void;
};
