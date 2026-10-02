/** Compiler helper registration shares the reactive transaction registry without loading its engine. */
export {
	registerPendingReactiveHelper as registerTaskHelper,
	registerPendingReactiveHelperReceiver as registerTaskHelperReceiver,
	pendingReactiveHelperVariant as compiledTaskHelperVariant
} from '@exactjs/reactive/framework/helper-companions';
export type { PendingReactiveHelperVariant as CompiledTaskHelperVariant } from '@exactjs/reactive/framework/helper-companions';
export { createPendingReactiveHelperObject as createTaskHelperObject } from '@exactjs/reactive/framework/helper-companions';
export type { PendingReactiveHelperObject as CompiledTaskHelperObject } from '@exactjs/reactive/framework/helper-companions';
