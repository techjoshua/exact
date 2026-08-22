import type { AnyTaskFunction } from './contracts.js';
import type { TaskOwnerRecord } from './frame-contracts.js';

/** Defers compiler-owned setup activations until a framework host restores resumable state. */
export function deferTaskOwnerActivations(owner: TaskOwnerRecord): void {
	owner.activationsDeferred = true;
}

/**
 * Arms deferred setup activations after resumption, optionally suppressing the first generation
 * when SSR already settled the compiler-owned continuation.
 */
export function releaseTaskOwnerActivations(
	owner: TaskOwnerRecord,
	skipInitial: (task: AnyTaskFunction) => boolean
): void {
	owner.activationsDeferred = false;
	for (const registration of owner.activationRegistrations) {
		registration.start(skipInitial(registration.task));
	}
}
