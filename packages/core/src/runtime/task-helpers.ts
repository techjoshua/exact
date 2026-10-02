/** @internal Compiler-owned helper companions retain public callable identity and invocation ownership. */
export { taskHelperIntrinsics } from '../tasks/helper-intrinsics.js';
export {
	registerTaskHelper,
	registerTaskHelperReceiver,
	createTaskHelperObject
} from '../tasks/helper-variants.js';
export type { CompiledTaskHelperObject } from '../tasks/helper-variants.js';
export type { CompiledTaskState } from '../tasks/pending-state.js';
