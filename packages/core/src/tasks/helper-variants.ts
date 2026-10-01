/** Compiler helper registration shares the reactive transaction registry without loading its engine. */
export {
	registerPendingReactiveHelper as registerTaskHelper,
	pendingReactiveHelperVariant as compiledTaskHelperVariant
} from '@exactjs/reactive/framework/helper-companions';
export type { PendingReactiveHelperVariant as CompiledTaskHelperVariant } from '@exactjs/reactive/framework/helper-companions';
