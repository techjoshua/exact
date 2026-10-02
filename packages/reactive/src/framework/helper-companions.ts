/** Lightweight registration preserves ordinary helper identity without importing transaction execution. */
export {
	registerPendingReactiveHelper,
	registerPendingReactiveHelperReceiver,
	pendingReactiveHelperVariant
} from '../pending/helper-variants.js';
export type { PendingReactiveHelperVariant } from '../pending/helper-variants.js';
export type { PendingReactiveState } from '../pending/pending-state-contract.js';
export { createPendingReactiveHelperObject } from '../pending/helper-object-capture.js';
export type { PendingReactiveHelperObject } from '../pending/helper-object-capture.js';
