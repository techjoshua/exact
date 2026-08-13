import type { ComponentInstance } from './contracts.js';

/** Coordinates component task settlement with an owning renderer. */
export type TaskObserver = {
	register(promise: Promise<unknown>, instance: ComponentInstance<any>): void;
	/** Runs one root task generation under renderer-owned concurrency control. */
	runTask?<T>(work: () => Promise<T>): Promise<T>;
	/** Retains a constructed component for the lifetime of an owning renderer. */
	retain?(instance: ComponentInstance<any>): void;
};
