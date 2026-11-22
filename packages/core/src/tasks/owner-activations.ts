import type { AnyTaskFunction } from './contracts.js';
import type { TaskOwnerRecord } from './frame-contracts.js';

/** Defers compiler-owned setup activations until a framework host restores resumable state. */
export function deferTaskOwnerActivations(owner: TaskOwnerRecord): void {
	owner.activationsDeferred = true;
}

/**
 * Arms deferred setup activations after resumption, optionally suppressing the first generation
 * when SSR already settled the compiler-owned continuation. Pending continuations can
 * start after the synchronous adoption turn, once their server fallback has been claimed.
 */
export function releaseTaskOwnerActivations(
	owner: TaskOwnerRecord,
	skipInitial: (task: AnyTaskFunction) => boolean,
	afterAdoption?: (task: AnyTaskFunction) => boolean
): void {
	owner.activationsDeferred = false;
	for (const registration of owner.activationRegistrations) {
		const skip = skipInitial(registration.task);
		if (skip || !afterAdoption?.(registration.task)) {
			registration.start(skip);
			continue;
		}
		const pending = Promise.resolve().then(() => {
			if (!owner.disposed && owner.activationRegistrations.has(registration))
				registration.start(false);
		});
		owner.observeSettlement?.(pending);
		void pending.catch(() => undefined);
	}
}
