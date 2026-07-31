import type { TaskOwner } from './contracts.js';
import { createTaskOwnerRecord } from './frame-runtime.js';

/** Creates an explicit durable owner for cross-root task concurrency and cancellation. */
export function createTaskOwner(options?: { readonly label?: string }): TaskOwner {
	return createTaskOwnerRecord(options?.label);
}
